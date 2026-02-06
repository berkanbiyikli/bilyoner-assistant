'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useDailyMatches } from '@/hooks/useDailyMatches';
import { Home, Radio, Zap } from 'lucide-react';
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
    { href: '/', label: 'Maclar', icon: Home },
    { href: '/live', label: 'Canli', icon: Radio, badge: liveCount > 0 ? liveCount : undefined },
  ];

  return (
    <>
      {/* Desktop Top Bar - Glass */}
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500',
        isScrolled 
          ? 'glass border-b border-border/50 shadow-lg shadow-primary/5' 
          : 'bg-background/80 backdrop-blur-sm border-b border-transparent'
      )}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="gradient-primary p-2 rounded-xl shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div className="absolute inset-0 gradient-primary rounded-xl opacity-0 group-hover:opacity-50 blur-xl transition-opacity" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-tight leading-tight">
                  Kupon <span className="gradient-text">Mühendisi</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">Akilli Bahis Asistani</span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <button className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all relative overflow-hidden',
                      isActive 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}>
                      {isActive && (
                        <span className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
                      )}
                      <item.icon className={cn('h-4 w-4 relative z-10', item.badge && 'text-red-500')} />
                      <span className="relative z-10">{item.label}</span>
                      {item.badge && (
                        <span className="relative z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 animate-pulse">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  </Link>
                );
              })}
            </nav>

            {/* Right */}
            <div className="flex items-center gap-3">
              <a
                href="https://twitter.com/vbb1905"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span className="text-xs text-muted-foreground">@vbb1905</span>
              </a>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Top spacer */}
      <div className="h-16" />

      {/* Mobile Bottom Nav - Glass */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 py-1.5 px-6 rounded-2xl transition-all relative',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground active:scale-95'
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 bg-primary/10 rounded-2xl" />
                )}
                <div className="relative z-10">
                  <item.icon className={cn('h-5 w-5', isActive && 'drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]')} />
                  {item.badge && (
                    <span className="absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className={cn('text-[10px] font-semibold relative z-10', isActive && 'gradient-text')}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
