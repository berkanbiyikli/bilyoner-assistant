'use client';

/**
 * Favori Butonu Bileşeni
 * Maç veya takım favorilere ekle/çıkar
 */

import { Heart } from 'lucide-react';
import { useFavoritesStore } from '@/lib/favorites/store';

interface FavoriteButtonProps {
  matchId?: number;
  teamId?: number;
  matchData?: {
    id: number;
    homeTeam: string;
    awayTeam: string;
    league: string;
    date: string;
    time: string;
  };
  teamData?: {
    id: number;
    name: string;
    logo: string;
    league: string;
  };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function FavoriteButton({
  matchId,
  teamId,
  matchData,
  teamData,
  size = 'md',
  className = '',
}: FavoriteButtonProps) {
  const { addMatch, removeMatch, isMatchFavorite, addTeam, removeTeam, isTeamFavorite } = useFavoritesStore();
  
  const isMatch = matchId !== undefined;
  const isFavorite = isMatch ? isMatchFavorite(matchId) : teamId ? isTeamFavorite(teamId) : false;
  
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };
  
  const buttonSizes = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isMatch && matchData) {
      if (isFavorite) {
        removeMatch(matchId);
      } else {
        addMatch(matchData);
      }
    } else if (teamId && teamData) {
      if (isFavorite) {
        removeTeam(teamId);
      } else {
        addTeam(teamData);
      }
    }
  };
  
  return (
    <button
      onClick={handleClick}
      className={`${buttonSizes[size]} rounded-full transition-all ${
        isFavorite
          ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
          : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-red-400'
      } ${className}`}
      title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
    >
      <Heart
        className={`${sizeClasses[size]} ${isFavorite ? 'fill-current' : ''}`}
      />
    </button>
  );
}
