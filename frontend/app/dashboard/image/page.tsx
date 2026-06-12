'use client';

import React, { useState, useEffect } from 'react';
import { ppeService } from '../../../services/ppeService';
import { PredictionResponse } from '../../../types';
import UploadZone from '../../../components/UploadZone';
import BoundingBoxOverlay from '../../../components/BoundingBoxOverlay';
import ProbabilityChart from '../../../components/ProbabilityChart';
import { calculateCompliance, ComplianceReport } from '../../../lib/compliance';
import historyService from '../../../lib/history';
import { Shield, CheckCircle, AlertTriangle, Download, RotateCcw, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ImagePrediction() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (localImageUrl) {
        URL.revokeObjectURL(localImageUrl);
      }
    };
  }, [localImageUrl]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
    setPrediction(null);
    setCompliance(null);
    
    // Revoke previous URL if exists
    if (localImageUrl) {
      URL.revokeObjectURL(localImageUrl);
    }
    
    const url = URL.createObjectURL(file);
    setLocalImageUrl(url);
  };

  const handleFileClear = () => {
    setSelectedFile(null);
    setPrediction(null);
    setCompliance(null);
    setError(null);
    setUploadProgress(0);
    if (localImageUrl) {
      URL.revokeObjectURL(localImageUrl);
      setLocalImageUrl(null);
    }
  };

  const runInference = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setUploadProgress(10);
    setError(null);

    try {
      // Step upload intervals
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 95;
          }
          return prev + 25;
        });
      }, 100);

      const res = await ppeService.predictImage(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      clearInterval(interval);
      setUploadProgress(100);
      
      // Calculate safety metrics
      const report = calculateCompliance(res.detections);
      
      // Delay response formatting slightly for smooth UX transition
      setTimeout(() => {
        setPrediction(res);
        setCompliance(report);
        setIsProcessing(false);

        // Write this inspection run to history logs database
        historyService.addHistoryItem({
          type: 'image',
          predictedClass: res.predicted_class,
          confidence: res.confidence,
          detectionsCount: res.detections.length,
          fileName: selectedFile.name,
          complianceScore: report.score,
          alerts: report.alerts,
          status: report.status,
        });
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Server failed to process the image. Ensure correct formats.');
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const exportReport = () => {
    if (!prediction || !selectedFile || !compliance) return;

    const reportData = {
      report_id: `REP-${Math.floor(100000 + Math.random() * 900000)}`,
      generated_at: new Date().toISOString(),
      file_analyzed: selectedFile.name,
      file_size_bytes: selectedFile.size,
      yolo_predictions: {
        dominant_predicted_class: prediction.predicted_class,
        overall_confidence: prediction.confidence,
        detections_count: prediction.detections.length,
        individual_detections: prediction.detections,
        all_class_probabilities: prediction.all_probabilities,
      },
      safety_compliance: {
        score: compliance.score,
        status: compliance.status,
        active_alerts: compliance.alerts,
        summary: compliance.summary,
      },
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PPE-Audit-Report-${selectedFile.name.split('.')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const isViolation = compliance?.status === 'VIOLATION';
  const isWarning = compliance?.status === 'WARNING';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white font-mono uppercase">
          Image Analyzer
        </h1>
        <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider mt-1">
          Perform high-precision bounding box annotations on static inspection photographs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel border-white/8 p-6 rounded-sm">
            <h3 className="text-sm font-mono font-bold tracking-widest text-neutral-300 uppercase mb-5">
              Upload Inspection File
            </h3>

            <UploadZone
              type="image"
              accept=".jpg,.jpeg,.png,.webp,.bmp"
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
              uploadProgress={uploadProgress}
              isProcessing={isProcessing}
            />

            {selectedFile && !prediction && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 flex justify-end gap-3"
              >
                <button
                  onClick={handleFileClear}
                  className="px-4 py-2 border border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/8 text-xs font-mono font-bold tracking-widest uppercase rounded-sm transition-all cursor-pointer"
                >
                  Reset
                </button>
                <button
                  onClick={runInference}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white hover:text-white shadow-[0_0_15px_rgba(59,130,246,0.25)] text-xs font-mono font-bold tracking-widest uppercase rounded-sm transition-all cursor-pointer"
                >
                  Run AI Inference
                </button>
              </motion.div>
            )}
          </div>

          {/* Visual Canvas Bounding-Box Overlay */}
          <AnimatePresence>
            {prediction && localImageUrl && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-panel border-white/8 p-6 rounded-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono font-bold tracking-widest text-neutral-300 uppercase">
                    Inference Bounding Boxes
                  </h3>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-mono bg-white/5 border border-white/5 text-neutral-400 py-1 px-2.5 rounded-sm">
                      Objects Detected: {prediction.detections.length}
                    </span>
                  </div>
                </div>

                {prediction.annotated_image ? (
                  <div className="relative select-none max-w-full overflow-hidden flex items-center justify-center bg-black/60 rounded-sm border border-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prediction.annotated_image}
                      alt="YOLOv8 Plotted Detections"
                      className="max-h-[500px] object-contain max-w-full block"
                    />
                  </div>
                ) : (
                  <BoundingBoxOverlay imageUrl={localImageUrl} detections={prediction.detections} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results Metadata Column */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!prediction || !compliance ? (
              /* Instructions/Static card when no inference run */
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-panel border-white/8 p-6 rounded-sm text-center py-20"
              >
                <Shield size={32} className="text-neutral-500 mx-auto mb-4 animate-pulse-glow" />
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-2">
                  Awaiting Inference
                </h4>
                <p className="text-[10px] font-mono text-neutral-500 leading-relaxed max-w-xs mx-auto">
                  Drag an inspection photo into the upload panel and click "Run AI Inference" to map bounding boxes and calculate compliance metrics.
                </p>
              </motion.div>
            ) : (
              /* Prediction Details Output Panel */
              <motion.div
                key="prediction-results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="glass-panel border-white/8 p-6 rounded-sm space-y-6"
              >
                {/* Header Status Card */}
                <div className={`p-4 border rounded-sm flex items-start gap-3.5 ${
                  isViolation
                    ? 'border-red-500/20 bg-red-500/5 text-red-500'
                    : isWarning
                    ? 'border-yellow-500/20 bg-yellow-500/5 text-yellow-500'
                    : 'border-blue-500/20 bg-blue-500/5 text-blue-500'
                }`}>
                  <div className="p-2 bg-black/45 rounded-sm shrink-0 border border-white/5">
                    {isViolation || isWarning ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                  </div>
                  <div className="space-y-0.5 text-left">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Compliance Audit</span>
                    <h4 className="text-sm font-bold uppercase tracking-wide">
                      {isViolation ? 'VIOLATIONS FOUND' : isWarning ? 'WARNING INFRACTION' : 'SITE SECURE'}
                    </h4>
                    <p className="text-[10px] font-mono text-neutral-300 leading-relaxed">
                      {isViolation
                        ? 'Workspace contains critical safety infractions. Missing protective gear detected.'
                        : isWarning
                        ? 'Minor safety equipment omissions found. Review warnings immediately.'
                        : 'All scanned elements meet regulatory workplace requirements.'}
                    </p>
                  </div>
                </div>

                {/* Score breakdown metrics */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Safety Metrics
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Compliance Rating</span>
                      <h4 className={`text-base font-bold font-mono mt-0.5 ${
                        isViolation ? 'text-red-500' : isWarning ? 'text-yellow-500' : 'text-blue-500'
                      }`}>
                        {compliance.score}%
                      </h4>
                    </div>

                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Inference Peak</span>
                      <h4 className="text-base font-bold font-mono text-white mt-0.5">
                        {(prediction.confidence * 100).toFixed(0)}%
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Alerts List */}
                {compliance.alerts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-bold tracking-widest text-red-500 uppercase border-b border-red-500/10 pb-2">
                      Active Infraction Alarms
                    </h3>
                    <div className="space-y-2">
                      {compliance.alerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/10 px-3 py-2 rounded-sm">
                          <AlertTriangle size={12} className="shrink-0 animate-pulse" />
                          <span>{alert}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary Counts */}
                <div className="space-y-3">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Personnel Audit Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-center">
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">People</span>
                      <span className="text-white font-bold text-sm">{compliance.summary.people}</span>
                    </div>
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">Helmets</span>
                      <span className="text-blue-500 font-bold text-sm">{compliance.summary.helmets}</span>
                    </div>
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">Vests</span>
                      <span className="text-blue-500 font-bold text-sm">{compliance.summary.vests}</span>
                    </div>
                  </div>
                </div>

                {/* Probability bar chart listings */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Class Probability Map
                  </h3>
                  <ProbabilityChart probabilities={prediction.all_probabilities} />
                </div>

                {/* Operations CTAs */}
                <div className="pt-4 border-t border-white/5 flex flex-col gap-2.5">
                  <button
                    onClick={exportReport}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white text-black hover:bg-neutral-200 text-xs font-mono font-bold tracking-widest uppercase rounded-sm shadow-sm cursor-pointer transition-all"
                  >
                    <Download size={14} />
                    Export Audit Report
                  </button>

                  <button
                    onClick={handleFileClear}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/8 hover:border-white/12 hover:bg-white/10 text-xs font-mono font-bold tracking-widest uppercase rounded-sm text-neutral-400 hover:text-white cursor-pointer transition-all"
                  >
                    <RotateCcw size={14} />
                    Scrap Inspection
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="p-4 rounded-sm border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-mono flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
