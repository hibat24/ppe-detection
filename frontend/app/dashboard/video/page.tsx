'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ppeService } from '../../../services/ppeService';
import { VideoPredictionResponse, DetectionItem, FramePrediction } from '../../../types';
import UploadZone from '../../../components/UploadZone';
import BoundingBoxOverlay from '../../../components/BoundingBoxOverlay';
import ProbabilityChart from '../../../components/ProbabilityChart';
import { calculateCompliance, ComplianceReport } from '../../../lib/compliance';
import historyService from '../../../lib/history';
import { Play, Film, AlertTriangle, CheckCircle, Clock, RotateCcw, Shield, ShieldAlert, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VideoPrediction() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<VideoPredictionResponse | null>(null);
  
  // Aggregate compliance statistics
  const [overallCompliance, setOverallCompliance] = useState<{
    score: number;
    status: 'SECURE' | 'WARNING' | 'VIOLATION';
    allAlerts: string[];
  } | null>(null);

  // Video playback & seeking states
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
    setPrediction(null);
    setOverallCompliance(null);
    setCurrentFrameIdx(0);
    
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }
    
    const url = URL.createObjectURL(file);
    setLocalVideoUrl(url);
  };

  const handleFileClear = () => {
    setSelectedFile(null);
    setPrediction(null);
    setOverallCompliance(null);
    setError(null);
    setUploadProgress(0);
    setCurrentFrameIdx(0);
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
    }
  };

  const runVideoInference = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setUploadProgress(5);
    setError(null);

    try {
      // Step progress bar smoothly
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 92) {
            clearInterval(interval);
            return 95;
          }
          return prev + 12;
        });
      }, 250);

      const res = await ppeService.predictVideo(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      clearInterval(interval);
      setUploadProgress(100);

      // Calculate aggregate temporal safety metrics
      const frameReports = res.frame_predictions.map((f) => calculateCompliance(f.detections));
      const totalFramesCount = frameReports.length;
      
      const avgScore = totalFramesCount > 0
        ? Math.round(frameReports.reduce((acc, r) => acc + r.score, 0) / totalFramesCount)
        : 100;
        
      const allAlertsSet = new Set<string>();
      frameReports.forEach((r) => r.alerts.forEach((a) => allAlertsSet.add(a)));
      const distinctAlerts = Array.from(allAlertsSet);

      let overallStatus: 'SECURE' | 'WARNING' | 'VIOLATION' = 'SECURE';
      if (avgScore < 70) overallStatus = 'VIOLATION';
      else if (avgScore < 100) overallStatus = 'WARNING';

      const temporalReport = {
        score: avgScore,
        status: overallStatus,
        allAlerts: distinctAlerts,
      };

      setTimeout(() => {
        setPrediction(res);
        setOverallCompliance(temporalReport);
        setIsProcessing(false);

        // Seek to first frame prediction once loaded
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }

        // Save this video audit to history logs database
        historyService.addHistoryItem({
          type: 'video',
          predictedClass: res.predicted_class,
          confidence: res.confidence,
          detectionsCount: res.frame_predictions.reduce((acc, f) => acc + f.detections.length, 0),
          fileName: selectedFile.name,
          complianceScore: avgScore,
          alerts: distinctAlerts,
          status: overallStatus,
        });
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to analyze video. Ensure the video format is supported (MP4/AVI).');
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  // Seek video player to proportional time when sliding the timeline
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!prediction || !videoRef.current) return;
    const index = parseInt(e.target.value);
    setCurrentFrameIdx(index);

    const framePredict = prediction.frame_predictions[index];
    const duration = videoRef.current.duration || videoDuration;

    // Calculate seek time based on frame progress ratio
    if (duration && prediction.frame_predictions.length > 1) {
      const ratio = index / (prediction.frame_predictions.length - 1);
      videoRef.current.currentTime = ratio * duration;
    }
  };

  // Recalculate overlays bounding dimensions
  const updateVideoDimensions = () => {
    if (videoRef.current) {
      setDimensions({
        width: videoRef.current.clientWidth,
        height: videoRef.current.clientHeight,
      });
      if (videoRef.current.duration) {
        setVideoDuration(videoRef.current.duration);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateVideoDimensions);
    return () => window.removeEventListener('resize', updateVideoDimensions);
  }, [prediction]);

  // Extract detections for the currently active timeline frame
  const currentFramePrediction = prediction?.frame_predictions[currentFrameIdx];
  const currentDetections = currentFramePrediction?.detections || [];

  // Calculate compliance specifically for the active timeline frame
  const activeFrameReport = currentFramePrediction ? calculateCompliance(currentDetections) : null;

  const isViolation = overallCompliance?.status === 'VIOLATION';
  const isWarning = overallCompliance?.status === 'WARNING';

  // Map class name to coordinate style tags
  const getClassStyles = (className: string) => {
    const name = className.toLowerCase();
    if (name.includes('no_') || name.includes('none') || name.includes('without')) {
      return { borderColor: '#ef4444', badgeBg: 'bg-red-600', glow: '0 0 10px rgba(239, 68, 68, 0.4)' };
    }
    return { borderColor: '#3b82f6', badgeBg: 'bg-blue-600', glow: '0 0 10px rgba(59, 130, 246, 0.4)' };
  };

  // Bounding boxes inside video use standard proportional scaling
  const scaleX = videoRef.current ? dimensions.width / videoRef.current.videoWidth : 1;
  const scaleY = videoRef.current ? dimensions.height / videoRef.current.videoHeight : 1;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white font-mono uppercase">
          Temporal Video Analyzer
        </h1>
        <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider mt-1">
          Perform sampled safety compliance auditing across surveillance footage
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload & Video Viewports Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel border-white/8 p-6 rounded-sm">
            <h3 className="text-sm font-mono font-bold tracking-widest text-neutral-300 uppercase mb-5">
              Upload Surveillance Video
            </h3>

            <UploadZone
              type="video"
              accept=".mp4,.avi,.mov,.mkv"
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
                  onClick={runVideoInference}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white hover:text-white shadow-[0_0_15px_rgba(59,130,246,0.25)] text-xs font-mono font-bold tracking-widest uppercase rounded-sm transition-all cursor-pointer"
                >
                  Analyze Stream
                </button>
              </motion.div>
            )}
          </div>

          {/* Interactive Bounding-Box Video Viewport */}
          <AnimatePresence>
            {prediction && localVideoUrl && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="glass-panel border-white/8 p-6 rounded-sm space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono font-bold tracking-widest text-neutral-300 uppercase">
                    Temporal Compliance Timeline Inspector
                  </h3>
                  <span className="text-[10px] font-mono bg-white/5 border border-white/5 text-neutral-400 py-1 px-2.5 rounded-sm">
                    Sampled Frames: {prediction.frames_processed}
                  </span>
                </div>

                {/* Video Container viewport with overlaid boxes */}
                <div
                  ref={containerRef}
                  className="relative select-none max-w-full overflow-hidden flex items-center justify-center bg-black rounded-sm border border-white/5"
                >
                  <video
                    ref={videoRef}
                    src={localVideoUrl}
                    onLoadedMetadata={updateVideoDimensions}
                    onSeeked={updateVideoDimensions}
                    onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}
                    className="max-h-[500px] object-contain max-w-full block w-full"
                    controls={false}
                    muted
                    playsInline
                  />

                  {/* Absolute box coordinate overlay mapping */}
                  {dimensions.width > 0 &&
                    currentDetections.map((detection, index) => {
                      const { box, class_name, confidence } = detection;
                      if (!box || box.length < 4) return null;

                      const [xmin, ymin, xmax, ymax] = box;
                      const left = xmin * scaleX;
                      const top = ymin * scaleY;
                      const width = (xmax - xmin) * scaleX;
                      const height = (ymax - ymin) * scaleY;

                      const styles = getClassStyles(class_name);
                      const isHovered = hoveredIdx === index;

                      return (
                        <div
                          key={index}
                          style={{
                            position: 'absolute',
                            left: `${left}px`,
                            top: `${top}px`,
                            width: `${width}px`,
                            height: `${height}px`,
                            border: `1.5px solid ${styles.borderColor}`,
                            boxShadow: isHovered ? styles.glow : 'none',
                            backgroundColor: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                            zIndex: isHovered ? 20 : 10,
                          }}
                          onMouseEnter={() => setHoveredIdx(index)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className="rounded-[1px] transition-colors"
                        >
                          <div
                            style={{ position: 'absolute', top: '-18px', left: '-1px' }}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${styles.badgeBg} text-white text-[8px] font-mono font-bold uppercase tracking-tight shadow-sm z-20`}
                          >
                            <span>{class_name.replace('_', ' ')}</span>
                            <span>{(confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Range Slider for Scrubbing Frames */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-neutral-400">Timeline Slider scrub:</span>
                    <span className="text-white font-bold">
                      Frame {currentFramePrediction?.frame_index ?? 0} &bull; Sample {currentFrameIdx + 1}/{prediction.frame_predictions.length}
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={prediction.frame_predictions.length - 1}
                    value={currentFrameIdx}
                    onChange={handleTimelineChange}
                    className="w-full h-1.5 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg appearance-none cursor-ew-resize accent-blue-600 focus:outline-none transition-colors"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-neutral-500 uppercase tracking-widest">
                    <span>Video Start</span>
                    <span>Frame scrub timeline</span>
                    <span>Video End</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Video Prediction Data Column */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!prediction || !overallCompliance ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-panel border-white/8 p-6 rounded-sm text-center py-20"
              >
                <Film size={32} className="text-neutral-500 mx-auto mb-4 animate-pulse-glow" />
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-2">
                  Awaiting Video Stream
                </h4>
                <p className="text-[10px] font-mono text-neutral-500 leading-relaxed max-w-xs mx-auto">
                  Upload an inspection MP4 or AVI clip and click "Analyze Stream" to process safety frames. Use the scrubbing timeline to audit specific time intervals.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="glass-panel border-white/8 p-6 rounded-sm space-y-6"
              >
                {/* Global Video Safety Header */}
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
                    <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Aggregated Audit</span>
                    <h4 className="text-sm font-bold uppercase tracking-wide">
                      {isViolation ? 'VIOLATIONS ENCOUNTERED' : isWarning ? 'WARNING INFRACTIONS' : 'VIDEO AUDIT SECURE'}
                    </h4>
                    <p className="text-[10px] font-mono text-neutral-300 leading-relaxed">
                      {isViolation
                        ? 'Temporal scanning flagged safety violations during runtime.'
                        : isWarning
                        ? 'Safety gear warnings were identified at some video intervals.'
                        : 'No critical safety equipment violations detected across all processed video frames.'}
                    </p>
                  </div>
                </div>

                {/* Peak stats */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Global Aggregated Metrics
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Avg Safety Rating</span>
                      <h4 className={`text-base font-bold font-mono mt-0.5 ${
                        isViolation ? 'text-red-500' : isWarning ? 'text-yellow-500' : 'text-blue-500'
                      }`}>
                        {overallCompliance.score}%
                      </h4>
                    </div>

                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Peak Confidence</span>
                      <h4 className="text-base font-bold font-mono text-white mt-0.5">
                        {(prediction.confidence * 100).toFixed(0)}%
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Distinct video alarms list */}
                {overallCompliance.allAlerts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-bold tracking-widest text-red-500 uppercase border-b border-red-500/10 pb-2">
                      Video Infraction History
                    </h3>
                    <div className="space-y-2">
                      {overallCompliance.allAlerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/10 px-3 py-2 rounded-sm">
                          <AlertTriangle size={12} className="shrink-0 animate-pulse" />
                          <span>{alert}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Frame Detections list */}
                {activeFrameReport && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase">
                        Current Frame Inspector
                      </h3>
                      <span className={`text-[10px] font-mono font-bold ${
                        activeFrameReport.status === 'VIOLATION'
                          ? 'text-red-500'
                          : activeFrameReport.status === 'WARNING'
                          ? 'text-yellow-500'
                          : 'text-blue-500'
                      }`}>
                        {activeFrameReport.score}% Score
                      </span>
                    </div>

                    <div className="p-4 border border-white/5 bg-black/40 rounded-sm space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-neutral-500">FRAME NUMBER:</span>
                        <span className="text-white font-bold">{currentFramePrediction?.frame_index}</span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-neutral-500">FRAME EVALUATION:</span>
                        <span className="text-white font-bold uppercase">{currentFramePrediction?.predicted_class.replace('_', ' ')}</span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-neutral-500">PEOPLE IN FRAME:</span>
                        <span className="text-white font-bold">{activeFrameReport.summary.people}</span>
                      </div>

                      {/* Active Frame Alerts */}
                      {activeFrameReport.alerts.length > 0 && (
                        <div className="pt-2 border-t border-white/5 space-y-1.5">
                          {activeFrameReport.alerts.map((alert, index) => (
                            <div key={index} className="text-[9px] font-mono text-red-400 font-semibold flex items-center gap-1.5">
                              <AlertTriangle size={10} className="shrink-0" />
                              <span>{alert}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {currentDetections.length > 0 && (
                        <div className="pt-2.5 border-t border-white/5 space-y-1.5">
                          <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Detections list:</span>
                          {currentDetections.map((d, index) => (
                            <div key={index} className="flex justify-between items-center text-[9px] font-mono">
                              <span className="text-neutral-400 uppercase">{d.class_name.replace('_', ' ')}</span>
                              <span className="text-neutral-300">{(d.confidence * 100).toFixed(0)}% accuracy</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Navigation reset */}
                <div className="pt-4 border-t border-white/5">
                  <button
                    onClick={handleFileClear}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/8 hover:border-white/12 hover:bg-white/10 text-xs font-mono font-bold tracking-widest uppercase rounded-sm text-neutral-400 hover:text-white cursor-pointer transition-all"
                  >
                    <RotateCcw size={14} />
                    Reset Video Analyzer
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
