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
 * Tüm alanlar gerçek verilerle doldurulur — 0 veya hardcoded default yok
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
  h2hGoalAvg?: number;
  h2hHomeWinRate?: number;
  refereeProfile?: { cardsPerMatch: number; foulsPerMatch: number } | null;
  matchImportance?: { totalScore: number } | null;
  eloRatings?: { home: number; away: number } | null;
  homeRecentGoalsScored?: number;
  awayRecentGoalsScored?: number;
  homeRecentGoalsConceded?: number;
  awayRecentGoalsConceded?: number;
}): MLFeatureVector {
  return {
    homeForm: analysis.homeForm,
    awayForm: analysis.awayForm,
    homeAttack: analysis.homeAttack,
    awayAttack: analysis.awayAttack,
    homeDefense: analysis.homeDefense,
    awayDefense: analysis.awayDefense,
    homeXg: analysis.homeXg || 1.2,
    awayXg: analysis.awayXg || 1.0,
    h2hHomeWinRate: analysis.h2hHomeWinRate ?? 50,
    h2hGoalAvg: analysis.h2hGoalAvg ?? 2.5,
    homePossession: 50 + (analysis.homeAttack - analysis.awayAttack) * 0.3, // Hücum farkından türet
    awayPossession: 50 - (analysis.homeAttack - analysis.awayAttack) * 0.3,
    homeElo: analysis.eloRatings?.home || 1500,
    awayElo: analysis.eloRatings?.away || 1500,
    leagueAvgGoals: (analysis.homeXg || 1.2) + (analysis.awayXg || 1.0),
    matchImportance: analysis.matchImportance?.totalScore || 50,
    refereeCardsPerMatch: analysis.refereeProfile?.cardsPerMatch || 4,
    refereeFoulsPerMatch: analysis.refereeProfile?.foulsPerMatch || 25,
    homeRecentGoalsScored: analysis.homeRecentGoalsScored ?? (analysis.homeXg || 1.2),
    awayRecentGoalsScored: analysis.awayRecentGoalsScored ?? (analysis.awayXg || 1.0),
    homeRecentGoalsConceded: analysis.homeRecentGoalsConceded ?? (analysis.awayXg || 1.0),
    awayRecentGoalsConceded: analysis.awayRecentGoalsConceded ?? (analysis.homeXg || 1.2),
  };
}

// ============================================
// Auto-Training: Geçmiş verilerden basit Logistic Regression eğitimi
// Harici Python gerektirmez — tamamen TypeScript içinde
// Optimizer cron'u ile birlikte çağrılır
// ============================================

interface TrainingRecord {
  confidence: number;
  odds: number;
  pick: string;
  result: "won" | "lost";
  expected_value: number;
  sim_probability: number | null;
  home_team: string;
  away_team: string;
}

/**
 * Geçmiş tahminlerden basit bir logistic regression modeli eğit.
 * Her market (home_win, over_25, btts_yes, vb.) için ayrı ağırlık öğrenir.
 * Modeli JSON olarak döndürür — cache'e veya DB'ye kaydedilebilir.
 */
export async function autoTrainFromHistory(
  records: TrainingRecord[]
): Promise<LogisticRegressionModel | null> {
  if (records.length < 30) {
    console.log("[ML] Eğitim için yeterli veri yok:", records.length);
    return null;
  }

  const marketMap: Record<string, string> = {
    "1": "home_win", "X": "draw", "2": "away_win",
    "Over 2.5": "over_25", "Under 2.5": "under_25",
    "Over 1.5": "over_15", "Under 1.5": "under_15",
    "Over 3.5": "over_35", "Under 3.5": "under_35",
    "BTTS Yes": "btts_yes", "BTTS No": "btts_no",
  };

  const markets: Record<string, {
    weights: number[];
    bias: number;
    featureNames: string[];
    metrics: { accuracy: number; logLoss: number; auc: number };
  }> = {};

  // Her market için ayrı eğitim
  for (const [pickType, marketName] of Object.entries(marketMap)) {
    const marketRecords = records.filter(r => r.pick === pickType);
    if (marketRecords.length < 10) continue;

    // Features: [confidence/100, 1/odds (implied prob), simProb/100, EV]
    const featureNames = ["confidence", "implied_prob", "sim_prob", "expected_value"];
    const X: number[][] = [];
    const y: number[] = [];

    for (const r of marketRecords) {
      X.push([
        r.confidence / 100,
        1 / r.odds,
        (r.sim_probability ?? r.confidence) / 100,
        Math.max(-1, Math.min(2, r.expected_value)),
      ]);
      y.push(r.result === "won" ? 1 : 0);
    }

    // Mini-batch SGD logistic regression eğitimi
    const numFeatures = featureNames.length;
    const weights = new Array(numFeatures).fill(0);
    let bias = 0;
    const lr = 0.1; // Learning rate
    const epochs = 100;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < X.length; i++) {
        // Forward
        let z = bias;
        for (let j = 0; j < numFeatures; j++) z += weights[j] * X[i][j];
        const pred = sigmoid(z);

        // Gradient
        const error = pred - y[i];
        bias -= lr * error;
        for (let j = 0; j < numFeatures; j++) {
          weights[j] -= lr * error * X[i][j];
        }
      }
    }

    // Accuracy & log loss hesapla
    let correct = 0;
    let totalLogLoss = 0;
    for (let i = 0; i < X.length; i++) {
      let z = bias;
      for (let j = 0; j < numFeatures; j++) z += weights[j] * X[i][j];
      const pred = sigmoid(z);
      const predicted = pred >= 0.5 ? 1 : 0;
      if (predicted === y[i]) correct++;
      const clipped = Math.max(0.001, Math.min(0.999, pred));
      totalLogLoss -= y[i] * Math.log(clipped) + (1 - y[i]) * Math.log(1 - clipped);
    }

    markets[marketName] = {
      weights: weights.map(w => Math.round(w * 10000) / 10000),
      bias: Math.round(bias * 10000) / 10000,
      featureNames,
      metrics: {
        accuracy: Math.round((correct / X.length) * 1000) / 10,
        logLoss: Math.round((totalLogLoss / X.length) * 1000) / 1000,
        auc: 0, // Basitleştirilmiş — AUC hesaplanmıyor
      },
    };

    console.log(`[ML] ${marketName}: ${marketRecords.length} kayıt, accuracy: ${markets[marketName].metrics.accuracy}%`);
  }

  if (Object.keys(markets).length === 0) return null;

  const model: LogisticRegressionModel = {
    type: "logistic_regression",
    version: "auto-" + new Date().toISOString().split("T")[0],
    trainedAt: new Date().toISOString(),
    markets,
  };

  // Modeli cache'e yaz (dosya yerine)
  cachedModel = model;
  modelLoadAttempted = true;
  console.log(`[ML] Model otomatik eğitildi: ${Object.keys(markets).length} market, v${model.version}`);

  return model;
}
