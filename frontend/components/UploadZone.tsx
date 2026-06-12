'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, AlertTriangle } from 'lucide-react';

interface UploadZoneProps {
  type: 'image' | 'video';
  accept: string;
  maxSizeMB?: number;
  onFileSelect: (file: File) => void;
  onFileClear?: () => void;
  uploadProgress?: number;
  isProcessing?: boolean;
}

export default function UploadZone({
  type,
  accept,
  maxSizeMB = 20,
  onFileSelect,
  onFileClear,
  uploadProgress = 0,
  isProcessing = false,
}: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): boolean => {
    setError(null);

    // Size validation
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size exceeds the limit of ${maxSizeMB}MB.`);
      return false;
    }

    // Type validation
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const acceptedExtensions = accept.split(',').map((ext) => ext.trim().toLowerCase());
    
    const isValidExtension = acceptedExtensions.some((ext) => {
      if (ext.startsWith('.')) {
        return fileExtension === ext;
      }
      return file.type.startsWith(ext.replace('*', ''));
    });

    if (!isValidExtension) {
      setError(`Unsupported file type. Please upload: ${accept}`);
      return false;
    }

    return true;
  };

  const processFile = (file: File) => {
    if (validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerInput = () => {
    inputRef.current?.click();
  };

  // Format accept string into display badges
  const formatBadges = accept
    .split(',')
    .map((ext) => ext.trim().replace('.', '').toUpperCase());

  return (
    <div className="w-full">
      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${isProcessing ? 'pointer-events-none opacity-80' : ''}`}
        onDragEnter={!isProcessing ? handleDrag : undefined}
        onDragOver={!isProcessing ? handleDrag : undefined}
        onDragLeave={!isProcessing ? handleDrag : undefined}
        onDrop={!isProcessing ? handleDrop : undefined}
        onClick={!isProcessing ? triggerInput : undefined}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="w-full flex flex-col items-center py-6">
            <div className="relative w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mb-4 border border-blue-500/25 animate-pulse">
              <UploadCloud size={24} className="text-blue-500" />
            </div>
            
            <h4 className="text-sm font-semibold text-foreground mb-2 animate-pulse-glow">
              Analyzing {type === 'video' ? 'Surveillance Stream' : 'Inspection Image'}...
            </h4>
            
            <p className="text-xs text-muted-foreground font-mono mb-4 uppercase tracking-wider">
              Neural Network Inference In Progress
            </p>

            {/* Premium Progress Bar */}
            <div className="w-64 bg-white/5 border border-white/5 rounded-full h-2 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_#2563eb]"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono mt-2 text-blue-400 font-bold">
              {uploadProgress}%
            </span>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4 transition-transform hover:scale-105 duration-200">
              <UploadCloud size={24} className="text-primary" />
            </div>

            <h4 className="text-sm font-semibold text-foreground mb-1.5">
              Drag & Drop {type === 'video' ? 'Video' : 'Image'}
            </h4>
            
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
              or click to browse. Max file size is {maxSizeMB}MB.
            </p>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              {formatBadges.map((badge) => (
                <span key={badge} className="format-badge">
                  {badge}
                </span>
              ))}
            </div>
          </>
        )}

        {error && !isProcessing && (
          <div className="flex items-center gap-1.5 bg-destructive/5 border border-destructive/20 text-destructive py-2 px-3.5 rounded-lg text-sm mt-4">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
