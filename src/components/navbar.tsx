/**
 * Navbar Component
 * Profesyonel, responsive navigation bar
 * Mobil hamburger menü + Desktop horizontal layout
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { useDailyMatches } from '@/hooks/useDailyMatches';
import { 
  Menu, 
  X, 
  Zap, 
  Radio, 
  TrendingUp,
  Calendar,
  Trophy
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // Canlı maç sayısı için
  const { data } = useDailyMatches();
  const liveCount = data?.stats?.live || 0;

  // Scroll event
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Menu kapandığında body scroll'u aç
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  return (
    <>
      {/* Navbar */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled 
          ? "bg-background/95 backdrop-blur-lg shadow-lg border-b" 
          : "bg-background border-b"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Logo & Brand */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg blur-sm opacity-50 group-hover:opacity-75 transition-opacity" />
                <div className="relative bg-gradient-to-r from-green-500 to-emerald-500 p-1.5 rounded-lg">
                  <Zap className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-none tracking-tight">
                  Bilyoner
                </span>
                <span className="text-[10px] text-muted-foreground leading-none">
                  Assistant
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Trophy className="h-4 w-4" />
                  Anasayfa
                </Button>
              </Link>
              
              {liveCount > 0 && (
                <Link href="/live">
                  <Button variant="ghost" size="sm" className="gap-2 relative">
                    <Radio className="h-4 w-4 text-red-500" />
                    Canlı
                    <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs animate-pulse">
                      {liveCount}
                    </Badge>
                  </Button>
                </Link>
              )}
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2">
              {/* Live Badge - Mobile */}
              {liveCount > 0 && (
                <Link href="/live" className="md:hidden">
                  <Badge className="bg-red-500 gap-1 animate-pulse">
                    <Radio className="h-3 w-3" />
                    {liveCount}
                  </Badge>
                </Link>
              )}
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-9 w-9 p-0"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div className={cn(
        "fixed inset-0 z-40 md:hidden transition-all duration-300",
        isMenuOpen ? "visible" : "invisible"
      )}>
        {/* Backdrop */}
        <div 
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            isMenuOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setIsMenuOpen(false)}
        />
        
        {/* Menu Panel */}
        <div className={cn(
          "absolute top-14 left-0 right-0 bg-background border-b shadow-xl transition-all duration-300",
          isMenuOpen ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
        )}>
          <div className="container mx-auto px-4 py-4">
            <div className="flex flex-col gap-2">
              <Link href="/" onClick={() => setIsMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 h-12">
                  <Trophy className="h-5 w-5 text-primary" />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">Anasayfa</span>
                    <span className="text-xs text-muted-foreground">Günün maçları ve önerileri</span>
                  </div>
                </Button>
              </Link>
              
              {liveCount > 0 && (
                <Link href="/live" onClick={() => setIsMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-3 h-12">
                    <Radio className="h-5 w-5 text-red-500" />
                    <div className="flex flex-col items-start">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Canlı Maçlar</span>
                        <Badge className="bg-red-500 text-xs">{liveCount}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">Şu an oynanıyor</span>
                    </div>
                  </Button>
                </Link>
              )}
              
              <div className="border-t my-2" />
              
              <div className="px-3 py-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Günün Özeti</span>
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold">{data?.stats?.total || 0}</div>
                    <div className="text-[10px] text-muted-foreground">Toplam Maç</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-red-500">{liveCount}</div>
                    <div className="text-[10px] text-muted-foreground">Canlı</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-green-500">{data?.stats?.upcoming || 0}</div>
                    <div className="text-[10px] text-muted-foreground">Yaklaşan</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for fixed navbar */}
      <div className="h-14 md:h-16" />
    </>
  );
}
