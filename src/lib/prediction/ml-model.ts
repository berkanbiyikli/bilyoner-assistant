// ============================================
// ML Model Engine (Faz 4)
// Logistic Regression / Decision Tree — JSON tabanlı
// Server-side inference, Python ile eğitim
// ============================================

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---- Model Types ----

interface LogisticRegressionModel {
  type: "logistic_regression";
  version: string;
  trainedAt: string;
  markets: Record<string, {
    weights: number[];
    bias: number;
    featureNames: string[];
    metrics: { accuracy: number; logLoss: number; auc: number };
  }>;
}

interface DecisionTreeModel {
  type: "decision_tree";
  version: string;
  trainedAt: string;
  markets: Record<string, DecisionTreeNode>;
}

interface DecisionTreeNode {
  feature?: string;
  threshold?: number;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
  probability?: number; // leaf node
}

type MLModel = LogisticRegressionModel | DecisionTreeModel;

export interface MLFeatureVector {
  homeForm: number;
  awayForm: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  homeXg: number;
  awayXg: number;
  h2hHomeWinRate: number;
  h2hGoalAvg: number;
  homePossession: number;
  awayPossession: number;
  homeElo: number;
  awayElo: number;
  leagueAvgGoals: number;
  matchImportance: number;
  refereeCardsPerMatch: number;
  refereeFoulsPerMatch: number;
  homeRecentGoalsScored: number;
  awayRecentGoalsScored: number;
  homeRecentGoalsConceded: number;
  awayRecentGoalsConceded: number;
}

export interface MLPrediction {
  market: string;
  probability: number;
  confidence: number;
}

// ---- Model Loading ----

const MODEL_PATH = join(process.cwd(), "models", "prediction-model.json");
let cachedModel: MLModel | null = null;
let modelLoadAttempted = false;

function loadModel(): MLModel | null {
  if (cachedModel) return cachedModel;
  if (modelLoadAttempted) return null;

  modelLoadAttempted = true;

  try {
    if (!existsSync(MODEL_PATH)) {
      console.log("[ML] Model dosyası bulunamadı:", MODEL_PATH);
      return null;
    }

    const raw = readFileSync(MODEL_PATH, "utf-8");
    const model = JSON.parse(raw) as MLModel;
    cachedModel = model;
    console.log(`[ML] Model yüklendi: ${model.type} v${model.version} (${model.trainedAt})`);
    return model;
  } catch (error) {
    console.error("[ML] Model yüklenemedi:", error);
    return null;
  }
}

/** Model cache'ini temizle (yeni model yüklendiğinde) */
export function reloadModel(): void {
  cachedModel = null;
  modelLoadAttempted = false;
}

// ---- Sigmoid ----

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

// ---- Logistic Regression Inference ----

function predictLogistic(
  model: LogisticRegressionModel,
  features: MLFeatureVector,
  market: string
): number | null {
  const marketModel = model.markets[market];
  if (!marketModel) return null;

  const featureArray = marketModel.featureNames.map(name => {
    const val = features[name as keyof MLFeatureVector];
    return typeof val === "number" ? val : 0;
  });

  if (featureArray.length !== marketModel.weights.length) {
    console.warn(`[ML] Feature boyutu uyumsuz: ${featureArray.length} vs ${marketModel.weights.length}`);
    return null;
  }

  let z = marketModel.bias;
  for (let i = 0; i < featureArray.length; i++) {
    z += featureArray[i] * marketModel.weights[i];
  }

  return sigmoid(z);
}

// ---- Decision Tree Inference ----

function predictTree(node: DecisionTreeNode, features: MLFeatureVector): number {
  if (node.probability !== undefined) return node.probability;
  if (!node.feature || node.threshold === undefined || !node.left || !node.right) return 0.5;

  const val = features[node.feature as keyof MLFeatureVector];
  const featureVal = typeof val === "number" ? val : 0;

  return featureVal <= node.threshold
    ? predictTree(node.left, features)
    : predictTree(node.right, features);
}

// ---- Public API ----

