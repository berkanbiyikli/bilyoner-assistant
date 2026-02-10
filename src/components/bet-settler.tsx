/**
 * Bet Settler Component
 * Bekleyen bahislerin sonuçlarını girme
 */

'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBankrollStore } from '@/lib/bankroll';
import { Clock, CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BetSettler() {
  const { bets, settleBet } = useBankrollStore();
  const pendingBets = bets.filter(b => b.result === 'pending');

  if (pendingBets.length === 0) {
    return null;
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-amber-500" />
        <h3 className="font-bold text-lg">Bekleyen Bahisler</h3>
        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
          {pendingBets.length}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {pendingBets.map((bet) => (
          <div key={bet.id} className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{bet.homeTeam} vs {bet.awayTeam}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{bet.pick}</span>
                  <span>•</span>
                  <span>@{bet.odds.toFixed(2)}</span>
                  <span>•</span>
                  <span>₺{bet.amount.toLocaleString('tr-TR')}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(bet.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-green-500 hover:bg-green-500/10 hover:text-green-500 border-green-500/30"
                onClick={() => settleBet(bet.id, 'won')}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Kazandı
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-500 hover:bg-red-500/10 hover:text-red-500 border-red-500/30"
                onClick={() => settleBet(bet.id, 'lost')}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Kaybetti
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground hover:bg-muted"
                onClick={() => settleBet(bet.id, 'void')}
              >
                <MinusCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
