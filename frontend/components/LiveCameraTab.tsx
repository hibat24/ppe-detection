'use client';

import React, { useState, useEffect, useRef } from 'react';
import { WS_BASE_URL } from '../lib/api';
import { LivePredictionResponse } from '../types';
import { Camera, CameraOff, AlertTriangle, ShieldAlert, Activity, RefreshCw, Check, Radio, Info } from 'lucide-react';

export default function LiveCameraTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Interface toggles & indicators
  const [cameraActive, setCameraActive] = useState(false);
  const [wsStatus, setWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [currentPrediction, setCurrentPrediction] = useState<LivePredictionResponse | null>(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ time: string; cls: string; conf: number }[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error('Error playing video stream:', err);
      });
    }
  }, [stream, cameraActive]);

  // Performance monitoring variables
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const lastSendTimeRef = useRef(0);

  useEffect(() => {
    lastFpsUpdateRef.current = Date.now();
    lastSendTimeRef.current = Date.now();
  }, []);

  // Cleanup effect on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  async function startSession() {
    setError(null);
    setWsStatus('CONNECTING');

    try {
      // 1. Initialize Webcam access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });

      setStream(mediaStream);
      setCameraActive(true);

      // 2. Establish WebSocket pipeline
      const wsUrl = `${WS_BASE_URL}/ws/live-prediction`;
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsStatus('CONNECTED');
        console.log('Webcam inference websocket pipeline established.');
        startFrameStreamingLoop();
      };

      socket.onmessage = (event) => {
        try {
          const data: LivePredictionResponse = JSON.parse(event.data);
          
          if (data.error) {
            setError(data.error);
            return;
          }

          setCurrentPrediction(data);

          const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setHistory((prev) => [
            { time: timeString, cls: data.predicted_class, conf: data.confidence },
            ...prev.slice(0, 5), // Cap logs at last 6 items
          ]);

          // Compute FPS
          frameCountRef.current += 1;
          const now = Date.now();
          const duration = now - lastFpsUpdateRef.current;
          if (duration >= 1000) {
            setFps(Math.round((frameCountRef.current * 1000) / duration));
            frameCountRef.current = 0;
            lastFpsUpdateRef.current = now;
          }

        } catch (err) {
          console.warn('Failed to parse frame prediction payload:', err);
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setError('WebSocket error: Could not complete connection handshake with server.');
      };

      socket.onclose = () => {
        setWsStatus('DISCONNECTED');
        console.log('Webcam WebSocket closed.');
      };

      socketRef.current = socket;

    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      stopSession();
    }
  }

  function stopSession() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const activeStream = videoRef.current.srcObject as MediaStream;
      activeStream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);

    setCameraActive(false);
    setWsStatus('DISCONNECTED');
    setCurrentPrediction(null);
    setFps(0);
  }

  function startFrameStreamingLoop() {
    const streamFrame = () => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN &&
        videoRef.current &&
        canvasRef.current
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64Frame = canvas.toDataURL('image/jpeg', 0.6);
          const now = Date.now();
          if (now - lastSendTimeRef.current >= 150) {
            socketRef.current.send(base64Frame);
            lastSendTimeRef.current = now;
          }
        }
      }

      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        animationFrameRef.current = requestAnimationFrame(streamFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(streamFrame);
  }

  const isViolation = currentPrediction?.predicted_class.toLowerCase().includes('no_') || 
                      currentPrediction?.predicted_class.toLowerCase().includes('none');

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Live Camera Inspection
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Perform real-time compliance scanning across a live webcam stream
          </p>
        </div>

        <button
          onClick={cameraActive ? stopSession : startSession}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-colors ${
            cameraActive
              ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
          }`}
        >
          {cameraActive ? (
            <>
              <CameraOff size={14} />
              Terminate Feed
            </>
          ) : (
            <>
              <Camera size={14} />
              Broadcast Camera
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2.5 shadow-sm animate-fadeIn">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ===== Default (Camera Off): Two-column layout ===== */}
      {!cameraActive && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
          {/* Left Column - Camera viewport placeholder */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">1.</span> Camera Viewport
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your webcam to begin live compliance monitoring.
              </p>
            </div>

            {/* Camera off placeholder - interactive */}
            <div 
              onClick={startSession}
              className="w-full min-h-[260px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-center p-6 bg-card hover:border-primary hover:bg-primary/[0.02] cursor-pointer transition-all duration-200"
            >
              {/* Hidden canvas for encoding */}
              <canvas ref={canvasRef} width={640} height={480} className="hidden" />
              
              <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4 transition-transform hover:scale-105 duration-200">
                <Camera size={24} className="text-primary" />
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-1.5">
                Activate Webcam
              </h4>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
                or click here to start. Requires camera access permission.
              </p>
              <div>
                <span className="format-badge">WEBCAM FEED</span>
              </div>
            </div>

            {/* Device info bar */}
            <div className="info-bar mt-4">
              <Info size={14} className="text-primary shrink-0" />
              <span>
                <strong>Supported devices:</strong> Integrated Camera, USB Webcam &nbsp;•&nbsp; Standard: 480p/720p resolution
              </span>
            </div>
          </div>

          {/* Right Column - Awaiting Telemetry */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <span className="text-muted-foreground font-bold">2.</span> Awaiting Telemetry
              </h2>
              <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center">
                <Camera size={20} className="text-muted-foreground" />
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-5">
                <Radio size={28} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">
                No active feed yet
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                Activate the webcam broadcast to stream live frames for safety evaluation.
              </p>

              {/* Feature checklist */}
              <div className="space-y-3 text-left w-full max-w-xs">
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Establishes high-frequency WebSocket connection</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Streams live frames to YOLOv8 inference engine</span>
                </div>
                <div className="feature-check">
                  <div className="feature-check-icon">
                    <Check size={12} />
                  </div>
                  <span>Returns real-time bounding boxes and alerts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Camera Active: Stream + Telemetry ===== */}
      {cameraActive && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
          {/* Stream Viewport (2/3) */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border p-5 rounded-xl relative overflow-hidden h-[450px] flex flex-col justify-center items-center shadow-sm">
              
              {/* Clean border indicator for safety state */}
              {currentPrediction && (
                <div className={`absolute inset-0 border-2 pointer-events-none transition-colors duration-300 rounded-xl ${
                  isViolation 
                    ? 'border-destructive/40 bg-destructive/[0.01]'
                    : 'border-primary/40 bg-primary/[0.01]'
                }`} />
              )}

              {/* Hidden canvas for encoding */}
              <canvas ref={canvasRef} width={640} height={480} className="hidden" />

              {/* Webcam viewport */}
              <div className="relative aspect-video w-full rounded-lg bg-zinc-50 dark:bg-zinc-900/30 overflow-hidden flex items-center justify-center border border-border">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              </div>
            </div>
          </div>

          {/* Telemetry Console (1/3) */}
          <div className="space-y-6">
            <div className="bg-card border border-border p-5 rounded-xl space-y-5 shadow-sm">
              
              {/* Connection Status */}
              <div className="border-b border-border pb-3 flex justify-between items-center text-sm">
                <span className="text-muted-foreground">WS Pipeline:</span>
                {wsStatus === 'CONNECTED' ? (
                  <span className="text-primary flex items-center gap-1.5 font-bold">
                    <Activity size={14} className="animate-pulse" />
                    CONNECTED ({fps} FPS)
                  </span>
                ) : wsStatus === 'CONNECTING' ? (
                  <span className="text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5 font-bold">
                    <RefreshCw size={12} className="animate-spin" />
                    CONNECTING
                  </span>
                ) : (
                  <span className="text-muted-foreground font-bold">DISCONNECTED</span>
                )}
              </div>

              {/* Live Safety HUD Badge */}
              <div className={`p-4 border rounded-lg flex gap-3 ${
                isViolation
                  ? 'border-destructive/20 bg-destructive/5 text-destructive'
                  : currentPrediction
                  ? 'border-primary/20 bg-primary/5 text-primary'
                  : 'border-border bg-secondary/30 text-muted-foreground'
              }`}>
                <div className="space-y-1 text-left">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Live Evaluation</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider">
                    {isViolation ? 'SAFETY VIOLATION' : currentPrediction ? 'HUD COMPLIANT' : 'STABILIZING'}
                  </h4>
                  <p className="text-xs leading-normal opacity-90">
                    {isViolation 
                      ? 'Workspace alarm active: Required PPE missing.'
                      : currentPrediction
                      ? 'All scanned elements meet regulatory safety guidelines.'
                      : 'Webcam pipeline has initialized. Stream is processing initial frames...'}
                  </p>
                </div>
              </div>

              {/* Telemetry Readout */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Telemetry Target
                </h3>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Scanned Node</span>
                    <h5 className="font-bold text-foreground truncate mt-0.5">
                      {currentPrediction?.predicted_class.replace('_', ' ') ?? 'None'}
                    </h5>
                  </div>
                  <div className="p-3 border border-border bg-secondary/30 rounded-lg">
                    <span className="text-xs text-muted-foreground">Telemetry Conf</span>
                    <h5 className="font-bold text-foreground mt-0.5">
                      {currentPrediction ? `${(currentPrediction.confidence * 100).toFixed(0)}%` : '0%'}
                    </h5>
                  </div>
                </div>
              </div>

              {/* Ticker logs */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground border-b border-border pb-1.5">
                  Stream Ticker Logs
                </h3>

                <div className="max-h-40 overflow-y-auto space-y-1.5 text-sm">
                  {history.length === 0 ? (
                    <div className="text-muted-foreground py-6 text-center text-xs">
                      Logs will display here...
                    </div>
                  ) : (
                    history.map((log, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-2.5 border border-border bg-secondary/30 rounded-lg"
                      >
                        <div className="flex gap-2 items-center">
                          <span className="text-muted-foreground font-mono text-xs">{log.time}</span>
                          <span className={`font-bold text-xs ${
                            log.cls.toLowerCase().includes('no_') || log.cls.toLowerCase().includes('none')
                              ? 'text-destructive'
                              : 'text-foreground/80'
                          }`}>
                            {log.cls.replace('_', ' ')}
                          </span>
                        </div>
                        <span className="text-muted-foreground font-bold text-xs font-mono">{(log.conf * 100).toFixed(0)}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
