/**
 * Navbar Component
 * Modern glass-morphism navigation bar
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
  Trophy,
  BarChart3,
  ExternalLink,
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

  const navLinks = [
    { href: '/', label: 'Maçlar', icon: Trophy },
    ...(liveCount > 0 ? [{ href: '/live', label: 'Canlı', icon: Radio, badge: liveCount }] : []),
  ];

  return (
    <>
      {/* Navbar */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        isScrolled 
          ? "glass shadow-lg shadow-black/5 dark:shadow-black/20 border-b border-border/50" 
          : "bg-background/80 backdrop-blur-sm border-b border-transparent"
      )}>
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-green-400 rounded-xl blur opacity-40 group-hover:opacity-70 transition-all duration-300" />
                <div className="relative gradient-primary p-2 rounded-xl shadow-md">
                  <Zap className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-none tracking-tight bg-gradient-to-r from-emerald-600 to-green-500 dark:from-emerald-400 dark:to-green-300 bg-clip-text text-transparent">
                  Bilyoner
                </span>
                <span className="text-[10px] text-muted-foreground leading-none font-medium tracking-wider uppercase">
                  Assistant
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <Button variant="ghost" size="sm" className="gap-2 relative rounded-xl hover:bg-primary/10">
                    <link.icon className={cn("h-4 w-4", link.badge && "text-red-500")} />
                    {link.label}
                    {link.badge && (
                      <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-red-500 text-white text-[10px] animate-pulse shadow-lg shadow-red-500/30">
                        {link.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              ))}
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2">
              {/* Live Badge - Mobile */}
              {liveCount > 0 && (
                <Link href="/live" className="md:hidden">
                  <Badge className="bg-red-500 gap-1 animate-pulse shadow-lg shadow-red-500/30 border-0">
                    <Radio className="h-3 w-3" />
                    {liveCount} Canlı
                  </Badge>
                </Link>
              )}
              
              {/* Twitter Link */}
              <a 
                href="https://twitter.com/BilyonerBot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hidden sm:flex"
              >
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </Button>
              </a>
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden h-9 w-9 p-0 rounded-xl"
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
            "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity",
            isMenuOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setIsMenuOpen(false)}
        />
        
        {/* Menu Panel */}
        <div className={cn(
          "absolute top-16 left-4 right-4 glass rounded-2xl border border-border/50 shadow-2xl transition-all duration-300",
          isMenuOpen ? "translate-y-0 opacity-100 scale-100" : "-translate-y-4 opacity-0 scale-95"
        )}>
          <div className="p-4">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setIsMenuOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-3 h-12 rounded-xl hover:bg-primary/10">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <link.icon className={cn("h-4 w-4", link.badge ? "text-red-500" : "text-primary")} />
                    </div>
                    <span className="font-medium">{link.label}</span>
                    {link.badge && (
                      <Badge className="ml-auto bg-red-500 border-0">{link.badge}</Badge>
                    )}
                  </Button>
                </Link>
              ))}
              
              <div className="border-t border-border/50 my-2" />
              
              {/* Stats Summary */}
              <div className="grid grid-cols-3 gap-2 px-2">
                <div className="text-center p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="text-xl font-bold text-primary">{data?.stats?.total || 0}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Maç</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                  <div className="text-xl font-bold text-red-500">{liveCount}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Canlı</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                  <div className="text-xl font-bold text-blue-500">{data?.stats?.upcoming || 0}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">Yaklaşan</div>
                </div>
              </div>
              
              {/* Twitter Link - Mobile */}
              <a 
                href="https://twitter.com/BilyonerBot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-2"
              >
                <Button variant="outline" className="w-full gap-2 rounded-xl h-10 border-border/50">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  @BilyonerBot
                  <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer for fixed navbar */}
      <div className="h-16" />
    </>
  );
}
