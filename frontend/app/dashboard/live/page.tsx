'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getWebSocketUrl } from '../../../lib/api';
import { LivePredictionResponse, DetectionItem } from '../../../types';
import { calculateCompliance } from '../../../lib/compliance';
import historyService from '../../../lib/history';
import { Camera, CameraOff, AlertTriangle, ShieldAlert, CheckCircle, Activity, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LivePrediction() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Interface toggles & indicators
  const [cameraActive, setCameraActive] = useState(false);
  const [wsStatus, setWsStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>('DISCONNECTED');
  const [currentPrediction, setCurrentPrediction] = useState<LivePredictionResponse | null>(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ time: string; cls: string; conf: number }[]>([]);

  // Performance & session telemetry accumulators
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const lastSendTimeRef = useRef(0);
  
  // Session audit records
  const sessionScoresRef = useRef<number[]>([]);
  const sessionAlertsRef = useRef<Set<string>>(new Set());
  const maxDetectionsRef = useRef(0);
  const lastActivePredictionRef = useRef<LivePredictionResponse | null>(null);

  // Cleanup effect on page exit
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const startSession = async () => {
    setError(null);
    setWsStatus('CONNECTING');
    sessionScoresRef.current = [];
    sessionAlertsRef.current.clear();
    maxDetectionsRef.current = 0;
    lastActivePredictionRef.current = null;
    lastFpsUpdateRef.current = Date.now();
    lastSendTimeRef.current = Date.now();

    try {
      // 1. Initialize Webcam access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      // 2. Establish WebSocket pipeline
      const wsUrl = getWebSocketUrl('/ws/live-prediction');
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsStatus('CONNECTED');
        console.log('Webcam inference websocket pipeline established.');
        // Kickstart frame streaming loop once connected
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
          lastActivePredictionRef.current = data;

          // Process compliance for the live frame
          const safeDetections = data.detections || [];
          const report = calculateCompliance(safeDetections);
          sessionScoresRef.current.push(report.score);
          report.alerts.forEach((a) => sessionAlertsRef.current.add(a));
          if (safeDetections.length > maxDetectionsRef.current) {
            maxDetectionsRef.current = safeDetections.length;
          }

          // Draw coordinates overlay
          drawBoundingBoxes(safeDetections);

          // Update safety log history
          const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setHistory((prev) => [
            { time: timeString, cls: data.predicted_class, conf: data.confidence },
            ...prev.slice(0, 7), // Cap logs at last 8 items
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

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Webcam permission was denied or device is already in use by another program.');
      stopSession();
    }
  };

  const stopSession = () => {
    // 1. Write session logs summary to history
    if (cameraActive && sessionScoresRef.current.length > 0 && lastActivePredictionRef.current) {
      const avgScore = Math.round(
        sessionScoresRef.current.reduce((a, b) => a + b, 0) / sessionScoresRef.current.length
      );
      const distinctAlerts = Array.from(sessionAlertsRef.current);
      const sessionStatus = avgScore < 70 ? 'VIOLATION' : avgScore < 100 ? 'WARNING' : 'SECURE';

      historyService.addHistoryItem({
        type: 'live',
        predictedClass: lastActivePredictionRef.current.predicted_class,
        confidence: lastActivePredictionRef.current.confidence,
        detectionsCount: maxDetectionsRef.current,
        fileName: 'Live Stream Telemetry Broadcast',
        complianceScore: avgScore,
        alerts: distinctAlerts,
        status: sessionStatus,
      });
    }

    // 2. Cancel next capture animations
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 3. Terminate WebSocket connection
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // 4. Stop Webcam media tracks
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // 5. Clear overlay canvas
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    setCameraActive(false);
    setWsStatus('DISCONNECTED');
    setCurrentPrediction(null);
    setFps(0);
  };

  // Frame streaming loop: Captures and sends frame to server every ~150ms (~7 FPS)
  const startFrameStreamingLoop = () => {
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

        // Render video onto canvas
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Capture Base64 compressed image (JPEG format)
          const base64Frame = canvas.toDataURL('image/jpeg', 0.6); // 0.6 compression quality keeps packet light
          
          // Throttle frames to every 150ms to keep stream light
          const now = Date.now();
          if (now - lastSendTimeRef.current >= 150) {
            socketRef.current.send(base64Frame);
            lastSendTimeRef.current = now;
          }
        }
      }

      // Continue polling frame loop
      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        animationFrameRef.current = requestAnimationFrame(streamFrame);
      }
    };

    animationFrameRef.current = requestAnimationFrame(streamFrame);
  };

  // Draw bounding boxes on absolute overlay canvas
  const drawBoundingBoxes = (detections: DetectionItem[] = []) => {
    const safeDetections = detections || [];
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Align canvas drawing dimensions with display size of video element
    const width = video.clientWidth;
    const height = video.clientHeight;
    
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    // Scale coordinates (YOLO coordinates relate to 640x480 canvas capture)
    const scaleX = width / 640;
    const scaleY = height / 480;

    ctx.lineWidth = 2;
    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'top';

    safeDetections.forEach((d) => {
      const [xmin, ymin, xmax, ymax] = d.box;
      const left = xmin * scaleX;
      const top = ymin * scaleY;
      const boxWidth = (xmax - xmin) * scaleX;
      const boxHeight = (ymax - ymin) * scaleY;

      const cls = d.class_name.toLowerCase();
      const isInfraction = cls.includes('no_') || cls === 'none' || cls.includes('without');

      // Style settings
      const color = isInfraction ? '#ef4444' : '#3b82f6';
      ctx.strokeStyle = color;
      
      // Draw Bounding Box Rectangle
      ctx.strokeRect(left, top, boxWidth, boxHeight);

      // Label Badge Text
      const labelText = `${d.class_name.replace('_', ' ').toUpperCase()} ${(d.confidence * 100).toFixed(0)}%`;
      const textWidth = ctx.measureText(labelText).width;
      
      ctx.fillStyle = color;
      ctx.fillRect(left - 1, top - 14, textWidth + 8, 14);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, left + 3, top - 11);
    });
  };

  // Compile compliance values for current frame
  const frameCompliance = currentPrediction ? calculateCompliance(currentPrediction.detections) : null;
  const isViolation = frameCompliance?.status === 'VIOLATION';
  const isWarning = frameCompliance?.status === 'WARNING';

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-mono uppercase">
            Live Stream HUD
          </h1>
          <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider mt-1">
            Real-time webcam telemetry stream utilizing high-frequency websocket broadcasting
          </p>
        </div>

        {/* Start / Stop Toggle buttons */}
        <button
          onClick={cameraActive ? stopSession : startSession}
          className={`flex items-center gap-2 px-6 py-2.5 text-xs font-mono font-bold tracking-widest uppercase rounded-sm cursor-pointer transition-all ${
            cameraActive
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.25)]'
              : 'bg-white hover:bg-neutral-200 text-black shadow-sm'
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
        <div className="p-4 rounded-sm border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-mono flex items-center gap-2.5">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stream Viewport Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel border-white/8 p-6 rounded-sm relative overflow-hidden flex flex-col justify-between">
            
            {/* Blinking Safety Halo Glow surrounding camera */}
            {cameraActive && frameCompliance && (
              <div className={`absolute inset-0 border-2 pointer-events-none transition-all duration-300 rounded-[1px] z-20 ${
                isViolation 
                  ? 'border-red-500/60 shadow-[inset_0_0_30px_rgba(239,68,68,0.15)]'
                  : isWarning
                  ? 'border-yellow-500/60 shadow-[inset_0_0_30px_rgba(234,179,8,0.15)]'
                  : 'border-blue-600/60 shadow-[inset_0_0_30px_rgba(59,130,246,0.15)]'
              }`} />
            )}

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-mono font-bold tracking-widest text-neutral-300 uppercase">
                Real-Time Video Telemetry
              </h3>

              {/* WebSocket Status Indicator */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-[10px] text-neutral-500">PIPELINE:</span>
                {wsStatus === 'CONNECTED' ? (
                  <span className="text-blue-500 flex items-center gap-1 font-bold">
                    <Activity size={12} className="animate-pulse" />
                    CONNECTED ({fps} FPS)
                  </span>
                ) : wsStatus === 'CONNECTING' ? (
                  <span className="text-yellow-500 flex items-center gap-1.5 font-bold">
                    <RefreshCw size={10} className="animate-spin" />
                    HANDSHAKING
                  </span>
                ) : (
                  <span className="text-neutral-500">DISCONNECTED</span>
                )}
              </div>
            </div>

            {/* Hidden canvas for image encoding */}
            <canvas ref={canvasRef} width={640} height={480} className="hidden" />

            {/* Webcam viewport container */}
            <div className="relative aspect-video w-full rounded-sm border border-white/5 bg-black overflow-hidden flex items-center justify-center">
              {!cameraActive && (
                <div className="text-center space-y-4 z-10">
                  <CameraOff size={32} className="text-neutral-600 mx-auto animate-pulse-glow" />
                  <p className="text-[10px] font-mono text-neutral-500 max-w-xs leading-relaxed">
                    Camera stream offline. Connect your webcam by clicking the "Broadcast Camera" button above to initiate live AI scanning.
                  </p>
                </div>
              )}
              
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                muted
                playsInline
              />

              {/* Absolute Canvas Overlay for drawing coordinate boxes */}
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none z-30 ${cameraActive ? 'block' : 'hidden'}`}
              />

              {/* Scanline active laser overlay */}
              {cameraActive && wsStatus === 'CONNECTED' && (
                <div className="animate-scanner pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Telemetry Console */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {!cameraActive || !frameCompliance ? (
              <motion.div
                key="offline"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-panel border-white/8 p-6 rounded-sm text-center py-24"
              >
                <ShieldAlert size={32} className="text-neutral-500 mx-auto mb-4 animate-pulse-glow" />
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-300 mb-2">
                  Awaiting Pipeline
                </h4>
                <p className="text-[10px] font-mono text-neutral-500 leading-relaxed max-w-xs mx-auto">
                  Telemetry logs and safety evaluations will display dynamically once webcam broadcasting is active.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="online"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="glass-panel border-white/8 p-6 rounded-sm space-y-6"
              >
                {/* Live Safety HUD Badge */}
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
                    <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">Live Evaluation</span>
                    <h4 className="text-sm font-bold uppercase tracking-wide">
                      {isViolation ? 'SAFETY VIOLATION' : isWarning ? 'WARNING ALARM' : 'HUD COMPLIANT'}
                    </h4>
                    <p className="text-[10px] font-mono text-neutral-300 leading-relaxed">
                      {isViolation
                        ? 'Workspace alarm active: Required PPE equipment missing.'
                        : isWarning
                        ? 'Safety infraction detected. Check personnel gear counts.'
                        : 'All scanned elements meet regulatory safety guidelines.'}
                    </p>
                  </div>
                </div>

                {/* Score telemetry highlights */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Active Telemetry Readout
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Scanned Node</span>
                      <h4 className="text-xs font-bold font-mono text-white truncate uppercase mt-0.5">
                        {currentPrediction?.predicted_class.replace('_', ' ') ?? 'None'}
                      </h4>
                    </div>

                    <div className="p-3 border border-white/5 bg-black/40 rounded-sm">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wide">Compliance Rating</span>
                      <h4 className={`text-sm font-bold font-mono mt-0.5 ${
                        isViolation ? 'text-red-500' : isWarning ? 'text-yellow-500' : 'text-blue-500'
                      }`}>
                        {frameCompliance.score}%
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Live Alarms List */}
                {frameCompliance.alerts.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-mono font-bold tracking-widest text-red-500 uppercase border-b border-red-500/10 pb-2">
                      Active Telemetry Alarms
                    </h3>
                    <div className="space-y-2">
                      {frameCompliance.alerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/10 px-3 py-1.5 rounded-sm">
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
                    Personnel Telemetry Summary
                  </h3>
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-center">
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">People</span>
                      <span className="text-white font-bold text-sm">{frameCompliance.summary.people}</span>
                    </div>
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">Helmets</span>
                      <span className="text-blue-500 font-bold text-sm">{frameCompliance.summary.helmets}</span>
                    </div>
                    <div className="p-2 border border-white/5 bg-black/20 rounded-sm">
                      <span className="text-neutral-500 block uppercase mb-1">Vests</span>
                      <span className="text-blue-500 font-bold text-sm">{frameCompliance.summary.vests}</span>
                    </div>
                  </div>
                </div>

                {/* Stream prediction history logs list */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono font-bold tracking-widest text-neutral-400 uppercase border-b border-white/5 pb-2">
                    Live Telemetry Ticker
                  </h3>

                  <div className="max-h-48 overflow-y-auto space-y-2.5 pr-1 text-[10px] font-mono">
                    {history.length === 0 ? (
                      <div className="text-neutral-500 py-6 text-center">
                        Telemetry ticker logs are empty.
                      </div>
                    ) : (
                      history.map((log, index) => (
                        <div
                          key={index}
                          className="flex justify-between items-center p-2 border border-white/5 bg-neutral-950/40 rounded-sm"
                        >
                          <div className="flex gap-2 items-center">
                            <span className="text-neutral-500 font-bold">{log.time}</span>
                            <span className={`font-semibold uppercase ${
                              log.cls.toLowerCase().includes('no_') || log.cls.toLowerCase().includes('none')
                                ? 'text-red-500'
                                : 'text-neutral-300'
                            }`}>
                              {log.cls.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-neutral-400">{(log.conf * 100).toFixed(0)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
