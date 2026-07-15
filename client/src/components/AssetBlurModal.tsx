import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, EyeOff } from 'lucide-react';
import { useProjectStore } from '../state/useProjectStore';
import { BrushOverlay } from './BrushOverlay';

type AssetBlurModalProps = {
  isOpen: boolean;
  onClose: () => void;
  asset: any | null;
};

type VideoMeta = {
  width: number;
  height: number;
  durationMs: number;
};

export default function AssetBlurModal({ isOpen, onClose, asset }: AssetBlurModalProps) {
  const { currentProject, config, fetchProjectData } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta>({
    width: config.render?.width || 1920,
    height: config.render?.height || 1080,
    durationMs: 3000,
  });
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(2000);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [exportStage, setExportStage] = useState<'idle' | 'loading' | 'processing' | 'muxing' | 'complete' | 'failed'>('idle');
  const [exportMessage, setExportMessage] = useState('');
  const [progressFrame, setProgressFrame] = useState<number | null>(null);
  const [totalFrames, setTotalFrames] = useState<number | null>(null);

  const mediaServeUrl = asset ? `/api/assets/serve?projectId=${currentProject}&relativePath=${encodeURIComponent(asset.relativePath)}` : '';
  const frameRate = config.render?.fps || 30;
  const startFrame = Math.round((startMs / 1000) * frameRate);
  const endFrame = Math.round((endMs / 1000) * frameRate);
  const selectedFrames = Math.max(1, endFrame - startFrame + 1);

  const previewLoopInfo = useMemo(() => {
    const previewStart = startMs / 1000;
    const previewEnd = endMs / 1000;
    return { previewStart, previewEnd };
  }, [startMs, endMs]);

  useEffect(() => {
    if (!isOpen || !asset) return;
    setPoints([]);
    setStartMs(0);
    setEndMs(2000);
    setExportStage('idle');
    setExportMessage('');
    setProgressFrame(null);
    setTotalFrames(null);
  }, [isOpen, asset]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.currentTime < previewLoopInfo.previewStart) {
        video.currentTime = previewLoopInfo.previewStart;
        return;
      }

      if (video.currentTime >= previewLoopInfo.previewEnd) {
        video.currentTime = previewLoopInfo.previewStart;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [previewLoopInfo.previewStart, previewLoopInfo.previewEnd]);

  if (!isOpen || !asset) return null;

  const handleMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || videoMeta.width;
    const height = video.videoHeight || videoMeta.height;
    const durationMs = Number.isFinite(video.duration) ? Math.max(1000, Math.round(video.duration * 1000)) : videoMeta.durationMs;

    setVideoMeta({ width, height, durationMs });
    setEndMs((current) => Math.min(durationMs, Math.max(2000, current)));
  };

  const clampRange = (nextStartMs: number, nextEndMs: number) => {
    const safeStart = Math.max(0, Math.min(nextStartMs, videoMeta.durationMs - 16));
    const safeEnd = Math.max(safeStart + 16, Math.min(nextEndMs, videoMeta.durationMs));
    return [safeStart, safeEnd] as const;
  };

  const percentPointsToNormalized = (percentPoints: [number, number][]) => percentPoints.map(([x, y]) => [
    Math.min(1, Math.max(0, (x / 100) * 10)),
    Math.min(1, Math.max(0, (y / 100) * 10)),
  ] as [number, number]);

  const handleSave = async () => {
    if (!currentProject || isSaving || points.length < 3 || endMs <= startMs) return;

    setIsSaving(true);
    setExportStage('loading');
    setExportMessage('Starting export pipeline...');
    try {
      const url = new URL('/api/assets/blur', window.location.origin);
      url.searchParams.set('projectId', currentProject);
      url.searchParams.set('relativePath', asset.relativePath);
      url.searchParams.set('duration_ms', String(videoMeta.durationMs));
      url.searchParams.set('width', String(videoMeta.width));
      url.searchParams.set('height', String(videoMeta.height));
      url.searchParams.set('fps', String(frameRate));
      url.searchParams.set('start_ms', String(startMs));
      url.searchParams.set('end_ms', String(endMs));
      url.searchParams.set('blur_px', '38');
      const normalizedPoints = percentPointsToNormalized(points);
      console.log('[blur export] percent points', points);
      console.log('[blur export] normalized points', normalizedPoints);
      url.searchParams.set('points', JSON.stringify(normalizedPoints));

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      await new Promise<void>((resolve, reject) => {
        const eventSource = new EventSource(url.toString());
        eventSourceRef.current = eventSource;

        eventSource.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.stage) setExportStage(data.stage);
            if (data.message) setExportMessage(data.message);
            if (typeof data.frame === 'number') setProgressFrame(data.frame);
            if (typeof data.total === 'number') setTotalFrames(data.total);

            if (data.stage === 'complete') {
              eventSource.close();
              eventSourceRef.current = null;
              await fetchProjectData(currentProject);
              resolve();
            }

            if (data.stage === 'failed') {
              eventSource.close();
              eventSourceRef.current = null;
              reject(new Error(data.message || data.error || 'Failed to create blurred asset'));
            }
          } catch (err) {
            reject(err);
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          eventSourceRef.current = null;
          reject(new Error('Blur export stream disconnected'));
        };
      });

      onClose();
    } catch (err) {
      console.error('Blur export failed', err);
      alert('Could not render the blurred .mov asset.');
    } finally {
      setIsSaving(false);
      setExportStage('idle');
      setExportMessage('');
      setProgressFrame(null);
      setTotalFrames(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col text-neutral-200">
        <div className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-cyan-400">
            <EyeOff size={16} />
            <h3 className="text-xs font-bold tracking-widest uppercase font-mono">Export Blur Asset</h3>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-300 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto max-h-[80vh] text-xs">
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <EyeOff size={12} className="text-cyan-400" /> Draw Blur Polygon
              </span>
              <span className="text-[9px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                Normalized frame-space capture
              </span>
            </div>

            <div className="relative bg-neutral-950 border border-neutral-800 rounded-xl aspect-video w-full overflow-hidden shadow-inner group">
              <video
                ref={videoRef}
                src={mediaServeUrl}
                className="w-full h-full object-contain origin-center select-none pointer-events-none"
                autoPlay
                muted
                playsInline
                onLoadedMetadata={handleMetadata}
                onPlay={(e) => {
                  const video = e.currentTarget;
                  if (video.currentTime < previewLoopInfo.previewStart || video.currentTime > previewLoopInfo.previewEnd) {
                    video.currentTime = previewLoopInfo.previewStart;
                  }
                }}
              />

              <div className="absolute inset-0">
                <BrushOverlay
                  videoWidth={videoMeta.width}
                  videoHeight={videoMeta.height}
                  onShapeComplete={setPoints}
                />
              </div>
            </div>

            <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/60 font-mono text-neutral-400 text-[11px] truncate space-y-1">
              <div>
                <span className="text-neutral-600 font-bold mr-1 uppercase text-[9px]">File:</span>
                {asset.name}
              </div>
              <div>
                <span className="text-neutral-600 font-bold mr-1 uppercase text-[9px]">Frames:</span>
                {startFrame} to {endFrame} of {Math.round((videoMeta.durationMs / 1000) * frameRate)}
              </div>
              <div>
                <span className="text-neutral-600 font-bold mr-1 uppercase text-[9px]">Selected:</span>
                {selectedFrames} frames
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <EyeOff size={12} className="text-cyan-400" /> Blur Time Range
              </span>
              <div className="bg-neutral-950 p-3 border border-neutral-800 rounded-xl space-y-3">
                <div className="space-y-1.5">
                  <div className="relative h-3 bg-neutral-900 border border-neutral-800 rounded-md overflow-hidden">
                    <div
                      className="absolute top-0 bottom-0 bg-cyan-500/20 border-x-2 border-cyan-500"
                      style={{
                        left: `${(startMs / videoMeta.durationMs) * 100}%`,
                        width: `${((endMs - startMs) / videoMeta.durationMs) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[9px] text-neutral-500 px-0.5">
                    <span>In: {(startMs / 1000).toFixed(2)}s</span>
                    <span className="text-cyan-400 font-bold">Frames {startFrame} - {endFrame}</span>
                    <span>Out: {(endMs / 1000).toFixed(2)}s</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, videoMeta.durationMs - 16)}
                    step="16"
                    value={startMs}
                    onChange={(e) => {
                      const [safeStart, safeEnd] = clampRange(Number(e.target.value), endMs);
                      setStartMs(safeStart);
                      setEndMs(safeEnd);
                    }}
                    className="w-full accent-cyan-500 h-1 bg-neutral-900 rounded cursor-pointer"
                  />
                  <input
                    type="range"
                    min="200"
                    max={Math.max(200, videoMeta.durationMs)}
                    step="16"
                    value={endMs}
                    onChange={(e) => {
                      const [safeStart, safeEnd] = clampRange(startMs, Number(e.target.value));
                      setStartMs(safeStart);
                      setEndMs(safeEnd);
                    }}
                    className="w-full accent-cyan-500 h-1 bg-neutral-900 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="bg-neutral-950 p-3 border border-neutral-800 rounded-xl space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Polygon State</div>
              <div className="text-[11px] text-neutral-300 font-mono">
                {points.length >= 3 ? `${points.length} percentage points captured` : 'Draw a closed-ish freehand loop on the video preview'}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono">
                {exportMessage || (exportStage === 'idle' ? 'Ready to export' : `Status: ${exportStage}`)}
              </div>
              {progressFrame !== null && totalFrames !== null && (
                <div className="text-[11px] text-cyan-300 font-mono">
                  Working frame {progressFrame} / {totalFrames}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-neutral-400 hover:text-neutral-200 hover:bg-neutral-950 border border-transparent hover:border-neutral-800 transition text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || points.length < 3 || endMs <= startMs}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold text-xs shadow-lg active:scale-[0.98] transition flex items-center gap-1.5"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>{isSaving ? 'Rendering File...' : 'Create file_blur.mov'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
