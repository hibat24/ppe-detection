'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DetectionItem } from '../types';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface BoundingBoxOverlayProps {
  imageUrl: string;
  detections: DetectionItem[];
  className?: string;
}

export default function BoundingBoxOverlay({ imageUrl, detections, className = '' }: BoundingBoxOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, naturalWidth: 1, naturalHeight: 1 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Function to recalculate layout dimensions
  const updateDimensions = () => {
    if (imageRef.current) {
      setDimensions({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
        naturalWidth: imageRef.current.naturalWidth || 1,
        naturalHeight: imageRef.current.naturalHeight || 1,
      });
    }
  };

  // Re-verify dimensions on load and window resize
  useEffect(() => {
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const scaleX = dimensions.width / dimensions.naturalWidth;
  const scaleY = dimensions.height / dimensions.naturalHeight;

  // Map class name to high-contrast colors
  const getClassStyles = (className: string) => {
    const name = className.toLowerCase();
    
    // Missing PPE elements (Red alert styling)
    if (
      name.includes('no_') || 
      name.includes('none') || 
      name.includes('without') || 
      name.includes('no-')
    ) {
      return {
        borderColor: 'rgba(239, 68, 68, 0.85)', // Tailwind red-500
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        textColor: 'text-white',
        badgeBg: 'bg-red-600',
        glow: '0 0 10px rgba(239, 68, 68, 0.3)',
      };
    }
    
    // Core PPE Equipments (Blue styling)
    if (
      name.includes('helmet') || 
      name.includes('vest') || 
      name.includes('goggle') || 
      name.includes('goggles') || 
      name.includes('glove') || 
      name.includes('gloves') || 
      name.includes('boots') || 
      name.includes('boot')
    ) {
      return {
        borderColor: 'rgba(37, 99, 235, 0.85)', // Tailwind blue-600
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        textColor: 'text-white',
        badgeBg: 'bg-blue-600',
        glow: '0 0 10px rgba(37, 99, 235, 0.3)',
      };
    }

    // Default detected elements (e.g. Person, zinc gray outline)
    return {
      borderColor: 'rgba(113, 113, 122, 0.85)', // Zinc-500
      backgroundColor: 'rgba(113, 113, 122, 0.08)',
      textColor: 'text-white',
      badgeBg: 'bg-zinc-600 dark:bg-zinc-700',
      glow: '0 0 8px rgba(113, 113, 122, 0.2)',
    };
  };

  return (
    <div ref={containerRef} className={`relative select-none max-w-full overflow-hidden flex items-center justify-center bg-muted/10 rounded-lg border border-border p-1 ${className}`}>
      <Image
        ref={imageRef}
        src={imageUrl}
        alt="Inference Detection Map"
        onLoad={updateDimensions}
        width={dimensions.naturalWidth || 640}
        height={dimensions.naturalHeight || 480}
        unoptimized
        className="max-h-[500px] object-contain max-w-full block rounded-sm shadow-xs"
      />

      {/* Render absolute Bounding Boxes */}
      {dimensions.width > 0 &&
        detections.map((detection, index) => {
          const { box, class_name, confidence } = detection;
          if (!box || box.length < 4) return null;

          const [xmin, ymin, xmax, ymax] = box;
          const left = xmin * scaleX;
          const top = ymin * scaleY;
          const width = (xmax - xmin) * scaleX;
          const height = (ymax - ymin) * scaleY;

          const styles = getClassStyles(class_name);
          const isHovered = hoveredIndex === index;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02 }}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                border: `1.5px solid ${styles.borderColor}`,
                boxShadow: isHovered ? styles.glow : 'none',
                backgroundColor: isHovered ? styles.backgroundColor : 'transparent',
                zIndex: isHovered ? 20 : 10,
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="group cursor-help transition-colors duration-150 rounded-[1px]"
            >
              {/* Box Micro Badge Label */}
              <div
                style={{
                  position: 'absolute',
                  top: '-18px',
                  left: '-1px',
                  whiteSpace: 'nowrap',
                }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${styles.badgeBg} ${styles.textColor} text-[8px] font-mono font-bold tracking-tight uppercase shadow-xs transition-all duration-150 z-20 ${
                  isHovered ? 'scale-105 opacity-100' : 'opacity-90'
                }`}
              >
                <span>{class_name.replace('_', ' ')}</span>
                <span>{(confidence * 100).toFixed(0)}%</span>
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}
