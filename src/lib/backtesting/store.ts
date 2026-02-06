/**
 * Backtesting Store
 * Tahminleri kaydet ve sonuçlarını takip et
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PredictionRecord, BacktestMetrics } from './types';

interface BacktestStore {
  predictions: PredictionRecord[];
  
  // Tahmin kaydet
  addPrediction: (prediction: Omit<PredictionRecord, 'id' | 'createdAt' | 'status'>) => void;
  
  // Sonuç güncelle (maç bittiğinde)
  settlePrediction: (
    fixtureId: number,
    result: { actualResult: 'home' | 'away' | 'draw'; actualScore: { home: number; away: number } }
  ) => void;
  
  // Toplu sonuç güncelleme (API'den çekilen bitmiş maçlar için)
  batchSettle: (settlements: Array<{ fixtureId: number; result: any }>) => void;
  
  // Metrikler hesapla
  getMetrics: (period?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'all') => BacktestMetrics;
  
  // Temizle
  clearOldPredictions: (daysToKeep: number) => void;
}

export const useBacktestStore = create<BacktestStore>()(
  persist(
    (set, get) => ({
      predictions: [],
      
      addPrediction: (prediction) => {
        const newPrediction: PredictionRecord = {
          ...prediction,
          id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          createdAt: Date.now(),
          status: 'pending',
        };
        
        set((state) => ({
          predictions: [...state.predictions, newPrediction],
        }));
      },
      
      settlePrediction: (fixtureId, result) => {
        set((state) => ({
          predictions: state.predictions.map((pred) => {
            if (pred.fixtureId !== fixtureId || pred.status !== 'pending') return pred;
            
            const { actualResult, actualScore } = result;
            
            // Tahmin doğru mu kontrol et
            const isCorrect = pred.predictedResult === actualResult;
            
            // Kar/zarar hesapla (100 birim bahis varsayımı)
            const profitLoss = isCorrect ? (pred.suggestedOdds - 1) * 100 : -100;
            
            return {
              ...pred,
              actualResult,
              actualScore,
              isCorrect,
              profitLoss,
              status: isCorrect ? 'won' : 'lost',
              settledAt: Date.now(),
            } as PredictionRecord;
          }),
        }));
      },
      
      batchSettle: (settlements) => {
        settlements.forEach(({ fixtureId, result }) => {
          get().settlePrediction(fixtureId, result);
        });
      },
      
      getMetrics: (period = 'all') => {
        const { predictions } = get();
        
        // Tarih filtreleme
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        let filteredPredictions = predictions;
        
        switch (period) {
          case 'today': {
            const todayStart = new Date().setHours(0, 0, 0, 0);
            filteredPredictions = predictions.filter(p => p.createdAt >= todayStart);
            break;
          }
          case 'yesterday': {
            const yesterdayStart = new Date(now - dayMs).setHours(0, 0, 0, 0);
            const yesterdayEnd = new Date(now - dayMs).setHours(23, 59, 59, 999);
            filteredPredictions = predictions.filter(
              p => p.createdAt >= yesterdayStart && p.createdAt <= yesterdayEnd
            );
            break;
          }
          case 'last7days':
            filteredPredictions = predictions.filter(p => p.createdAt >= now - 7 * dayMs);
            break;
          case 'last30days':
            filteredPredictions = predictions.filter(p => p.createdAt >= now - 30 * dayMs);
            break;
        }
        
        // Temel sayılar
        const totalPredictions = filteredPredictions.length;
        const settled = filteredPredictions.filter(p => p.status !== 'pending');
        const settledPredictions = settled.length;
        const pendingPredictions = totalPredictions - settledPredictions;
        const wonPredictions = settled.filter(p => p.status === 'won').length;
        const lostPredictions = settled.filter(p => p.status === 'lost').length;
        
        const winRate = settledPredictions > 0 ? (wonPredictions / settledPredictions) * 100 : 0;
        const lossRate = settledPredictions > 0 ? (lostPredictions / settledPredictions) * 100 : 0;
        
        // Karlılık
        const totalStake = settledPredictions * 100; // Her maça 100 birim
        const totalReturn = settled.reduce((sum, p) => sum + (p.profitLoss || 0) + 100, 0);
        const netProfit = totalReturn - totalStake;
        const roi = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;
        const yieldPercent = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;
        
        // Model bazlı metrikler
        const byModel: BacktestMetrics['byModel'] = {};
        const models = [...new Set(settled.map(p => p.modelUsed))];
        
        models.forEach((model) => {
          const modelPreds = settled.filter(p => p.modelUsed === model);
          const modelWon = modelPreds.filter(p => p.status === 'won').length;
          const modelStake = modelPreds.length * 100;
          const modelReturn = modelPreds.reduce((sum, p) => sum + (p.profitLoss || 0) + 100, 0);
          const modelProfit = modelReturn - modelStake;
          
          byModel[model] = {
            total: modelPreds.length,
            won: modelWon,
            winRate: modelPreds.length > 0 ? (modelWon / modelPreds.length) * 100 : 0,
            roi: modelStake > 0 ? (modelProfit / modelStake) * 100 : 0,
          };
        });
        
        // Pazar bazlı metrikler
        const byMarket: BacktestMetrics['byMarket'] = {};
        const markets = [...new Set(settled.map(p => p.market))];
        
        markets.forEach((market) => {
          const marketPreds = settled.filter(p => p.market === market);
          const marketWon = marketPreds.filter(p => p.status === 'won').length;
          const marketStake = marketPreds.length * 100;
          const marketReturn = marketPreds.reduce((sum, p) => sum + (p.profitLoss || 0) + 100, 0);
          const marketProfit = marketReturn - marketStake;
          
          byMarket[market] = {
            total: marketPreds.length,
            won: marketWon,
            winRate: marketPreds.length > 0 ? (marketWon / marketPreds.length) * 100 : 0,
            roi: marketStake > 0 ? (marketProfit / marketStake) * 100 : 0,
          };
        });
        
        // Güven aralığı bazlı
        const byConfidence: BacktestMetrics['byConfidence'] = {
          '50-59': { total: 0, won: 0, winRate: 0 },
          '60-69': { total: 0, won: 0, winRate: 0 },
          '70-79': { total: 0, won: 0, winRate: 0 },
          '80-89': { total: 0, won: 0, winRate: 0 },
          '90-100': { total: 0, won: 0, winRate: 0 },
        };
        
        settled.forEach((pred) => {
          const conf = pred.confidence;
          let key: keyof typeof byConfidence = '50-59';
          if (conf >= 90) key = '90-100';
          else if (conf >= 80) key = '80-89';
          else if (conf >= 70) key = '70-79';
          else if (conf >= 60) key = '60-69';
          
          byConfidence[key].total++;
          if (pred.status === 'won') byConfidence[key].won++;
        });
        
        // Win rate hesapla
        Object.keys(byConfidence).forEach((key) => {
          const k = key as keyof typeof byConfidence;
          const data = byConfidence[k];
          data.winRate = data.total > 0 ? (data.won / data.total) * 100 : 0;
        });
        
        // Günlük performans (son 7 ve 30 gün)
        const calculateDailyPerformance = (days: number) => {
          const result: BacktestMetrics['last7Days'] = [];
          
          for (let i = 0; i < days; i++) {
            const date = new Date(now - i * dayMs);
            const dateStr = date.toISOString().split('T')[0];
            const dayStart = new Date(date).setHours(0, 0, 0, 0);
            const dayEnd = new Date(date).setHours(23, 59, 59, 999);
            
            const dayPreds = predictions.filter(
              p => p.createdAt >= dayStart && p.createdAt <= dayEnd
            );
            
            const daySettled = dayPreds.filter(p => p.status !== 'pending');
            const dayWon = daySettled.filter(p => p.status === 'won').length;
            const dayLost = daySettled.filter(p => p.status === 'lost').length;
            const dayPending = dayPreds.length - daySettled.length;
            
            const dayStake = daySettled.length * 100;
            const dayReturn = daySettled.reduce((sum, p) => sum + (p.profitLoss || 0) + 100, 0);
            const dayProfit = dayReturn - dayStake;
            
            result.unshift({
              date: dateStr,
              total: dayPreds.length,
              won: dayWon,
              lost: dayLost,
              pending: dayPending,
              winRate: daySettled.length > 0 ? (dayWon / daySettled.length) * 100 : 0,
              netProfit: dayProfit,
              roi: dayStake > 0 ? (dayProfit / dayStake) * 100 : 0,
            });
          }
          
          return result;
        };
        
        return {
          totalPredictions,
          settledPredictions,
          pendingPredictions,
          winRate,
          lossRate,
          totalStake,
          totalReturn,
          netProfit,
          roi,
          yield: yieldPercent,
          byModel,
          byMarket,
          byConfidence,
          last7Days: calculateDailyPerformance(7),
          last30Days: calculateDailyPerformance(30),
        };
      },
      
      clearOldPredictions: (daysToKeep) => {
        const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
        set((state) => ({
          predictions: state.predictions.filter((p) => p.createdAt >= cutoffTime),
        }));
      },
    }),
    {
      name: 'bilyoner-backtest-store',
      version: 1,
    }
  )
);
