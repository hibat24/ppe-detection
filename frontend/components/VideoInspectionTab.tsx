'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ppeService } from '../services/ppeService';
import { VideoPredictionResponse } from '../types';
import UploadZone from './UploadZone';
import { Play, Film, RotateCcw, Info, Check, Grid3X3 } from 'lucide-react';

export default function VideoInspectionTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<VideoPredictionResponse | null>(null);

  // Video playback & seeking states
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, videoWidth: 1, videoHeight: 1 });
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
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 92) {
            clearInterval(interval);
            return 95;
          }
          return prev + 10;
        });
      }, 150);

      const res = await ppeService.predictVideo(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      clearInterval(interval);
      setUploadProgress(100);

      setTimeout(() => {
        setPrediction(res);
        setIsProcessing(false);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }
      }, 300);

    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Failed to analyze video. Ensure correct formats (MP4/AVI).';
      setError(errMsg);
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!prediction || !videoRef.current) return;
    const index = parseInt(e.target.value);
    setCurrentFrameIdx(index);

    const duration = videoRef.current.duration || videoDuration;

    if (duration && prediction.frame_predictions.length > 1) {
      const ratio = index / (prediction.frame_predictions.length - 1);
      videoRef.current.currentTime = ratio * duration;
    }
  };

  const updateVideoDimensions = () => {
    if (videoRef.current) {
      setDimensions({
        width: videoRef.current.clientWidth,
        height: videoRef.current.clientHeight,
        videoWidth: videoRef.current.videoWidth || 1,
        videoHeight: videoRef.current.videoHeight || 1,
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

  const currentFramePrediction = prediction?.frame_predictions[currentFrameIdx];
  const currentDetections = currentFramePrediction?.detections || [];

  const hasViolations = prediction?.predicted_class.toLowerCase().includes('no_') || 
                        prediction?.predicted_class.toLowerCase().includes('none');

  const getClassStyles = (className: string) => {
    const name = className.toLowerCase();
    if (name.includes('no_') || name.includes('none') || name.includes('without')) {
      return { borderColor: '#dc2626', badgeBg: 'bg-red-600' };
    }
    return { borderColor: '#2563eb', badgeBg: 'bg-blue-600' };
  };

  const scaleX = dimensions.videoWidth ? dimensions.width / dimensions.videoWidth : 1;
  const scaleY = dimensions.videoHeight ? dimensions.height / dimensions.videoHeight : 1;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Temporal Video Inspection
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Perform sampled compliance scanning across surveillance footage
        </p>
      </div>

      {/* ===== Default State: Two-column Upload Layout ===== */}
      {!selectedFile && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          {/* Left Column - Upload Section */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">1.</span> Upload Surveillance Video
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drag and drop a video file or click to browse.
              </p>
            </div>

            <UploadZone
              type="video"
              accept=".mp4,.avi,.mov,.mkv"
              maxSizeMB={200}
              onFileSelect={handleFileSelect}
            />

            {/* Supported formats info bar */}
            <div className="info-bar mt-4">
              <Info size={14} className="text-primary shrink-0" />
              <span>
                <strong>Supported formats:</strong> MP4, AVI, MOV, MKV &nbsp;•&nbsp; Max size: 200MB &nbsp;•&nbsp; Recommended: H.264
              </span>
            </div>
          </div>

          {/* Right Column - Awaiting Status */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">2.</span> Awaiting Video
              </h2>
              <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center">
                <Film size={20} className="text-muted-foreground" />
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-5">
                <Film size={28} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">
                No video uploaded yet
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                Upload a surveillance video (MP4 or AVI) to perform temporal compliance checks.
              </p>

              {/* Feature checklist */}
              <div className="space-y-3 text-left w-full max-w-xs">
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Validates video format and integrity</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Samples frames for compliance analysis</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Generates detailed inspection results</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== File Selected State ===== */}
      {selectedFile && !prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left Column (2/3) - Video Preview */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border p-5 rounded-xl shadow-sm h-[480px] flex flex-col justify-center items-center relative overflow-hidden">
              {localVideoUrl && (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-2">
                  <video
                    src={localVideoUrl}
                    className="max-h-[380px] object-contain rounded-lg border border-border shadow-sm"
                    controls
                    muted
                  />
                  
                  {/* Processing overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 transition-all rounded-lg">
                      <span className="text-sm font-semibold tracking-wide text-primary mb-3 animate-pulse">
                        Analyzing Temporal Video Slices ({uploadProgress}%)
                      </span>
                      <div className="w-56 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-100 rounded-full" 
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column (1/3) - Specifications + Actions */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5 rounded-xl space-y-5 shadow-sm">
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
                  Video Specifications
                </h3>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">File Name:</span>
                  <span className="text-foreground font-medium truncate max-w-[150px]">{selectedFile.name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">File Size:</span>
                  <span className="text-foreground font-medium">{formatFileSize(selectedFile.size)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-border/50">
                  <span className="text-muted-foreground">Target Frames:</span>
                  <span className="text-foreground font-medium">30 sampled slots</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={runVideoInference}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-colors disabled:opacity-40"
                >
                  <Play size={14} />
                  Analyze Video
                </button>

                <button
                  onClick={handleFileClear}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary border border-border hover:bg-accent text-sm font-semibold rounded-lg text-muted-foreground cursor-pointer transition-colors disabled:opacity-40"
                >
                  <RotateCcw size={14} />
                  Clear Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Prediction Results State ===== */}
      {prediction && localVideoUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left Column (2/3) - Timeline Inspector Viewport */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border p-5 rounded-xl shadow-sm h-[480px] flex flex-col">
              {/* Video screen container with boxes */}
              <div
                ref={containerRef}
                className="relative select-none flex-1 w-full overflow-hidden flex items-center justify-center bg-black rounded-lg border border-border"
              >
                <video
                  ref={videoRef}
                  src={localVideoUrl}
                  onLoadedMetadata={updateVideoDimensions}
                  onSeeked={updateVideoDimensions}
                  className="h-full max-h-[350px] object-contain max-w-full block w-full rounded-md"
                  controls={false}
                  muted
                  playsInline
                />

                {/* Absolute box coordinate overlays */}
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
                          backgroundColor: isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                          zIndex: isHovered ? 20 : 10,
                        }}
                        onMouseEnter={() => setHoveredIdx(index)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className="rounded-sm transition-colors"
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

              {/* Timeline slider scrub bar */}
              <div className="space-y-2 pt-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Frame Scrub Control:</span>
                  <span className="text-foreground font-semibold">
                    Frame {currentFramePrediction?.frame_index ?? 0} &bull; Sample {currentFrameIdx + 1}/{prediction.frame_predictions.length}
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={prediction.frame_predictions.length - 1}
                  value={currentFrameIdx}
                  onChange={handleTimelineChange}
                  className="w-full h-1.5 bg-secondary border border-border rounded-lg appearance-none cursor-ew-resize accent-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right Column (1/3) - Results Dashboard */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5 rounded-xl space-y-5 shadow-sm">
              
              {/* Compliance Header */}
              <div className={`p-4 border rounded-lg flex gap-3 ${
                hasViolations
                  ? 'border-destructive/20 bg-destructive/5 text-destructive'
                  : 'border-primary/20 bg-primary/5 text-primary'
              }`}>
                <div className="space-y-1 text-left">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Aggregated Audit</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    {hasViolations ? 'VIOLATIONS FOUND' : 'VIDEO COMPLIANT'}
                  </h4>
                  <p className="text-xs leading-normal opacity-90">
                    {hasViolations 
                      ? 'Safety infractions identified in multiple timeline frames.'
                      : 'Zero protective gear violations found in processed clips.'}
                  </p>
                </div>
              </div>

              {/* Global video stats */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Aggregate Statistics
                </h3>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Dominant Class</span>
                    <h5 className="font-bold text-foreground truncate mt-0.5">
                      {prediction.predicted_class.replace('_', ' ')}
                    </h5>
                  </div>
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Average Conf</span>
                    <h5 className="font-bold text-foreground mt-0.5">
                      {(prediction.confidence * 100).toFixed(0)}%
                    </h5>
                  </div>
                </div>
              </div>

              {/* Frame inspector */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Frame Inspector Details
                </h3>

                <div className="p-3 border border-border bg-secondary/30 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frame ID:</span>
                    <span className="text-foreground font-bold">{currentFramePrediction?.frame_index}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frame Target:</span>
                    <span className="text-foreground font-bold">{currentFramePrediction?.predicted_class.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Detections:</span>
                    <span className="text-foreground font-bold">{currentDetections.length} objects</span>
                  </div>

                  {currentDetections.length > 0 && (
                    <div className="pt-2 border-t border-border/80 space-y-1">
                      {currentDetections.map((d, index) => (
                        <div key={index} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{d.class_name.replace('_', ' ')}</span>
                          <span className="text-foreground font-semibold">{(d.confidence * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-border">
                <button
                  onClick={handleFileClear}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary border border-border hover:bg-accent text-sm font-semibold rounded-lg text-muted-foreground cursor-pointer transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset Analyzer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2.5 shadow-sm animate-fadeIn">
          <Info size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
