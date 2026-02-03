'use client';

/**
 * Maç Detay Sayfası
 * Basitleştirilmiş versiyon - null kontrolları ile
 */

import { useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  Target,
  Swords,
  Clock,
  AlertCircle,
  Loader2,
  Activity
} from 'lucide-react';
import { AdvancedAnalysisPanel } from '@/components/advanced-analysis-panel';
import { ShareAnalysis } from '@/components/share-analysis';

export default function MatchDetailPage() {
  const params = useParams();
  const matchId = params?.id as string;
  const analysisRef = useRef<HTMLDivElement>(null);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`/api/match/${matchId}`);
      if (!res.ok) throw new Error('Maç bilgisi alınamadı');
      return res.json();
    },
    enabled: !!matchId,
    refetchInterval: 60000,
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  
  if (error || !data?.data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center text-white">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg">Maç bilgisi alınamadı</p>
        <Link href="/" className="mt-4 text-blue-400 hover:underline">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }
  
  const match = data.data;
  const fixture = match?.fixture;
  const h2h = match?.h2h;
  const form = match?.form;
  const prediction = match?.prediction;
  const odds = match?.odds;
  
  if (!fixture) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex flex-col items-center justify-center text-white">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg">Maç verisi bulunamadı</p>
        <Link href="/" className="mt-4 text-blue-400 hover:underline">
          Ana sayfaya dön
        </Link>
      </div>
    );
  }
  
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
                {fixture?.league?.logo && (
                  <Image 
                    src={fixture.league.logo} 
                    alt={fixture.league?.name || 'League'}
                    width={24}
                    height={24}
                    className="rounded"
                    unoptimized
                    crossOrigin="anonymous"
                  />
                )}
                <span className="text-sm text-zinc-400">
                  {fixture?.league?.country || ''} • {fixture?.league?.name || ''}
                </span>
              </div>
            </div>
            <ShareAnalysis
              targetRef={analysisRef}
              matchTitle={`${fixture?.homeTeam?.name || ''} vs ${fixture?.awayTeam?.name || ''}`}
              homeTeam={fixture?.homeTeam?.name || 'Ev Sahibi'}
              awayTeam={fixture?.awayTeam?.name || 'Deplasman'}
            />
          </div>
        </div>
      </header>
      
      <main ref={analysisRef} className="container mx-auto px-4 py-6 space-y-6">
        {/* Match Header */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Calendar className="h-4 w-4" />
              <span>{fixture?.date || '-'}</span>
              <Clock className="h-4 w-4 ml-2" />
              <span>{fixture?.time || '-'}</span>
            </div>
            {fixture?.status?.isLive && (
              <span className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                {fixture?.status?.elapsed || 0}&apos;
              </span>
            )}
            {fixture?.status?.isFinished && (
              <span className="px-2 py-1 bg-zinc-700 text-zinc-300 rounded-full text-sm">
                Bitti
              </span>
            )}
          </div>
          
          {/* Teams */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <div className="text-center">
              {fixture?.homeTeam?.logo && (
                <Image 
                  src={fixture.homeTeam.logo} 
                  alt={fixture.homeTeam?.name || 'Home'}
                  width={64}
                  height={64}
                  className="mx-auto mb-2"
                  unoptimized
                  crossOrigin="anonymous"
                />
              )}
              <p className="font-bold text-lg">{fixture?.homeTeam?.name || 'Ev Sahibi'}</p>
              {form?.home?.results && (
                <div className="flex justify-center gap-1 mt-2">
                  {form.home.results.map((r: string, i: number) => (
                    <span 
                      key={i}
                      className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                        r === 'W' ? 'bg-green-500' : r === 'L' ? 'bg-red-500' : 'bg-zinc-500'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-center">
              {fixture?.score?.home !== null && fixture?.score?.home !== undefined ? (
                <div className="text-4xl font-bold">
                  {fixture.score.home} - {fixture.score.away}
                </div>
              ) : (
                <div className="text-3xl font-bold text-zinc-500">vs</div>
              )}
            </div>
            
            <div className="text-center">
              {fixture?.awayTeam?.logo && (
                <Image 
                  src={fixture.awayTeam.logo} 
                  alt={fixture.awayTeam?.name || 'Away'}
                  width={64}
                  height={64}
                  className="mx-auto mb-2"
                  unoptimized
                  crossOrigin="anonymous"
                />
              )}
              <p className="font-bold text-lg">{fixture?.awayTeam?.name || 'Deplasman'}</p>
              {form?.away?.results && (
                <div className="flex justify-center gap-1 mt-2">
                  {form.away.results.map((r: string, i: number) => (
                    <span 
                      key={i}
                      className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                        r === 'W' ? 'bg-green-500' : r === 'L' ? 'bg-red-500' : 'bg-zinc-500'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Venue */}
          {fixture?.venue && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-zinc-400">
              <MapPin className="h-4 w-4" />
              <span>{fixture.venue}</span>
            </div>
          )}
        </div>
        
        {/* Prediction Card */}
        {prediction?.advice && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-bold">Tahmin</h2>
            </div>
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-blue-400 text-sm mb-2">💡 {prediction.advice}</p>
              {prediction?.percent && (
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-zinc-800 rounded text-xs">1: {prediction.percent.home || '-'}</span>
                  <span className="px-2 py-1 bg-zinc-800 rounded text-xs">X: {prediction.percent.draw || '-'}</span>
                  <span className="px-2 py-1 bg-zinc-800 rounded text-xs">2: {prediction.percent.away || '-'}</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Odds */}
        {odds?.matchWinner && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="h-5 w-5 text-yellow-500" />
              <h2 className="text-lg font-bold">Oranlar</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-400">
                  {odds.matchWinner.home?.toFixed(2) || '-'}
                </p>
                <p className="text-xs text-zinc-400">{fixture?.homeTeam?.name || 'Ev'}</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-400">
                  {odds.matchWinner.draw?.toFixed(2) || '-'}
                </p>
                <p className="text-xs text-zinc-400">Beraberlik</p>
              </div>
              <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-400">
                  {odds.matchWinner.away?.toFixed(2) || '-'}
                </p>
                <p className="text-xs text-zinc-400">{fixture?.awayTeam?.name || 'Deplasman'}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* H2H */}
        {h2h?.stats && (
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Swords className="h-5 w-5 text-purple-500" />
              <h2 className="text-lg font-bold">Karşılıklı Maçlar (H2H)</h2>
            </div>
            
            {/* H2H Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-green-500/10 rounded-lg">
                <p className="text-2xl font-bold text-green-400">{h2h.stats.homeWins || 0}</p>
                <p className="text-xs text-zinc-400">{fixture?.homeTeam?.name || 'Ev'}</p>
              </div>
              <div className="text-center p-3 bg-zinc-700/50 rounded-lg">
                <p className="text-2xl font-bold">{h2h.stats.draws || 0}</p>
                <p className="text-xs text-zinc-400">Beraberlik</p>
              </div>
              <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                <p className="text-2xl font-bold text-blue-400">{h2h.stats.awayWins || 0}</p>
                <p className="text-xs text-zinc-400">{fixture?.awayTeam?.name || 'Deplasman'}</p>
              </div>
            </div>
            
            {/* H2H Matches */}
            {h2h?.matches && h2h.matches.length > 0 && (
              <div className="space-y-2">
                {h2h.matches.slice(0, 5).map((m: { id: number; date: string; homeTeam: { name: string }; awayTeam: { name: string }; score: { home: number | null; away: number | null } }) => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg text-sm">
                    <span className="text-zinc-400">{m.date}</span>
                    <span className="font-medium">{m.homeTeam?.name}</span>
                    <span className="font-bold px-3">
                      {m.score?.home ?? '-'} - {m.score?.away ?? '-'}
                    </span>
                    <span className="font-medium">{m.awayTeam?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Advanced Analysis - Monte Carlo & Cluster */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-bold text-white">Gelişmiş Analiz</h2>
          </div>
          <AdvancedAnalysisPanel
            homeTeam={{
              id: fixture?.homeTeam?.id || 0,
              name: fixture?.homeTeam?.name || 'Ev Sahibi',
              goalsScored: form?.home?.goalsScored || h2h?.stats?.homeWins * 1.5 || 15,
              goalsConceded: form?.home?.goalsConceded || 12,
              matchesPlayed: form?.home?.played || 10
            }}
            awayTeam={{
              id: fixture?.awayTeam?.id || 0,
              name: fixture?.awayTeam?.name || 'Deplasman',
              goalsScored: form?.away?.goalsScored || h2h?.stats?.awayWins * 1.5 || 12,
              goalsConceded: form?.away?.goalsConceded || 14,
              matchesPlayed: form?.away?.played || 10
            }}
          />
        </div>
      </main>
    </div>
  );
}
