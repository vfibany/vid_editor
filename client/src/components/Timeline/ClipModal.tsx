import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCw, FlipHorizontal, FlipVertical, Sliders, Scissors, Maximize2, Layers, Play, Pause, EyeOff } from 'lucide-react';
import { useProjectStore } from '../../state/useProjectStore';

interface ClipEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackType: 'visuals' | 'audio_tracks' | 'captions' | null;
  item: any | null;
}

const BACKEND_STATIC_URL = 'http://localhost:4000';

export default function ClipEffectsModal({ isOpen, onClose, trackType, item }: ClipEffectsModalProps) {
  const { config, setConfig, saveProjectConfig, currentProject } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Core Properties State Layout
  const [rotation, setRotation] = useState<number>(0);
  const [flipVertical, setFlipVertical] = useState<boolean>(false);
  const [flipHorizontal, setFlipHorizontal] = useState<boolean>(false);
  const [zoomStart, setZoomStart] = useState<number>(100);
  const [zoomEnd, setZoomEnd] = useState<number>(100);
  const [sourceStartSec, setSourceStartSec] = useState<number>(0);
  const [sourceEndSec, setSourceEndSec] = useState<number>(3);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(true);

  // 🚀 MASK REGION SELECTION ENGINE STATE
  const [isMaskActive, setIsMaskActive] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startCoords, setStartCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [maskRect, setMaskRect] = useState<{ x: number; y: number; w: number; h: number }>({ x: 10, y: 10, w: 30, h: 20 });

  const maxSourceLimitSec = item?.source_total_ms ? item.source_total_ms / 1000 : 30;

  // Resolve Asset Endpoint Layout URLs
  const normalizedAsset = item?.asset?.startsWith('public/') ? item.asset : `public/${item?.asset}`;
  const absoluteAssetUrl = item ? `${BACKEND_STATIC_URL}/projects/${currentProject}/${normalizedAsset}` : '';
  const isVideo = absoluteAssetUrl.toLowerCase().split('?')[0].endsWith('.mp4') || absoluteAssetUrl.toLowerCase().split('?')[0].endsWith('.mov');

  useEffect(() => {
    if (item) {
      setRotation(item.rotation || 0);
      setFlipVertical(item.flipped || false);
      setFlipHorizontal(item.flop || false);
      
      const startSec = (item.source_start_ms || 0) / 1000;
      const durationSec = (item.duration_ms || 3000) / 1000;
      
      setSourceStartSec(startSec);
      setSourceEndSec(startSec + durationSec);
      setZoomStart(item.zoom_start !== undefined ? item.zoom_start : (item.zoom || 100));
      setZoomEnd(item.zoom_end !== undefined ? item.zoom_end : (item.zoom || 100));

      // Locate if an existing blur layout belongs to this clip target
      const existingBlur = config.effects?.find((fx: any) => fx.target_visual_id === item.id);
      if (existingBlur && existingBlur.style) {
        setIsMaskActive(true);
        setMaskRect({
          x: existingBlur.style.x_pct,
          y: existingBlur.style.y_pct,
          w: existingBlur.style.width_pct,
          h: existingBlur.style.height_pct
        });
      } else {
        setIsMaskActive(false);
      }
    }
  }, [item, isOpen]);

  // Keep live preview loop bounded inside the active clip slice window
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    const handleTimeUpdate = () => {
      if (video.currentTime < sourceStartSec || video.currentTime > sourceEndSec) {
        video.currentTime = sourceStartSec;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [sourceStartSec, sourceEndSec, isVideo]);

  if (!isOpen || !item || !trackType) return null;

  // 🚀 INTERACTIVE MOUSE DRAWING EVENT HANDLERS
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMaskActive || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setIsDrawing(true);
    setStartCoords({ x, y });
    setMaskRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
    const currentY = ((e.clientY - rect.top) / rect.height) * 100;

    const x = Math.max(0, Math.min(startCoords.x, currentX));
    const y = Math.max(0, Math.min(startCoords.y, currentY));
    const w = Math.min(100 - x, Math.abs(startCoords.x - currentX));
    const h = Math.min(100 - y, Math.abs(startCoords.y - currentY));

    setMaskRect({ x, y, w, h });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const togglePreviewPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPreviewPlaying) video.pause(); else video.play();
    setIsPreviewPlaying(!isPreviewPlaying);
  };

  const handleApplyChanges = async () => {
    if (!config || !trackType) return;

    const startMs = sourceStartSec * 1000;
    const computedDurationMs = Math.max(200, (sourceEndSec - sourceStartSec) * 1000);

    // 1. Update Video Core Properties Array
    const updatedTrackItems = config[trackType].map((trackItem: any) => {
      if (trackItem.id === item.id) {
        return {
          ...trackItem,
          rotation,
          flipped: flipVertical,
          flop: flipHorizontal,
          duration_ms: computedDurationMs,
          source_start_ms: startMs,
          zoom_start: zoomStart,
          zoom_end: zoomEnd
        };
      }
      return trackItem;
    });

    // 2. Sync corresponding effects masking layer elements matrix
    let filteredEffects = [...(config.effects || [])].filter((fx: any) => fx.target_visual_id !== item.id);

    if (isMaskActive && maskRect.w > 1 && maskRect.h > 1) {
      filteredEffects.push({
        id: `blur_${item.id}_${Math.random().toString(36).substring(2, 7)}`,
        type: 'blur',
        target_visual_id: item.id,
        start_ms: item.start_ms, // Pins automatically over the target sequence
        duration_ms: computedDurationMs,
        style: {
          x_pct: Math.round(maskRect.x),
          y_pct: Math.round(maskRect.y),
          width_pct: Math.round(maskRect.w),
          height_pct: Math.round(maskRect.h),
          blur_radius_px: 24
        }
      });
    }

    setConfig({ 
      ...config, 
      [trackType]: updatedTrackItems,
      effects: filteredEffects
    });

    await saveProjectConfig();
    onClose();
  };

  const livePreviewStyles = {
    transform: `rotate(${rotation}deg) scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1}) scale(${zoomStart / 100})`,
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col text-neutral-200">
        
        {/* Global Toolbar Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-blue-400">
            <Sliders size={16} />
            <h3 className="text-xs font-bold tracking-widest uppercase font-mono">Quick Asset Inspector</h3>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-300 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        {/* Workspace Splice Core Layout Grid */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto max-h-[80vh] text-xs">
          
          {/* LEFT CONTAINER: Canvas Stage Frame Wrapper */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={12} className="text-blue-400" /> Active Stage Preview
              </span>
              {isMaskActive && (
                <span className="text-[9px] font-mono text-amber-400 animate-pulse bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  Drag on video to draw mask box
                </span>
              )}
            </div>

            <div 
              ref={stageRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`relative bg-neutral-950 border border-neutral-800 rounded-xl aspect-video w-full overflow-hidden flex items-center justify-center shadow-inner group ${isMaskActive ? 'cursor-crosshair' : ''}`}
            >
              {isVideo ? (
                <video 
                  ref={videoRef}
                  src={absoluteAssetUrl}
                  style={livePreviewStyles}
                  className="w-full h-full object-cover origin-center select-none pointer-events-none"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img 
                  src={absoluteAssetUrl}
                  style={livePreviewStyles}
                  className="w-full h-full object-cover origin-center select-none pointer-events-none"
                  alt="Static Stream Content"
                />
              )}

              {/* 🚀 HARDWARE-ACCELERATED PREVIEW BLUR OVERLAY MASK */}
              {isMaskActive && (
                <div 
                  style={{
                    position: 'absolute',
                    left: `${maskRect.x}%`,
                    top: `${maskRect.y}%`,
                    width: `${maskRect.w}%`,
                    height: `${maskRect.h}%`,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                  className="border-2 border-dashed border-amber-400 bg-amber-400/10 shadow-lg pointer-events-none rounded transition-[backdrop-filter]"
                />
              )}

              {/* Video control transport shortcut overlay badge */}
              {isVideo && (
                <button 
                  onClick={togglePreviewPlayback}
                  className="absolute bottom-3 left-3 bg-black/70 hover:bg-black/90 text-white backdrop-blur px-2.5 py-1 rounded-md border border-neutral-800 flex items-center gap-1.5 transition text-[10px] font-mono z-20"
                >
                  {isPreviewPlaying ? <Pause size={10} /> : <Play size={10} />}
                  <span>{isPreviewPlaying ? "Pause Loop" : "Play Loop"}</span>
                </button>
              )}
            </div>
            
            <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/60 font-mono text-neutral-400 text-[11px] truncate">
              <span className="text-neutral-600 font-bold mr-1 uppercase text-[9px]">File:</span>
              {item.asset?.split('/').pop()}
            </div>
          </div>

          {/* RIGHT CONTAINER: Control Sliders Matrix */}
          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            
            {/* Slices Component */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Scissors size={12} className="text-amber-400" /> Timeline Splice Trimmer
              </span>
              <div className="bg-neutral-950 p-3 border border-neutral-800 rounded-xl space-y-3">
                <div className="space-y-1.5">
                  <div className="relative h-3 bg-neutral-900 border border-neutral-800 rounded-md overflow-hidden">
                    <div 
                      className="absolute top-0 bottom-0 bg-amber-500/20 border-x-2 border-amber-500"
                      style={{
                        left: `${(sourceStartSec / maxSourceLimitSec) * 100}%`,
                        width: `${((sourceEndSec - sourceStartSec) / maxSourceLimitSec) * 100}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[9px] text-neutral-500 px-0.5">
                    <span>In: {sourceStartSec.toFixed(1)}s</span>
                    <span className="text-amber-400 font-bold">Total: {Math.max(0.1, sourceEndSec - sourceStartSec).toFixed(1)}s</span>
                    <span>Out: {sourceEndSec.toFixed(1)}s</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="range" min="0" max={maxSourceLimitSec} step="0.1" value={sourceStartSec}
                    onChange={(e) => setSourceStartSec(Math.min(parseFloat(e.target.value), sourceEndSec - 0.1))}
                    className="w-full accent-amber-500 h-1 bg-neutral-900 rounded cursor-pointer"
                  />
                  <input 
                    type="range" min="0" max={maxSourceLimitSec} step="0.1" value={sourceEndSec}
                    onChange={(e) => setSourceEndSec(Math.max(parseFloat(e.target.value), sourceStartSec + 0.1))}
                    className="w-full accent-amber-500 h-1 bg-neutral-900 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 🚀 BLUR REGION CONFIGURATION PANEL */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <EyeOff size={12} className="text-amber-400" /> Layer Blur Masking Controls
              </span>
              <div className="bg-neutral-950 p-3.5 border border-neutral-800 rounded-xl flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h5 className="font-bold text-neutral-200">Enable Region Blur</h5>
                  <p className="text-[10px] text-neutral-500 font-medium">Draw a rectangular mask bounding layout on screen to redact information.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMaskActive(!isMaskActive)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-wide transition border font-mono ${isMaskActive ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-md' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'}`}
                >
                  {isMaskActive ? 'ACTIVE' : 'DISABLED'}
                </button>
              </div>
            </div>

            {/* Geometric Transforms */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <RotateCw size={12} className="text-purple-400" /> Geometry Transforms
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setRotation((prev) => (prev + 90) % 360)} className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition font-mono">
                  <RotateCw size={12} className="text-purple-400" />
                  <span>Rotate ({rotation}°)</span>
                </button>
                <button onClick={() => setFlipHorizontal(!flipHorizontal)} className={`border p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition font-mono ${flipHorizontal ? 'bg-purple-500/10 border-purple-500 text-purple-300' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'}`}>
                  <FlipHorizontal size={12} className="text-purple-400" />
                  <span>Flip X</span>
                </button>
                <button onClick={() => setFlipVertical(!flipVertical)} className={`border p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition font-mono ${flipVertical ? 'bg-purple-500/10 border-purple-500 text-purple-300' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'}`}>
                  <FlipVertical size={12} className="text-purple-400" />
                  <span>Flip Y</span>
                </button>
              </div>
            </div>

            {/* Zoom Scales */}
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Maximize2 size={12} className="text-emerald-400" /> Dimension Zoom Focal Matrix
              </span>
              <div className="bg-neutral-950 p-3 border border-neutral-800 rounded-xl space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between font-mono text-[9px] text-neutral-400">
                    <span>Start:</span> <span className="text-emerald-400 font-bold">{zoomStart}%</span>
                  </div>
                  <input type="range" min="100" max="250" step="5" value={zoomStart} onChange={(e) => { const val = parseInt(e.target.value); setZoomStart(val); if (zoomEnd === zoomStart) setZoomEnd(val); }} className="w-full accent-emerald-500 h-1 bg-neutral-900 rounded-lg" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between font-mono text-[9px] text-neutral-400">
                    <span>End:</span> <span className="text-emerald-400 font-bold">{zoomEnd}%</span>
                  </div>
                  <input type="range" min="100" max="250" step="5" value={zoomEnd} onChange={(e) => setZoomEnd(parseInt(e.target.value))} className="w-full accent-emerald-500 h-1 bg-neutral-900 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Save Action Buttons */}
            <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-950 border border-transparent hover:border-neutral-800 transition text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleApplyChanges} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg active:scale-[0.98] transition">
                Save Track Configuration
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}