'use client';

import React, { useState, useEffect } from 'react';
import { ppeService } from '../services/ppeService';
import { PredictionResponse } from '../types';
import UploadZone from './UploadZone';
import BoundingBoxOverlay from './BoundingBoxOverlay';
import ProbabilityChart from './ProbabilityChart';
import { Download, RotateCcw, Play, Info, Check, ScanSearch, ImageIcon } from 'lucide-react';
import Image from 'next/image';

export default function ImageInspectionTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

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
    setUploadProgress(15);
    setError(null);

    try {
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 95;
          }
          return prev + 15;
        });
      }, 80);

      const res = await ppeService.predictImage(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      clearInterval(interval);
      setUploadProgress(100);
      
      setTimeout(() => {
        setPrediction(res);
        setIsProcessing(false);
      }, 300);

    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Server failed to process the image. Ensure the backend is running.';
      setError(errMsg);
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const exportReport = () => {
    if (!prediction || !selectedFile) return;

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
      audit_status: prediction.detections.some((d) => 
        d.class_name.toLowerCase().includes('no_') || d.class_name.toLowerCase().includes('none')
      ) ? 'VIOLATION_ALERT' : 'SECURE_COMPLIANT',
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

  const hasViolations = prediction?.detections.some((d) =>
    d.class_name.toLowerCase().includes('no_') || d.class_name.toLowerCase().includes('none')
  );

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
          High-Precision Image Inspection
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Perform high-precision compliance scanning across static worksite images
        </p>
      </div>

      {/* ===== Default State: Two-column Upload Layout ===== */}
      {!selectedFile && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          {/* Left Column - Upload Section */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">1.</span> Upload Inspection Image
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drag and drop an image file or click to browse.
              </p>
            </div>

            <UploadZone
              type="image"
              accept=".jpg,.jpeg,.png,.webp,.bmp"
              onFileSelect={handleFileSelect}
            />

            {/* Supported formats info bar */}
            <div className="info-bar mt-4">
              <Info size={14} className="text-primary shrink-0" />
              <span>
                <strong>Supported formats:</strong> JPG, PNG, WebP, BMP &nbsp;•&nbsp; Max size: 20MB &nbsp;•&nbsp; Recommended: JPG/PNG
              </span>
            </div>
          </div>

          {/* Right Column - Awaiting Status */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">2.</span> Awaiting Image
              </h2>
              <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center">
                <ImageIcon size={20} className="text-muted-foreground" />
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-5">
                <ScanSearch size={28} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">
                No image uploaded yet
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                Upload a worksite inspection photo to perform AI-powered PPE compliance analysis.
              </p>

              {/* Feature checklist */}
              <div className="space-y-3 text-left w-full max-w-xs">
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Detects protective equipment with bounding boxes</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Classifies compliance status per detection</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Exports detailed safety audit reports</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== File Selected - Preview + Actions ===== */}
      {selectedFile && !prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left Area (2/3) - Image Preview */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border p-5 rounded-xl shadow-sm h-[450px] flex flex-col justify-center items-center relative overflow-hidden">
              {localImageUrl && (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-2">
                  <Image
                    src={localImageUrl}
                    alt="Raw preview"
                    width={640}
                    height={480}
                    unoptimized
                    className="max-h-[380px] object-contain rounded-lg border border-border shadow-sm"
                  />
                  
                  {/* Loading state overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 transition-all rounded-lg">
                      <span className="text-sm font-semibold tracking-wide text-primary mb-3 animate-pulse">
                        Running Neural Network Inference ({uploadProgress}%)
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

          {/* Right Area (1/3) - Controls */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5 rounded-xl space-y-5 shadow-sm">
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">
                  Image Specifications
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
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-yellow-600 dark:text-yellow-500 font-bold">Ready</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={runInference}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-colors disabled:opacity-40"
                >
                  <Play size={14} />
                  Run AI Inference
                </button>

                <button
                  onClick={handleFileClear}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary border border-border hover:bg-accent text-sm font-semibold rounded-lg text-muted-foreground cursor-pointer transition-colors disabled:opacity-40"
                >
                  <RotateCcw size={14} />
                  Clear File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Prediction Results ===== */}
      {prediction && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Left (2/3) - Bounding Box View */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border p-5 rounded-xl shadow-sm h-[450px] flex items-center justify-center overflow-hidden">
              {localImageUrl && (
                <div className="w-full h-full flex items-center justify-center p-2 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg">
                  <BoundingBoxOverlay imageUrl={localImageUrl} detections={prediction.detections} className="border-0 bg-transparent p-0" />
                </div>
              )}
            </div>
          </div>

          {/* Right (1/3) - Results */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5 rounded-xl space-y-5 shadow-sm">
              
              {/* Compliance Header */}
              <div className={`p-4 border rounded-lg flex gap-3 ${
                hasViolations
                  ? 'border-destructive/20 bg-destructive/5 text-destructive'
                  : 'border-primary/20 bg-primary/5 text-primary'
              }`}>
                <div className="space-y-1 text-left">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Compliance Audit</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    {hasViolations ? 'VIOLATION DETECTED' : 'SITE SECURE'}
                  </h4>
                  <p className="text-xs leading-normal opacity-90">
                    {hasViolations 
                      ? 'Personnel lacking required protective safety gear (Helmet/Vest).'
                      : 'All detected targets match regulatory safety standards.'}
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Metadata Metrics
                </h3>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Dominant Class</span>
                    <h5 className="font-bold text-foreground truncate mt-0.5">
                      {prediction.predicted_class.replace('_', ' ')}
                    </h5>
                  </div>
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Inference Conf</span>
                    <h5 className="font-bold text-foreground mt-0.5">
                      {(prediction.confidence * 100).toFixed(0)}%
                    </h5>
                  </div>
                </div>
              </div>

              {/* Probability Chart */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Class Distribution
                </h3>
                <ProbabilityChart probabilities={prediction.all_probabilities} />
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-border flex flex-col gap-2">
                <button
                  onClick={exportReport}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold rounded-lg shadow-sm cursor-pointer transition-colors"
                >
                  <Download size={14} />
                  Export Audit JSON
                </button>

                <button
                  onClick={handleFileClear}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary border border-border hover:bg-accent text-sm font-semibold rounded-lg text-muted-foreground cursor-pointer transition-colors"
                >
                  <RotateCcw size={14} />
                  Scrap Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2 shadow-sm animate-fadeIn">
          <Info size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
