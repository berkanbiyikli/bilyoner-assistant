/**
 * Navbar - Modern minimal navigation
 * Bottom nav on mobile, top bar on desktop
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { useDailyMatches } from '@/hooks/useDailyMatches';
import { 
  Home,
  Radio,
  Ticket,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();
  
  const { data } = useDailyMatches();
  const liveCount = data?.stats?.live || 0;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { href: '/', label: 'Maçlar', icon: Home },
    { href: '/live', label: 'Canlı', icon: Radio, badge: liveCount > 0 ? liveCount : undefined },
  ];

  return (
    <>
      {/* ===== Desktop Top Bar ===== */}
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b',
        isScrolled 
          ? 'bg-background/95 backdrop-blur-md border-border shadow-sm' 
          : 'bg-background border-transparent'
      )}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="gradient-primary p-1.5 rounded-lg">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-base tracking-tight">
                Bilyoner
                <span className="text-primary ml-0.5">AI</span>
              </span>
            </Link>

            {/* Desktop Nav Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'gap-2 rounded-lg text-sm font-medium relative',
                        isActive && 'bg-primary/10 text-primary hover:bg-primary/15'
                      )}
                    >
                      <item.icon className={cn('h-4 w-4', item.badge && 'text-red-500')} />
                      {item.label}
                      {item.badge && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </Button>
                  </Link>
                );
              })}
            </nav>

            {/* Right */}
            <div className="flex items-center gap-2">
              <a
                href="https://twitter.com/BilyonerBot"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:block"
              >
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </Button>
              </a>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Top spacer */}
      <div className="h-14" />

      {/* ===== Mobile Bottom Nav ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-colors relative',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <div className="relative">
                  <item.icon className={cn('h-5 w-5', item.badge && !isActive && 'text-muted-foreground')} />
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
