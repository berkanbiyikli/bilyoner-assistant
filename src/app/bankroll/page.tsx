/**
 * Bankroll Management Page
 * Kasa yönetimi, Kelly hesaplayıcı, risk limitleri, performans
 */

'use client';

import { useState } from 'react';
import { BankrollDashboard } from '@/components/bankroll-dashboard';
import { KellyCalculator } from '@/components/kelly-calculator';
import { RiskLimitsPanel } from '@/components/risk-limits-panel';
import { PerformanceDashboard } from '@/components/performance-dashboard';
import { BetEntry } from '@/components/bet-entry';
import { BetSettler } from '@/components/bet-settler';
import { 
  Wallet, Calculator, Shield, BarChart3, Plus 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoSettle } from '@/hooks/useAutoSettle';

type TabKey = 'overview' | 'bet' | 'calculator' | 'performance';

const TABS = [
  { key: 'overview' as TabKey, label: 'Kasa', icon: Wallet, desc: 'Bakiye & P/L' },
  { key: 'bet' as TabKey, label: 'Bahis', icon: Plus, desc: 'Bahis gir' },
  { key: 'calculator' as TabKey, label: 'Hesapla', icon: Calculator, desc: 'Kelly' },
  { key: 'performance' as TabKey, label: 'Performans', icon: BarChart3, desc: 'İstatistik' },
];

export default function BankrollPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const { pendingCount } = useAutoSettle();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-24 pt-4">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Kasa <span className="gradient-text">Yönetimi</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Akıllı bankroll management ile kasanı koru ve büyüt
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-5 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex-1 justify-center min-w-0',
                isActive 
                  ? 'bg-background shadow-sm text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label}</span>
              {tab.key === 'bet' && pendingCount > 0 && (
                <span className="ml-1 bg-amber-500/20 text-amber-500 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <BankrollDashboard />
          <BetSettler />
          <RiskLimitsPanel />
        </div>
      )}

      {activeTab === 'bet' && (
        <div className="space-y-4">
          <BetEntry />
          <BetSettler />
        </div>
      )}

      {activeTab === 'calculator' && (
        <div className="space-y-4">
          <KellyCalculator />
          <RiskLimitsPanel />
        </div>
      )}

      {activeTab === 'performance' && (
        <PerformanceDashboard />
      )}
    </div>
  );
}
