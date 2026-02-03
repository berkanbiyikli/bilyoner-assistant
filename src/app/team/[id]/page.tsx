'use client';

/**
 * Takım Detay Sayfası
 * Takım istatistikleri, form, kadro bilgileri
 */

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft, 
  Trophy, 
  Target, 
  Shield,
  Users,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  MapPin,
  Building
} from 'lucide-react';
import { FavoriteButton } from '@/components/favorite-button';

export default function TeamPage() {
  const params = useParams();
  const teamId = parseInt(params.id as string);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/team/${teamId}`);
      if (!res.ok) throw new Error('Failed to fetch team');
      return res.json();
    },
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
      </div>
    );
  }
  
  if (error || !data?.team) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400">Takım bilgisi yüklenemedi</p>
          <Link href="/" className="text-green-400 hover:underline mt-2 inline-block">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    );
  }
  
  const { team, form, stats, recentMatches, squad } = data;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-zinc-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            
            {team.logo && (
              <Image 
                src={team.logo} 
                alt={team.name}
                width={48}
                height={48}
                className="object-contain"
              />
            )}
            
            <div className="flex-1">
              <h1 className="text-xl font-bold">{team.name}</h1>
              <p className="text-sm text-zinc-400">{team.country}</p>
            </div>
            
            <FavoriteButton
              teamId={team.id}
              teamData={{
                id: team.id,
                name: team.name,
                logo: team.logo,
                league: stats?.league?.name || team.country,
              }}
            />
          </div>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Team Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Form */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
            <h2 className="text-sm text-zinc-400 mb-3">Son 5 Maç Formu</h2>
            <div className="flex gap-2 justify-center">
              {form.map((result: string, i: number) => (
                <span 
                  key={i}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white ${
                    result === 'W' ? 'bg-green-600' :
                    result === 'L' ? 'bg-red-600' : 'bg-zinc-600'
                  }`}
                >
                  {result === 'W' ? 'G' : result === 'L' ? 'M' : 'B'}
                </span>
              ))}
            </div>
          </div>
          
          {/* Venue */}
          {team.venue && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <h2 className="text-sm text-zinc-400 mb-3 flex items-center gap-2">
                <Building className="h-4 w-4" />
                Stadyum
              </h2>
              <p className="font-medium text-white">{team.venue.name}</p>
              <p className="text-sm text-zinc-400">{team.venue.city}</p>
              <p className="text-xs text-zinc-500 mt-1">Kapasite: {team.venue.capacity?.toLocaleString()}</p>
            </div>
          )}
          
          {/* Quick Stats */}
          {stats && (
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <h2 className="text-sm text-zinc-400 mb-3">Sezon Özeti</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-green-400">{stats.fixtures.wins}</div>
                  <div className="text-xs text-zinc-500">Galibiyet</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-400">{stats.fixtures.draws}</div>
                  <div className="text-xs text-zinc-500">Beraberlik</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-400">{stats.fixtures.losses}</div>
                  <div className="text-xs text-zinc-500">Mağlubiyet</div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Detailed Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Goals */}
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-green-500" />
                Gol İstatistikleri
              </h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Atılan Gol</span>
                  <span className="font-bold text-green-400">{stats.goals.for}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Yenilen Gol</span>
                  <span className="font-bold text-red-400">{stats.goals.against}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Maç Başı Ort.</span>
                  <span className="font-bold text-white">
                    {stats.goals.forAvg} / {stats.goals.againstAvg}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Gol Yemeden</span>
                  <span className="font-bold text-blue-400">{stats.cleanSheets}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Gol Atamadan</span>
                  <span className="font-bold text-orange-400">{stats.failedToScore}</span>
                </div>
              </div>
            </div>
            
            {/* Home/Away */}
            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Ev/Deplasman
              </h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm text-zinc-400 mb-1">
                    <span>Evde Galibiyet</span>
                    <span className="text-green-400 font-medium">{stats.fixtures.homeWins}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(stats.fixtures.homeWins / stats.fixtures.played) * 100}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm text-zinc-400 mb-1">
                    <span>Deplasmanda Galibiyet</span>
                    <span className="text-blue-400 font-medium">{stats.fixtures.awayWins}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(stats.fixtures.awayWins / stats.fixtures.played) * 100}%` }}
                    />
                  </div>
                </div>
                
                <div className="pt-2 border-t border-zinc-800">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Evde Gol</span>
                    <span className="text-white">{stats.goals.forHome} / {stats.goals.againstHome}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-zinc-400">Deplasmanda Gol</span>
                    <span className="text-white">{stats.goals.forAway} / {stats.goals.againstAway}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Recent Matches */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-500" />
            Son Maçlar
          </h2>
          
          <div className="space-y-2">
            {recentMatches.map((match: any) => (
              <Link
                key={match.id}
                href={`/match/${match.id}`}
                className="flex items-center gap-4 p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                {/* Result indicator */}
                <div className={`w-1 h-8 rounded-full ${
                  match.result === 'W' ? 'bg-green-500' :
                  match.result === 'L' ? 'bg-red-500' : 'bg-zinc-500'
                }`} />
                
                {/* Date */}
                <div className="text-xs text-zinc-400 w-16">
                  {new Date(match.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                </div>
                
                {/* Home/Away indicator */}
                <span className={`text-xs px-2 py-0.5 rounded ${
                  match.isHome ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {match.isHome ? 'Ev' : 'Dep'}
                </span>
                
                {/* Opponent */}
                <div className="flex items-center gap-2 flex-1">
                  {match.opponent.logo && (
                    <Image 
                      src={match.opponent.logo}
                      alt={match.opponent.name}
                      width={20}
                      height={20}
                    />
                  )}
                  <span className="text-white">{match.opponent.name}</span>
                </div>
                
                {/* Score */}
                <div className={`font-bold ${
                  match.result === 'W' ? 'text-green-400' :
                  match.result === 'L' ? 'text-red-400' : 'text-zinc-400'
                }`}>
                  {match.score.team} - {match.score.opponent}
                </div>
                
                {/* Result icon */}
                {match.result === 'W' && <TrendingUp className="h-4 w-4 text-green-500" />}
                {match.result === 'L' && <TrendingDown className="h-4 w-4 text-red-500" />}
                {match.result === 'D' && <Minus className="h-4 w-4 text-zinc-500" />}
              </Link>
            ))}
          </div>
        </div>
        
        {/* Squad Summary */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-cyan-500" />
            Kadro ({squad.total} oyuncu)
          </h2>
          
          {/* Position distribution */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="text-center p-2 bg-zinc-800 rounded-lg">
              <div className="text-xl font-bold text-yellow-400">{squad.byPosition.goalkeepers}</div>
              <div className="text-xs text-zinc-400">Kaleci</div>
            </div>
            <div className="text-center p-2 bg-zinc-800 rounded-lg">
              <div className="text-xl font-bold text-blue-400">{squad.byPosition.defenders}</div>
              <div className="text-xs text-zinc-400">Defans</div>
            </div>
            <div className="text-center p-2 bg-zinc-800 rounded-lg">
              <div className="text-xl font-bold text-green-400">{squad.byPosition.midfielders}</div>
              <div className="text-xs text-zinc-400">Orta Saha</div>
            </div>
            <div className="text-center p-2 bg-zinc-800 rounded-lg">
              <div className="text-xl font-bold text-red-400">{squad.byPosition.attackers}</div>
              <div className="text-xs text-zinc-400">Forvet</div>
            </div>
          </div>
          
          {/* Top players */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {squad.topPlayers.map((player: any) => (
              <div 
                key={player.id}
                className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg"
              >
                {player.photo && (
                  <Image 
                    src={player.photo}
                    alt={player.name}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{player.name}</p>
                  <p className="text-xs text-zinc-400">#{player.number} • {player.position?.slice(0, 3)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
