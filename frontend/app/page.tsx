'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Shield,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import Navbar from '../components/Navbar';

export default function Home() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as any },
    },
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f8fafc] selection:bg-blue-600 selection:text-black">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-36 pb-16 px-6 overflow-hidden flex flex-col items-center justify-center min-h-[85vh]">
        {/* Glow Ambient Light */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Minimalist Grid Line Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-4xl mx-auto text-center z-10 flex flex-col items-center"
        >
          {/* Top Pill Alert */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/5 text-blue-400 text-[10px] font-mono font-semibold uppercase tracking-widest mb-8"
          >
            <Shield size={12} className="animate-pulse-glow" />
            <span>YOLOv8-Powered AI Safety Platform</span>
          </motion.div>

          {/* Primary Header Title */}
          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-[1.08] max-w-3xl"
          >
            Automate Safety <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-200 to-white">
              PPE Inference
            </span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            variants={itemVariants}
            className="text-sm sm:text-base text-slate-400 font-mono tracking-wide max-w-2xl mb-10 leading-relaxed"
          >
            Verify safety gear compliance (helmets, vests, goggles) in under 15ms. Detect infractions, catalog live events, and secure high-risk workplaces with Stripe-level UI elegance.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 mb-16">
            <Link href="/dashboard">
              <button className="group flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold tracking-widest uppercase py-3.5 px-8 rounded-sm shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all cursor-pointer">
                Launch Console
                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform text-white" />
              </button>
            </Link>

            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-mono font-bold tracking-widest uppercase py-3.5 px-8 rounded-sm transition-all cursor-pointer">
                API Reference
                <ExternalLink size={14} className="text-slate-400" />
              </button>
            </a>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
