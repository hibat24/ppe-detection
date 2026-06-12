'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Image as ImageIcon,
  Video as VideoIcon,
  Camera,
} from 'lucide-react';
import { ppeService } from '../services/ppeService';

export default function Sidebar() {
  const pathname = usePathname();
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);

  // Check server health on interval to display connection badge
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await ppeService.getHealth();
        setServerHealthy(res.model_loaded);
      } catch (err) {
        setServerHealthy(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const menuItems = [
    { name: 'Overview', path: '/dashboard', icon: Home },
    { name: 'Image Detection', path: '/dashboard/image', icon: ImageIcon },
    { name: 'Video Detection', path: '/dashboard/video', icon: VideoIcon },
    { name: 'Live Camera Feed', path: '/dashboard/live', icon: Camera },
  ];

  return (
    <aside className="w-[260px] h-screen shrink-0 bg-[#0d1220] border-r border-[#1f2738] text-white flex flex-col z-40">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-[#1f2738] shrink-0">
        <div className="flex items-center gap-2">
          {/* Hexagonal Blue Logo */}
          <svg className="w-5 h-5 text-blue-500 fill-blue-500/10" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="font-sans font-extrabold text-[15px] tracking-wider text-white">
            PPE<span className="text-slate-400 font-normal">.VISION</span>
          </span>
        </div>

        {/* User initials badge */}
        <div className="w-7 h-7 rounded-full bg-[#202b3e] text-slate-300 flex items-center justify-center text-[10px] font-bold border border-[#2e3e57] select-none">
          SA
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.path || (item.path === '/dashboard' && pathname === '/dashboard/');
          const Icon = item.icon;

          return (
            <Link key={item.path} href={item.path} className="block group">
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer border ${
                  isActive
                    ? 'bg-[#1e293b] border-[#2e3a4e] text-white font-medium shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-[#141c2c]'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-white transition-colors'} />
                <span className="text-xs font-semibold tracking-wide">{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Core Status Block */}
      <div className="p-4 border-t border-[#1f2738] bg-[#090d16] shrink-0">
        <div className="p-4 rounded-xl bg-[#131926] border border-[#1f2738] flex flex-col gap-1.5 shadow-inner">
          <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase font-mono">
            CORE STATUS
          </span>
          <div className="flex items-center gap-2.5">
            <span
              className={`w-3.5 h-3.5 rounded-full ${
                serverHealthy === true
                  ? 'bg-blue-500 shadow-[0_0_12px_#3b82f6] animate-pulse'
                  : serverHealthy === false
                  ? 'bg-red-500 shadow-[0_0_12px_#ef4444]'
                  : 'bg-yellow-500 shadow-[0_0_12px_#eab308]'
              }`}
            />
            <span className="text-lg font-black text-white tracking-widest font-sans">
              {serverHealthy === true
                ? 'LIVE'
                : serverHealthy === false
                ? 'OFFLINE'
                : 'WAITING'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
