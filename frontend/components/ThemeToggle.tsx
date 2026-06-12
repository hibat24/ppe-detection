'use client';

import React from 'react';
import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer border border-border bg-card shadow-sm flex items-center justify-center"
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <Moon size={16} className="text-zinc-600 dark:text-zinc-400" />
      ) : (
        <Sun size={16} className="text-zinc-400 dark:text-zinc-100" />
      )}
    </button>
  );
}
