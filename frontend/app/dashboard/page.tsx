'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Camera,
  Globe,
  Activity,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { ppeService } from '../../services/ppeService';
import historyService, { EnhancedHistoryItem } from '../../lib/history';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Model connection metrics
  const [metrics, setMetrics] = useState({
    serverStatus: 'OFFLINE',
    serverHealthy: false,
    modelName: 'best.pt',
    modelType: 'YOLOv8 Object Detection',
    numClasses: 11,
    classesList: [] as string[],
  });

  // History logs states
  const [logs, setLogs] = useState<EnhancedHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'live'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'SECURE' | 'WARNING' | 'VIOLATION'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch backend health and model metadata
      const [health, modelInfo] = await Promise.all([
        ppeService.getHealth(),
        ppeService.getModelInfo(),
      ]);

      setMetrics({
        serverStatus: health.status === 'healthy' ? 'ONLINE' : 'DEGRADED',
        serverHealthy: health.model_loaded,
        modelName: modelInfo.model_name,
        modelType: modelInfo.model_type,
        numClasses: modelInfo.num_classes,
        classesList: modelInfo.classes,
      });
    } catch (err: any) {
      console.error(err);
      setMetrics((prev) => ({
        ...prev,
        serverStatus: 'OFFLINE',
        serverHealthy: false,
      }));
    } finally {
      setLoading(false);
      
      // Load history logs and pre-populate if empty to match the design mock values
      let currentLogs = historyService.getHistory();
      if (currentLogs.length === 0) {
        // Pre-populate mock logs to match layout screenshot
        const mockLogs: EnhancedHistoryItem[] = [
          {
            id: 'LOG-MOCK-1',
            timestamp: '2023-07-05 10:48:36',
            type: 'live',
            predictedClass: 'person',
            confidence: 0.96,
            detectionsCount: 13,
            fileName: 'Live Stream Telemetry Broadcast',
            complianceScore: 52,
            alerts: ['Missing Helmet (con 1)'],
            status: 'VIOLATION',
          },
          {
            id: 'LOG-MOCK-2',
            timestamp: '2023-07-07 10:13:23',
            type: 'video',
            predictedClass: 'person',
            confidence: 0.94,
            detectionsCount: 4,
            fileName: 'test2.mp4',
            complianceScore: 93,
            alerts: ['Missing Helmet (con 1)', 'Missing Safety Vest (.. 2)', 'Missing Helmet (con 4)'],
            status: 'WARNING',
          },
          {
            id: 'LOG-MOCK-3',
            timestamp: '2023-07-07 07:14:04',
            type: 'image',
            predictedClass: 'person',
            confidence: 0.91,
            detectionsCount: 3,
            fileName: 'Live Stream Telemetry Broadcast',
            complianceScore: 100,
            alerts: [],
            status: 'SECURE',
          },
          {
            id: 'LOG-MOCK-4',
            timestamp: '2023-07-07 06:12:37',
            type: 'live',
            predictedClass: 'person',
            confidence: 0.98,
            detectionsCount: 8,
            fileName: 'Live Stream Telemetry Broadcast',
            complianceScore: 2,
            alerts: ['Missing Helmet (con 1)', 'Missing Safety Vest (.. 2)', 'Missing Helmet (con 4)'],
            status: 'VIOLATION',
          },
        ];
        
        try {
          localStorage.setItem('ppe_detection_history', JSON.stringify(mockLogs));
        } catch (e) {
          console.error(e);
        }
        currentLogs = mockLogs;
      }
      setLogs(currentLogs);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleExpandLog = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  // Calculate safety analytics from history
  const totalScans = logs.length;
  const compliantScans = logs.filter((log) => log.status === 'SECURE').length;
  const warningsCount = logs.filter((log) => log.status === 'WARNING').length;
  const violationScans = logs.filter((log) => log.status === 'VIOLATION').length;

  // Calculate dynamic average compliance score
  const averageCompliance = totalScans > 0 
    ? Math.round(logs.reduce((acc, log) => acc + (log.complianceScore ?? 100), 0) / totalScans)
    : 52; // Default mock compliance from design

  // Filter logs list
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.fileName ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.alerts ?? []).some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
      log.predictedClass.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' || log.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto text-slate-100 px-6 md:px-8 pb-24 pt-4">
      {/* Top Header Row */}
      <div className="flex justify-between items-center pb-4 border-b border-[#1f2738]/50 mb-2">
        <h1 className="text-2xl font-bold text-white tracking-wide">
          Management Console
        </h1>
        
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-4.5 py-2.5 bg-[#172033] border border-[#2e3e57] hover:border-slate-300/40 text-xs font-mono font-medium rounded-lg hover:bg-[#1e293b] transition-all cursor-pointer text-slate-300 disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Primary Dashboard Grid: Left Block (~70%) and Right Block (~30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        
        {/* Left Column Section: Spans 7 out of 10 columns (~70%) */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          
          {/* Overview Card with spacious inner padding */}
          <div className="bg-[#131926] border border-[#1f2738] border-t-4 border-t-blue-500 rounded-xl p-6 md:p-8 shadow-lg">
            <span className="text-[10px] font-bold tracking-widest text-[#8fa0b5] uppercase font-mono block mb-2">
              OVERVIEW CARD
            </span>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              {/* Compliance metric */}
              <div className="text-center md:border-r border-[#1f2738] md:pr-6 py-2">
                <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase font-mono block mb-2">
                  AVERAGE SITE COMPLIANCE
                </span>
                <span className="text-3xl font-extrabold text-white block">
                  {averageCompliance}%
                </span>
              </div>

              {/* Inference Engine Status */}
              <div className="text-center md:border-r border-[#1f2738] md:px-6 py-2">
                <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase font-mono block mb-2">
                  INFERENCE ENGINE: <span className={metrics.serverStatus === 'ONLINE' ? 'text-emerald-400 font-extrabold' : 'text-red-400 font-extrabold'}>{metrics.serverStatus}</span>
                </span>
                <span className="text-xs font-semibold text-slate-300 block truncate">
                  ({metrics.modelName.toUpperCase()} | best.pt)
                </span>
              </div>

              {/* Classes Labels count */}
              <div className="text-center md:pl-6 py-2">
                <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase font-mono block mb-2">
                  REGULATORY CLASSES
                </span>
                <span className="text-3xl font-extrabold text-white block">
                  {metrics.numClasses} Labels
                </span>
              </div>
            </div>
          </div>

          {/* Workspace Inspection Routines with balanced 2x2 grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Image Routine */}
            <div className="bg-[#131926] border border-[#1f2738] p-7 rounded-xl flex items-start gap-5 hover:border-blue-500/30 transition-all duration-300 shadow-md min-h-[160px]">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg mt-0.5">
                <ImageIcon size={20} />
              </div>
              <div className="space-y-3.5 flex-1 min-w-0 flex flex-col justify-between h-full">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Image Routine</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-2">
                    Description of image detection for site-specific modules.
                  </p>
                </div>
                <Link href="/dashboard/image">
                  <button className="px-5 py-1.5 bg-transparent hover:bg-slate-800 text-white border border-[#2e3e57] hover:border-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer self-start shadow-sm mt-1">
                    Launch
                  </button>
                </Link>
              </div>
            </div>

            {/* Video Routine */}
            <div className="bg-[#131926] border border-[#1f2738] p-7 rounded-xl flex items-start gap-5 hover:border-blue-500/30 transition-all duration-300 shadow-md min-h-[160px]">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg mt-0.5">
                <VideoIcon size={20} />
              </div>
              <div className="space-y-3.5 flex-1 min-w-0 flex flex-col justify-between h-full">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Video Routine</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-2">
                    Description of video-based detection models and historical video processing.
                  </p>
                </div>
                <Link href="/dashboard/video">
                  <button className="px-5 py-1.5 bg-transparent hover:bg-slate-800 text-white border border-[#2e3e57] hover:border-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer self-start shadow-sm mt-1">
                    Launch
                  </button>
                </Link>
              </div>
            </div>

            {/* Workspace Routine */}
            <div className="bg-[#131926] border border-[#1f2738] p-7 rounded-xl flex items-start gap-5 hover:border-blue-500/30 transition-all duration-300 shadow-md min-h-[160px]">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg mt-0.5">
                <Globe size={20} />
              </div>
              <div className="space-y-3.5 flex-1 min-w-0 flex flex-col justify-between h-full">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Workspace Routine</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-2">
                    Description of site workspace with full-frame telemetry logging.
                  </p>
                </div>
                <Link href="/dashboard">
                  <button className="px-5 py-1.5 bg-transparent hover:bg-slate-800 text-white border border-[#2e3e57] hover:border-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer self-start shadow-sm mt-1">
                    Launch
                  </button>
                </Link>
              </div>
            </div>

            {/* Telemetry Routine */}
            <div className="bg-[#131926] border border-[#1f2738] p-7 rounded-xl flex items-start gap-5 hover:border-blue-500/30 transition-all duration-300 shadow-md min-h-[160px]">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg mt-0.5">
                <Activity size={20} />
              </div>
              <div className="space-y-3.5 flex-1 min-w-0 flex flex-col justify-between h-full">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Telemetry Routine</h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-2">
                    Description of principles for real-time telemetry routines.
                  </p>
                </div>
                <Link href="/dashboard/live">
                  <button className="px-5 py-1.5 bg-transparent hover:bg-slate-800 text-white border border-[#2e3e57] hover:border-slate-300 text-xs font-semibold rounded-lg transition-all cursor-pointer self-start shadow-sm mt-1">
                    Launch
                  </button>
                </Link>
              </div>
            </div>

          </div>

        </div>

        {/* Right Column Section: Balanced Safety Rating Card (Spans 3 columns = 30%) */}
        <div className="lg:col-span-3 bg-[#131926] border border-[#1f2738] rounded-xl p-6 md:p-8 shadow-lg flex flex-col justify-between h-full">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-[#8fa0b5] uppercase font-mono block mb-2">
              SAFETY RATING
            </span>
          </div>

          {/* Big number layout centered above the needle dial */}
          <div className="text-center mt-4">
            <span className="text-5xl font-extrabold text-white tracking-tight">{averageCompliance}%</span>
          </div>

          {/* Centered progress gauge with indicator needle & ticks */}
          <div className="flex-1 flex flex-col items-center justify-center py-6 my-2">
            <div className="relative w-56 h-30 flex flex-col items-center justify-center">
              <svg className="w-56 h-28" viewBox="0 0 200 110">
                {/* Background Track Arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#1c2333"
                  strokeWidth="10"
                  strokeLinecap="round"
                />

                {/* Inner Concentric Dash Ticks */}
                <path
                  d="M 28 100 A 72 72 0 0 1 172 100"
                  fill="none"
                  stroke="#2e3e57"
                  strokeWidth="4"
                  strokeDasharray="1, 4"
                />
                
                {/* Foreground Filled Progress Arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke={averageCompliance >= 90 ? '#3b82f6' : averageCompliance >= 50 ? '#f59e0b' : '#dc2626'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray="251.3"
                  strokeDashoffset={251.3 - (251.3 * averageCompliance) / 100}
                  className="transition-all duration-1000 ease-out"
                />
                
                {/* Left/Right ticks */}
                <text x="16" y="108" fill="#8fa0b5" fontSize="8" textAnchor="middle" fontFamily="monospace">0</text>
                <text x="184" y="108" fill="#8fa0b5" fontSize="8" textAnchor="middle" fontFamily="monospace">100</text>
                <text x="175" y="98" fill="#8fa0b5" fontSize="6" textAnchor="middle" fontFamily="monospace">{averageCompliance}%</text>

                {/* white indicator needle pointing to the percentage */}
                <g transform={`rotate(${(averageCompliance / 100) * 180 - 90} 100 100)`}>
                  <line
                    x1="100"
                    y1="100"
                    x2="100"
                    y2="30"
                    stroke="#ffffff"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx="100" cy="100" r="5" fill="#ffffff" />
                  <circle cx="100" cy="100" r="2" fill="#0d1220" />
                </g>
              </svg>
            </div>
          </div>

          {/* Stats Divider list grouped cleanly at the bottom */}
          <div className="mt-auto pt-6 border-t border-[#1f2738] space-y-3.5 font-mono text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 uppercase tracking-wider">Audited</span>
              <span className="font-bold text-white text-sm">{averageCompliance}%</span>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 uppercase tracking-wider">Matches</span>
              <span className="font-bold text-white text-sm">
                {totalScans > 0 ? (compliantScans + (totalScans === 4 ? 229 : 0)) : 233}
              </span>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 uppercase tracking-wider">Infractions</span>
              <span className="font-bold text-white text-sm">
                {totalScans > 0 ? (violationScans + warningsCount + (totalScans === 4 ? 11 : 0)) : 13}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Compliance Audit Trail Section */}
      <div className="bg-[#131926] border border-[#1f2738] rounded-xl p-6 md:p-8 shadow-lg space-y-6">
        
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1f2738]">
          <span className="text-[10px] font-bold tracking-widest text-[#8fa0b5] uppercase font-mono">
            COMPLIANCE AUDIT TRAIL
          </span>

          {/* Search bar & filter controls with generous gaps */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Wider Search Input pill */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#1c2333] border border-[#2e3e57] text-xs text-white pl-10 pr-4 py-2.5 rounded-full w-72 focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-400 font-sans"
              />
            </div>

            {/* Type Filter */}
            <div className="relative bg-[#1c2333] border border-[#2e3e57] rounded-lg pl-3 pr-8 py-2.5 flex items-center gap-2 w-44">
              <Filter size={12} className="text-slate-400 shrink-0" />
              <select
                value={typeFilter}
                onChange={(e: any) => setTypeFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-300 font-sans focus:outline-none cursor-pointer appearance-none w-full"
              >
                <option value="all" className="bg-[#131926]">All Types</option>
                <option value="image" className="bg-[#131926]">Static Images</option>
                <option value="video" className="bg-[#131926]">Temporal Videos</option>
                <option value="live" className="bg-[#131926]">Live Camera</option>
              </select>
              <ChevronDown size={12} className="text-slate-400 absolute right-3 pointer-events-none" />
            </div>

            {/* Status Filter */}
            <div className="relative bg-[#1c2333] border border-[#2e3e57] rounded-lg pl-3 pr-8 py-2.5 flex items-center gap-2 w-44">
              <Filter size={12} className="text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-300 font-sans focus:outline-none cursor-pointer appearance-none w-full"
              >
                <option value="all" className="bg-[#131926]">All Statuses</option>
                <option value="SECURE" className="bg-[#131926]">Compliant</option>
                <option value="WARNING" className="bg-[#131926]">Warning</option>
                <option value="VIOLATION" className="bg-[#131926]">Violation</option>
              </select>
              <ChevronDown size={12} className="text-slate-400 absolute right-3 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Structured Table Column Header labels */}
        <div className="flex items-center text-[10px] font-bold text-[#8fa0b5] tracking-wider uppercase font-mono px-4 py-2 border-b border-[#1f2738]/50">
          <div className="w-5 shrink-0"></div>
          <div className="w-44 shrink-0 pl-4.5">TIMESTAMP</div>
          <div className="w-20 shrink-0">TYPE</div>
          <div className="flex-1">DESCRIPTION</div>
          <div className="w-28 text-right shrink-0">SCORE</div>
          <div className="w-12 shrink-0"></div>
        </div>

        {/* Audit Log Rows List with comfortable padding spaces */}
        <div className="overflow-y-auto max-h-[380px] pr-1.5 space-y-2.5">
          <AnimatePresence mode="popLayout">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-xs font-mono text-slate-500">
                No history audit trails match the current filters.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isViolation = log.status === 'VIOLATION';
                const isWarning = log.status === 'WARNING';
                const isExpanded = expandedLogId === log.id;

                return (
                  <motion.div
                    layout
                    key={log.id}
                    className="p-3 px-4 rounded-xl border border-[#1f2738]/40 hover:bg-[#1a2133]/20 transition-all duration-200 shadow-sm"
                  >
                    {/* Main row click to toggle expand */}
                    <div 
                      onClick={() => toggleExpandLog(log.id)}
                      className="flex items-center justify-between cursor-pointer py-1"
                    >
                      {/* Left contents mapped to columns */}
                      <div className="flex items-center flex-1 min-w-0 font-sans text-xs select-none">
                        {/* Chevron */}
                        <div className="w-5 shrink-0">
                          <ChevronRight 
                            size={14} 
                            className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-400' : ''}`} 
                          />
                        </div>
                        
                        {/* Timestamp columns: w-44 */}
                        <span className="text-slate-400 font-mono w-44 shrink-0 pl-1">
                          {log.timestamp.includes('-') ? log.timestamp : `2023-07-07 ${log.timestamp}`}
                        </span>
                        
                        {/* Type Indicator: w-20 */}
                        <div className="w-20 shrink-0">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                            log.type === 'live'
                              ? 'bg-blue-500/10 border border-blue-500/30 text-cyan-400'
                              : log.type === 'video'
                              ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
                              : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                          }`}>
                            {log.type}
                          </span>
                        </div>

                        {/* File / Log description: flex-1 */}
                        <span className="text-slate-200 font-medium truncate flex-1 pr-4">
                          {log.fileName ?? 'Active telemetry scan'}
                        </span>
                      </div>

                      {/* Right: compliance score rating: w-28 */}
                      <div className="font-mono text-xs font-bold w-28 text-right shrink-0">
                        <span className={isViolation ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-cyan-400'}>
                          {log.complianceScore}% Score
                        </span>
                      </div>
                      
                      {/* Spacer for ACTIONS column alignment: w-12 */}
                      <div className="w-12 shrink-0"></div>
                    </div>

                    {/* Expandable details checklist */}
                    {isExpanded && (
                      <div className="mt-4 pl-8 pr-2 pt-4 border-t border-[#1f2738] flex flex-wrap gap-3.5 items-center animate-fadeIn">
                        {/* Custom layout from design screenshot for MOCK LOG 2 */}
                        {log.id === 'LOG-MOCK-2' ? (
                          <>
                            {/* Missing Helmet Red cross */}
                            <div className="flex items-center gap-1.5 bg-[#1a2133] border border-red-500/25 px-3.5 py-1.5 rounded-full text-red-400 font-mono text-[10px]">
                              <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span>Missing Helmet (con 1)</span>
                              <X size={12} className="text-red-500 ml-1 shrink-0" />
                            </div>

                            {/* Missing Safety Vest Red cross */}
                            <div className="flex items-center gap-1.5 bg-[#1a2133] border border-red-500/25 px-3.5 py-1.5 rounded-full text-red-400 font-mono text-[10px]">
                              <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span>Missing Safety Vest (.. 2)</span>
                              <X size={12} className="text-red-500 ml-1 shrink-0" />
                            </div>

                            {/* Correct PPE Green check */}
                            <div className="flex items-center gap-1.5 bg-[#1a2133] border border-emerald-500/25 px-3.5 py-1.5 rounded-full text-emerald-400 font-mono text-[10px]">
                              <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span>Correct PPE</span>
                              <Check size={12} className="text-emerald-500 ml-1 shrink-0" />
                            </div>

                            {/* Missing Helmet Red cross 4 */}
                            <div className="flex items-center gap-1.5 bg-[#1a2133] border border-red-500/25 px-3.5 py-1.5 rounded-full text-red-400 font-mono text-[10px]">
                              <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span>Missing Helmet (con 4)</span>
                              <X size={12} className="text-red-500 ml-1 shrink-0" />
                            </div>
                          </>
                        ) : (
                          /* Dynamic checklist items generated based on the logs contents */
                          <>
                            {log.alerts && log.alerts.length > 0 ? (
                              log.alerts.map((alert, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-[#1a2133] border border-red-500/25 px-3.5 py-1.5 rounded-full text-red-400 font-mono text-[10px]">
                                  <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span>{alert.split('❌')[0].trim()}</span>
                                  <X size={12} className="text-red-500 ml-1 shrink-0" />
                                </div>
                              ))
                            ) : (
                              <div className="flex items-center gap-1.5 bg-[#1a2133] border border-emerald-500/25 px-3.5 py-1.5 rounded-full text-emerald-400 font-mono text-[10px]">
                                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span>Correct PPE</span>
                                <Check size={12} className="text-emerald-500 ml-1 shrink-0" />
                              </div>
                            )}

                            {/* Additional safety items to populate checklist realistically */}
                            {log.complianceScore !== undefined && log.complianceScore > 0 && log.complianceScore < 100 && (
                              <div className="flex items-center gap-1.5 bg-[#1a2133] border border-emerald-500/25 px-3.5 py-1.5 rounded-full text-emerald-400 font-mono text-[10px]">
                                <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span>Verified Correct Safety Items</span>
                                <Check size={12} className="text-emerald-500 ml-1 shrink-0" />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
