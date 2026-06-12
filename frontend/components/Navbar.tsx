'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Shield, ExternalLink, ArrowRight } from 'lucide-react';

export default function Navbar() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 h-16 glass-panel border-x-0 border-t-0 z-50 px-6 flex items-center justify-between"
    >
      {/* Brand Logo */}
      <Link href="/" className="flex items-center gap-2 cursor-pointer group">
        <div className="w-8 h-8 rounded-sm bg-white flex items-center justify-center text-black font-sans font-black tracking-tighter group-hover:bg-blue-600 group-hover:text-black transition-colors shadow-sm">
          <Shield size={16} className="text-black group-hover:scale-110 transition-transform" />
        </div>
        <span className="font-mono font-bold text-sm tracking-widest text-white group-hover:text-blue-500 transition-colors">
          PPE.VISION
        </span>
      </Link>

      {/* Nav Middle Links */}
      <nav className="hidden md:flex items-center gap-8">
        <a
          href="#features"
          className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider transition-colors"
        >
          Features
        </a>
        <a
          href="#tech-stack"
          className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider transition-colors"
        >
          Architecture
        </a>
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-neutral-400 hover:text-white uppercase tracking-wider transition-colors flex items-center gap-1.5"
        >
          API Docs <ExternalLink size={12} />
        </a>
      </nav>

      {/* Launch Console CTA */}
      <div>
        <Link href="/dashboard">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group flex items-center gap-2 bg-white text-black hover:bg-neutral-200 text-xs font-mono tracking-widest uppercase font-bold py-2 px-4 rounded-sm transition-all shadow-md cursor-pointer"
          >
            Launch Console
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform text-black" />
          </motion.button>
        </Link>
      </div>
    </motion.header>
  );
}
