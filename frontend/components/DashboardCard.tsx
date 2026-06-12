'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtext?: string;
  loading?: boolean;
  alert?: boolean;
  onClick?: () => void;
}

export default function DashboardCard({
  title,
  value,
  icon: Icon,
  subtext,
  loading = false,
  alert = false,
  onClick,
}: DashboardCardProps) {
  const isClickable = typeof onClick === 'function';

  const cardContent = (
    <div className="h-full flex flex-col justify-between">
      {/* Title + Icon Area */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-mono font-bold tracking-wider text-neutral-400 uppercase">
          {title}
        </span>
        <div className={`p-2 rounded-sm ${alert ? 'bg-red-500/10 text-red-500' : 'bg-white/5 text-neutral-400'}`}>
          <Icon size={18} />
        </div>
      </div>

      {/* Main Metric Value */}
      <div className="mb-2">
        {loading ? (
          <div className="h-8 w-2/3 bg-white/5 rounded-sm animate-pulse" />
        ) : (
          <h3 className={`text-2xl font-bold tracking-tight font-sans ${alert ? 'text-red-500' : 'text-white'}`}>
            {value}
          </h3>
        )}
      </div>

      {/* Bottom Subtext */}
      {subtext && (
        <div className="mt-2 pt-2 border-t border-white/5">
          {loading ? (
            <div className="h-4 w-1/2 bg-white/5 rounded-sm animate-pulse" />
          ) : (
            <p className="text-xs font-mono text-neutral-400 uppercase tracking-wide">
              {subtext}
            </p>
          )}
        </div>
      )}
    </div>
  );

  const wrapperClass = `glass-panel glass-panel-hover p-5 rounded-sm relative overflow-hidden transition-all duration-300 h-full ${
    alert ? 'border-red-500/30' : 'border-white/8'
  } ${isClickable ? 'cursor-pointer hover:border-blue-600/30' : ''}`;

  if (isClickable) {
    return (
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
        className={wrapperClass}
      >
        {alert && <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_10px_#ef4444]" />}
        {!alert && <div className="absolute top-0 left-0 w-full h-[2px] bg-neutral-800 hover:bg-blue-600 transition-colors" />}
        {cardContent}
      </motion.div>
    );
  }

  return (
    <div className={wrapperClass}>
      {alert && <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_10px_#ef4444]" />}
      {!alert && <div className="absolute top-0 left-0 w-full h-[2px] bg-neutral-800" />}
      {cardContent}
    </div>
  );
}