const SUPPORTED_MARKETS = [
  "home_win", "draw", "away_win",
  "over_25", "under_25",
  "over_15", "under_15",
  "over_35", "under_35",
  "btts_yes", "btts_no",
];

/**
 * ML model mevcut ve yüklü mü?
 */
export function isMLModelAvailable(): boolean {
  return loadModel() !== null;
}

/**
 * Verilen özellik vektörü için tüm marketlerde ML tahminleri üret
 */
export function predictWithML(features: MLFeatureVector): MLPrediction[] {
  const model = loadModel();
  if (!model) return [];

  const predictions: MLPrediction[] = [];

  for (const market of SUPPORTED_MARKETS) {
    let prob: number | null = null;

    if (model.type === "logistic_regression") {
      prob = predictLogistic(model, features, market);
    } else if (model.type === "decision_tree") {
      const tree = model.markets[market];
      if (tree) {
        prob = predictTree(tree as DecisionTreeNode, features);
      }
    }

    if (prob !== null && prob >= 0 && prob <= 1) {
      predictions.push({
        market,
        probability: Math.round(prob * 1000) / 1000,
        confidence: Math.round(prob * 100),
      });
    }
  }

  return predictions;
}

/**
 * ML tahminini belirli bir pick type için al
 * engine.ts'deki hybridConfidence ile harmanlanacak
 */
export function getMLProbability(
  features: MLFeatureVector,
  pickType: string
): number | undefined {
  const marketMap: Record<string, string> = {
    "1": "home_win",
    "X": "draw",
    "2": "away_win",
    "Over 2.5": "over_25",
    "Under 2.5": "under_25",
    "Over 1.5": "over_15",
    "Under 1.5": "under_15",
    "Over 3.5": "over_35",
    "Under 3.5": "under_35",
    "BTTS Yes": "btts_yes",
    "BTTS No": "btts_no",
  };

  const market = marketMap[pickType];
  if (!market) return undefined;

  const model = loadModel();
  if (!model) return undefined;

  let prob: number | null = null;

  if (model.type === "logistic_regression") {
    prob = predictLogistic(model, features, market);
  } else if (model.type === "decision_tree") {
    const tree = model.markets[market];
    if (tree) {
      prob = predictTree(tree as DecisionTreeNode, features);
    }
  }

  return prob !== null ? prob * 100 : undefined; // % cinsinden döndür
}

/**
 * MatchAnalysis'ten feature vector oluştur
 */
export function buildFeatureVector(analysis: {
  homeForm: number;
  awayForm: number;
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  homeXg?: number;
  awayXg?: number;
  refereeProfile?: { cardsPerMatch: number; foulsPerMatch: number } | null;
  matchImportance?: { totalScore: number } | null;
  eloRatings?: { home: number; away: number } | null;
}): MLFeatureVector {
  return {
    homeForm: analysis.homeForm,
    awayForm: analysis.awayForm,
    homeAttack: analysis.homeAttack,
    awayAttack: analysis.awayAttack,
    homeDefense: analysis.homeDefense,
    awayDefense: analysis.awayDefense,
    homeXg: analysis.homeXg || 0,
    awayXg: analysis.awayXg || 0,
    h2hHomeWinRate: 0, // harici olarak doldurulacak
    h2hGoalAvg: 0, // harici olarak doldurulacak
    homePossession: 50, // varsayılan
    awayPossession: 50,
    homeElo: analysis.eloRatings?.home || 1500,
    awayElo: analysis.eloRatings?.away || 1500,
    leagueAvgGoals: 2.6, // varsayılan
    matchImportance: analysis.matchImportance?.totalScore || 50,
    refereeCardsPerMatch: analysis.refereeProfile?.cardsPerMatch || 4,
    refereeFoulsPerMatch: analysis.refereeProfile?.foulsPerMatch || 25,
    homeRecentGoalsScored: 0, // harici olarak doldurulacak
    awayRecentGoalsScored: 0,
    homeRecentGoalsConceded: 0,
    awayRecentGoalsConceded: 0,
  };
}
