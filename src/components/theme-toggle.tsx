/**
 * Theme Toggle Component
 * Dark/Light mode switch with next-themes
 */

'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  variant?: 'icon' | 'dropdown' | 'switch';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Hydration fix
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", className)}>
        <div className="h-4 w-4 bg-muted animate-pulse rounded" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  if (variant === 'switch') {
    return (
      <div className={cn("flex items-center gap-2 p-1 rounded-full bg-muted", className)}>
        <button
          onClick={() => setTheme('light')}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            theme === 'light' && "bg-background shadow-sm"
          )}
          aria-label="Açık tema"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme('system')}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            theme === 'system' && "bg-background shadow-sm"
          )}
          aria-label="Sistem teması"
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            "p-1.5 rounded-full transition-colors",
            theme === 'dark' && "bg-background shadow-sm"
          )}
          aria-label="Koyu tema"
        >
          <Moon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (variant === 'dropdown') {
    return (
      <div className={cn("relative group", className)}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
        <div className="absolute right-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all bg-popover border rounded-lg shadow-lg p-1 min-w-[120px] z-50">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted",
              theme === 'light' && "bg-muted"
            )}
          >
            <Sun className="h-4 w-4" />
            Açık
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted",
              theme === 'dark' && "bg-muted"
            )}
          >
            <Moon className="h-4 w-4" />
            Koyu
          </button>
          <button
            onClick={() => setTheme('system')}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted",
              theme === 'system' && "bg-muted"
            )}
          >
            <Monitor className="h-4 w-4" />
            Sistem
          </button>
        </div>
      </div>
    );
  }

  // Default: icon toggle
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn("h-8 w-8 p-0", className)}
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-4 w-4 transition-transform hover:-rotate-12" />
      )}
    </Button>
  );
}

/**
 * Theme Provider wrapper for layout
 */
export { ThemeProvider } from 'next-themes';
