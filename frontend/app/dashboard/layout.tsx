'use client';

import React from 'react';
import Sidebar from '../../components/Sidebar';
import { motion } from 'framer-motion';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#090d16] text-white font-sans selection:bg-blue-600 selection:text-black">
      {/* Redesigned Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Viewport for nested routes */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 relative bg-[#090d16]">
          {/* Subtle Ambient Blue Highlight */}
          <div className="absolute top-10 right-10 w-96 h-96 bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />
          
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="h-full relative z-10"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
