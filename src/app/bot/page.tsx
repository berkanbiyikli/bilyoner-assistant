'use client';

/**
 * Bot Dashboard - Kasa Takip Merkezi
 * 
 * Kasa durumu, aktif kupon, geçmiş ve manuel kontroller
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Bot, 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  History,
  Play,
  RefreshCw,
  Twitter,
  Loader2,
  CheckCircle,
  XCircle,
  Target,
  Percent,
  DollarSign,
  BarChart3,
  Clock,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { useBankrollStore, getBankrollStats } from '@/lib/bot/bankroll-store';
import type { BotCoupon, BankrollHistoryItem } from '@/lib/bot/types';

export default function BotDashboard() {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Zustand store
  const {
    balance,
    initialBalance,
    totalBets,
    wonBets,
    lostBets,
    totalStaked,
    totalWon,
    activeCoupon,
    history,
    resetBankroll,
  } = useBankrollStore();
  
  // İstatistikler
  const profitLoss = balance - initialBalance;
  const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
  const roi = totalStaked > 0 ? ((totalWon - totalStaked) / totalStaked) * 100 : 0;
  
  // Bot'u çalıştır
  const runBot = async () => {
    setIsRunning(true);
    setLastResult(null);
    setLogs([]);
    
    try {
      const res = await fetch('/api/bot/run', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        setLastResult(data.message);
        setLogs(data.logs || []);
      } else {
        setLastResult(`Hata: ${data.error}`);
      }
    } catch (error) {
      setLastResult('Bağlantı hatası');
    } finally {
      setIsRunning(false);
    }
  };
  
  // Kasayı sıfırla
  const handleReset = () => {
    if (confirm('Kasayı sıfırlamak istediğinize emin misiniz? Tüm geçmiş silinecek.')) {
      resetBankroll();
      setLastResult('Kasa sıfırlandı: 500 TL');
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-zinc-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/" 
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-blue-500" />
                <span className="text-xl font-bold">Bot Dashboard</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Sıfırla</span>
              </button>
              <button
                onClick={runBot}
                disabled={isRunning}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Çalışıyor...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>Bot Çalıştır</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Kasa Özeti */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Bakiye */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Wallet className="h-4 w-4" />
              <span>Güncel Kasa</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {balance.toFixed(2)} <span className="text-lg text-zinc-400">TL</span>
            </div>
          </div>
          
          {/* Kar/Zarar */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              {profitLoss >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span>Kar/Zarar</span>
            </div>
            <div className={`text-3xl font-bold ${profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)} <span className="text-lg">TL</span>
            </div>
          </div>
          
          {/* Kazanma Oranı */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Target className="h-4 w-4" />
              <span>Kazanma Oranı</span>
            </div>
            <div className="text-3xl font-bold text-white">
              %{winRate.toFixed(1)}
            </div>
            <div className="text-sm text-zinc-500">
              {wonBets}W / {lostBets}L
            </div>
          </div>
          
          {/* ROI */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Percent className="h-4 w-4" />
              <span>ROI</span>
            </div>
            <div className={`text-3xl font-bold ${roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </div>
          </div>
        </div>
        
        {/* Aktif Kupon */}
        {activeCoupon && (
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/30 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
              <h2 className="text-lg font-bold">Aktif Kupon</h2>
              <span className="text-sm text-zinc-400">{activeCoupon.id}</span>
            </div>
            
            <div className="space-y-3">
              {activeCoupon.matches.map((match, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-900/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </span>
                    <span className="font-medium">{match.homeTeam} vs {match.awayTeam}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm">
                      {match.prediction.label}
                    </span>
                    <span className="text-yellow-500 font-bold">
                      {match.prediction.odds.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
              <div className="flex gap-6">
                <div>
                  <span className="text-zinc-400 text-sm">Toplam Oran</span>
                  <p className="text-xl font-bold text-yellow-500">{activeCoupon.totalOdds.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-zinc-400 text-sm">Yatırılan</span>
                  <p className="text-xl font-bold">{activeCoupon.stake.toFixed(2)} TL</p>
                </div>
                <div>
                  <span className="text-zinc-400 text-sm">Potansiyel</span>
                  <p className="text-xl font-bold text-green-500">{activeCoupon.potentialWin.toFixed(2)} TL</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Son İşlem Sonucu */}
        {lastResult && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="h-5 w-5 text-blue-500" />
              <h3 className="font-bold">Son İşlem</h3>
            </div>
            <p className="text-zinc-300">{lastResult}</p>
            
            {logs.length > 0 && (
              <div className="mt-3 p-3 bg-zinc-950 rounded-lg text-xs font-mono text-zinc-400 max-h-40 overflow-auto">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* İstatistikler */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="text-zinc-400 text-sm mb-1">Toplam Bahis</div>
            <div className="text-2xl font-bold">{totalBets}</div>
          </div>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="text-zinc-400 text-sm mb-1">Toplam Yatırılan</div>
            <div className="text-2xl font-bold">{totalStaked.toFixed(2)} TL</div>
          </div>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <div className="text-zinc-400 text-sm mb-1">Toplam Kazanç</div>
            <div className="text-2xl font-bold text-green-500">{totalWon.toFixed(2)} TL</div>
          </div>
        </div>
        
        {/* Geçmiş */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-zinc-400" />
            <h2 className="text-lg font-bold">İşlem Geçmişi</h2>
          </div>
          
          {history.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">Henüz işlem yok</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {history.slice(0, 20).map((item: BankrollHistoryItem) => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {item.type === 'bet_won' && <CheckCircle className="h-5 w-5 text-green-500" />}
                    {item.type === 'bet_lost' && <XCircle className="h-5 w-5 text-red-500" />}
                    {item.type === 'bet_placed' && <DollarSign className="h-5 w-5 text-blue-500" />}
                    {item.type === 'deposit' && <TrendingUp className="h-5 w-5 text-green-500" />}
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(item.date).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${item.amount >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {item.amount >= 0 ? '+' : ''}{item.amount.toFixed(2)} TL
                    </p>
                    <p className="text-xs text-zinc-500">
                      Bakiye: {item.balanceAfter.toFixed(2)} TL
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Kupon Görseli Preview */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Twitter className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold">Kupon Görseli Önizleme</h2>
          </div>
          <div className="aspect-video bg-zinc-800 rounded-lg overflow-hidden">
            <img 
              src="/api/og/coupon?id=DEMO" 
              alt="Kupon Görseli"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-xs text-zinc-500 mt-2 text-center">
            Bu görsel Twitter&apos;a otomatik olarak eklenir
          </p>
        </div>
      </main>
    </div>
  );
}
