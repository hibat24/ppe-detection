'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ProbabilityChartProps {
  probabilities: Record<string, number>;
  showAll?: boolean;
}

export default function ProbabilityChart({ probabilities, showAll = false }: ProbabilityChartProps) {
  // Parse and sort the probabilities from highest confidence to lowest
  const parsedData = Object.entries(probabilities)
    .map(([className, score]) => ({
      name: className,
      score: score,
    }))
    .sort((a, b) => b.score - a.score);

  // Filter out classes with exactly 0.0 confidence unless showAll is toggled
  const filteredData = showAll ? parsedData : parsedData.filter((item) => item.score > 0.01);

  // Get bar color based on standard safety tags
  const getBarColor = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('no_') || n.includes('none') || n.includes('without')) {
      return 'bg-destructive';
    }
    return 'bg-primary';
  };

  if (filteredData.length === 0) {
    return (
      <div className="p-6 rounded-md border border-border bg-secondary/30 text-center text-xs font-mono text-muted-foreground">
        No active detections or low confidence scores.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredData.map((item, index) => {
        const percentage = Math.round(item.score * 100);
        
        return (
          <div key={item.name} className="space-y-1">
            {/* Top Text Data */}
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-foreground/90 font-semibold uppercase tracking-wider">
                {item.name.replace('_', ' ')}
              </span>
              <span className={`font-bold ${percentage > 50 ? 'text-foreground' : 'text-muted-foreground'}`}>
                {percentage}%
              </span>
            </div>

            {/* Horizontal Bar Track */}
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden relative border border-border/80">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.6, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                className={`h-full rounded-full ${getBarColor(item.name)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
