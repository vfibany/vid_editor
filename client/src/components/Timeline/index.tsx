import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { Play, Pause, Video, Music, Type, Cpu, Loader2, Plus, Trash2, Edit3, GripVertical, Wand2, Search, X, ArrowDown } from 'lucide-react';
import ClipEffectsModal from './ClipModal';
import CaptionModal from './CaptionModal';
import TitleModal from './TitleModal';

interface DraggingItemState {
  type: 'captions' | 'visuals' | 'audio_tracks';
  startX: number;
  items: { id: string; originalStartMs: number }[];
}

interface ResizingItemState {
  id: string;
  type: 'visuals' | 'audio_tracks';
  startX: number;
  originalDurationMs: number;
}

interface BlurResizeState {
  id: string;
  edge: 'start' | 'end';
  startX: number;
  originalStartMs: number;
  originalEndMs: number;
}

interface TimelineContextState {
  type: 'captions' | 'visuals' | 'audio_tracks';
  id: string;
  label: string;
  x: number;
  y: number;
  item: any;
  isEditable: boolean;
}

interface SearchResult {
  id: string;
  type: 'captions' | 'visuals' | 'audio_tracks';
  label: string;
  startMs: number;
}

const PX_PER_MS = 0.1;

export default function Timeline() {
  const {
    config,
    setConfig,
    saveProjectConfig,
    currentTimeMs,
    setCurrentTimeMs,
    isPlaying,
    setIsPlaying,
    removeTimelineEvent,
    currentProject
  } = useProjectStore();

  const trackContainerRef = useRef<HTMLDivElement>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingItem, setDraggingItem] = useState<DraggingItemState | null>(null);
  const [resizingItem, setResizingItem] = useState<ResizingItemState | null>(null);
  const [resizingBlurRegion, setResizingBlurRegion] = useState<BlurResizeState | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<'captions' | 'visuals' | 'audio_tracks' | null>(null);

  // Modal Workspace Orchestration
  const [activeModal, setActiveModal] = useState<'caption' | 'title' | null>(null);
  const [isFxModalOpen, setIsFxModalOpen] = useState(false);
  const [modalTargetTime, setModalTargetTime] = useState<number>(0);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);

  const [contextMenu, setContextMenu] = useState<TimelineContextState | null>(null);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [timeInputValue, setTimeInputValue] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fps = config?.render?.fps || 30;
  const frameMs = 1000 / fps;

  const snapToFrame = (ms: number) => Math.round(ms / frameMs) * frameMs;

  const getTimelineDurationMs = () => {
    let maxMs = config?.total_ms || 10000;
    config?.visuals?.forEach((v: any) => { maxMs = Math.max(maxMs, v.start_ms + (v.duration_ms || 0)); });
    config?.audio_tracks?.forEach((a: any) => { maxMs = Math.max(maxMs, a.start_ms + (a.duration_ms || 0)); });
    config?.captions?.forEach((c: any) => { maxMs = Math.max(maxMs, c.start_ms + (c.audio_duration_ms || 0)); });
    config?.blurRegions?.forEach((r: any) => { maxMs = Math.max(maxMs, r.end_ms || 0); });
    return Math.max(maxMs, 10000);
  };

  const totalDurationMs = getTimelineDurationMs();

  useEffect(() => {
    const dismissMenu = () => setContextMenu(null);
    window.addEventListener('click', dismissMenu);
    window.addEventListener('contextmenu', dismissMenu);
    return () => {
      window.removeEventListener('click', dismissMenu);
      window.removeEventListener('contextmenu', dismissMenu);
    };
  }, []);

  // Centralized Modal Dispatcher — Routing track item to its true workflow target
  const triggerTargetModalPipeline = (type: 'captions' | 'visuals' | 'audio_tracks', item: any) => {
    setModalTargetTime(item.start_ms);
    setEditingAsset(item);

    const isDynamicTitle = type === 'visuals' && (item.asset.includes('public/images/title_') || item.asset.includes('public/images/visual_title_'));

    if (type === 'captions') {
      setActiveModal('caption');
    } else if (isDynamicTitle) {
      setActiveModal('title');
    } else {
      // Traditional videos and images go straight to Clip Studio FX Matrix
      setIsFxModalOpen(true);
    }
  };

  const handleItemClick = (e: React.MouseEvent, type: 'captions' | 'visuals' | 'audio_tracks', item: any) => {
    e.stopPropagation();
    if (e.shiftKey) {
      if (selectedType && selectedType !== type) {
        setSelectedItemIds([item.id]);
        setSelectedType(type);
      } else {
        setSelectedType(type);
        setSelectedItemIds(prev =>
          prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
        );
      }
    } else {
      setSelectedItemIds([item.id]);
      setSelectedType(type);
    }
  };

  const handleCommitTimeChange = () => {
    setIsEditingTime(false);
    const parsedSec = parseFloat(timeInputValue);
    if (!isNaN(parsedSec)) {
      setCurrentTimeMs(snapToFrame(Math.max(0, Math.min(totalDurationMs, parsedSec * 1000))));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const frameStepMs = Math.round(1000 / fps);
      const currentActiveTime = useProjectStore.getState().currentTimeMs;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentTimeMs(Math.min(totalDurationMs, currentActiveTime + frameStepMs));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTimeMs(Math.max(0, currentActiveTime - frameStepMs));
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(!useProjectStore.getState().isPlaying);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalDurationMs, fps, setCurrentTimeMs, setIsPlaying]);

  // Handle item dragging mechanics
  useEffect(() => {
    if (!draggingItem || !trackContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - draggingItem.startX;
      const deltaMs = deltaX / PX_PER_MS;

      const modifiedTrackArray = config[draggingItem.type].map((item: any) => {
        const matchingDragItem = draggingItem.items.find(di => di.id === item.id);
        if (matchingDragItem) {
          return { ...item, start_ms: snapToFrame(Math.max(0, matchingDragItem.originalStartMs + deltaMs)) };
        }
        return item;
      });

      setConfig({ ...config, [draggingItem.type]: modifiedTrackArray });
    };

    const handleMouseUp = () => {
      setDraggingItem(null);
      saveProjectConfig();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingItem, config, setConfig, saveProjectConfig]);

  // Handle edge trimming mechanics
  useEffect(() => {
    if (!resizingItem || !trackContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingItem.startX;
      const deltaMs = deltaX / PX_PER_MS;
      let targetDurationMs = snapToFrame(Math.max(200, resizingItem.originalDurationMs + deltaMs));

      const modifiedTrack = config[resizingItem.type].map((item: any) => {
        if (item.id === resizingItem.id) {
          return { ...item, duration_ms: targetDurationMs };
        }
        return item;
      });

      let maxTrackTime = config.total_ms || 10000;
      config[resizingItem.type]?.forEach((item: any) => {
        const checkDuration = item.id === resizingItem.id ? targetDurationMs : (item.duration_ms || 3000);
        maxTrackTime = Math.max(maxTrackTime, item.start_ms + checkDuration);
      });

      setConfig({
        ...config,
        [resizingItem.type]: modifiedTrack,
        total_ms: Math.max(config.total_ms || 10000, maxTrackTime)
      });
    };

    const handleMouseUp = () => {
      setResizingItem(null);
      saveProjectConfig();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingItem, config, setConfig, saveProjectConfig]);

  useEffect(() => {
    if (!resizingBlurRegion || !trackContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingBlurRegion.startX;
      const deltaMs = deltaX / PX_PER_MS;

      let nextStartMs = resizingBlurRegion.originalStartMs;
      let nextEndMs = resizingBlurRegion.originalEndMs;

      if (resizingBlurRegion.edge === 'start') {
        nextStartMs = snapToFrame(Math.max(0, Math.min(resizingBlurRegion.originalEndMs - frameMs, resizingBlurRegion.originalStartMs + deltaMs)));
      } else {
        nextEndMs = snapToFrame(Math.max(resizingBlurRegion.originalStartMs + frameMs, resizingBlurRegion.originalEndMs + deltaMs));
      }

      const updatedBlurRegions = (config.blurRegions || []).map((region: any) => {
        if (region.id !== resizingBlurRegion.id) return region;
        return {
          ...region,
          start_ms: nextStartMs,
          end_ms: nextEndMs,
        };
      });

      setConfig({
        ...config,
        blurRegions: updatedBlurRegions,
        total_ms: Math.max(config.total_ms || 10000, nextEndMs),
      });
    };

    const handleMouseUp = () => {
      setResizingBlurRegion(null);
      saveProjectConfig();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingBlurRegion, config, frameMs, setConfig, saveProjectConfig]);

  const startBlockSlide = (e: React.MouseEvent, type: 'captions' | 'visuals' | 'audio_tracks', item: any) => {
    e.stopPropagation();
    e.preventDefault();

    let currentSelected = [...selectedItemIds];
    if (!currentSelected.includes(item.id) || selectedType !== type) {
      currentSelected = [item.id];
      setSelectedItemIds([item.id]);
      setSelectedType(type);
    }

    const dragItems = config[type]
      .filter((trackItem: any) => currentSelected.includes(trackItem.id))
      .map((trackItem: any) => ({ id: trackItem.id, originalStartMs: trackItem.start_ms }));

    setDraggingItem({ type, startX: e.clientX, items: dragItems });
  };

  const handleTimelineScrub = (clientX: number) => {
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();
    const absoluteX = clientX - rect.left + trackContainerRef.current.scrollLeft;
    setCurrentTimeMs(snapToFrame(Math.max(0, Math.min(totalDurationMs, absoluteX / PX_PER_MS))));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!trackContainerRef.current) return;

    try {
      const dataPayload = e.dataTransfer.getData('application/json');
      if (!dataPayload) return;
      const asset = JSON.parse(dataPayload);

      const rect = trackContainerRef.current.getBoundingClientRect();
      const absoluteX = e.clientX - rect.left + trackContainerRef.current.scrollLeft;
      const dropTimeMs = snapToFrame(Math.max(0, absoluteX / PX_PER_MS));

      const isWarioAudio = asset.name?.toLowerCase().includes('wario_synth');
      const trackType = (asset.type === 'audio' || isWarioAudio) ? 'audio_tracks' : 'visuals';
      const defaultDuration = 3000;

      const newEventBlock = {
        id: `${asset.type}_${Math.random().toString(36).substring(2, 11)}`,
        asset: `public/${asset.relativePath}`,
        start_ms: dropTimeMs,
        duration_ms: defaultDuration
      };

      const revisedTrackArray = [...(config[trackType] || []), newEventBlock];
      setConfig({
        ...config,
        total_ms: (dropTimeMs + defaultDuration) > totalDurationMs ? (dropTimeMs + defaultDuration) : totalDurationMs,
        [trackType]: revisedTrackArray
      });
      saveProjectConfig();
    } catch (err) {
      console.error(err);
    }
  };

  const triggerProductionRender = async () => {
    if (!currentProject || isRendering) return;
    setIsRendering(true);
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject })
      });
      const data = await response.json();
      if (response.ok) {
        alert(`🎉 Render Complete!\n${data.outputPath}`);
      } else {
        alert(`❌ Render Pipeline Fault:\n${data.details || data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("❌ Critical failure connecting to backend processing core.");
    } finally {
      setIsRendering(false);
    }
  };

  const filteredAmbientTracks = config?.audio_tracks?.filter((a: any) => {
    const assetPath = a.asset || '';
    const isNarrationLink = config.captions?.some((c: any) => c.audio_asset === assetPath);
    return !isNarrationLink && !assetPath.includes('preview_audio') && !a.id?.startsWith('track_audio_');
  }) || [];

  const searchResults: SearchResult[] = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];

    config?.captions?.forEach((caption: any) => {
      const label = `${caption.speaker || 'speaker'} ${caption.text || ''}`.toLowerCase();
      if (label.includes(q)) {
        results.push({ id: caption.id, type: 'captions', label: caption.text || 'Caption', startMs: caption.start_ms || 0 });
      }
    });

    config?.visuals?.forEach((visual: any) => {
      const assetLabel = (visual.asset || '').split('/').pop()?.split('?')[0] || 'Visual';
      const titleLabel = decodeURIComponent((visual.asset || '').split('?text=')[1] || '');
      const label = `${assetLabel} ${titleLabel}`.toLowerCase();
      if (label.includes(q)) {
        results.push({ id: visual.id, type: 'visuals', label: assetLabel, startMs: visual.start_ms || 0 });
      }
    });

    filteredAmbientTracks.forEach((audio: any) => {
      const label = (audio.asset || '').split('/').pop()?.split('?')[0] || 'Audio Track';
      if (label.toLowerCase().includes(q)) {
        results.push({ id: audio.id, type: 'audio_tracks', label, startMs: audio.start_ms || 0 });
      }
    });

    return results;
  }, [searchQuery, config?.captions, config?.visuals, filteredAmbientTracks]);

  const focusTimelineAtMs = (startMs: number) => {
    if (!trackContainerRef.current) return;
    const targetX = startMs * PX_PER_MS;
    const viewportWidth = trackContainerRef.current.clientWidth;
    trackContainerRef.current.scrollLeft = Math.max(0, targetX - viewportWidth * 0.28);
    setCurrentTimeMs(snapToFrame(Math.max(0, startMs)));
  };

  const jumpToSearchResult = (result?: SearchResult) => {
    if (!result) return;
    focusTimelineAtMs(result.startMs);
    setSelectedItemIds([result.id]);
    setSelectedType(result.type);
  };

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        });
      }
    };

    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;
    if (!searchQuery.trim()) return;
    if (searchResults.length === 0) return;
    jumpToSearchResult(searchResults[0]);
  }, [isSearchOpen, searchQuery, searchResults[0]?.id]);

  return (
    <div className="flex flex-col h-full bg-neutral-950 select-none relative">
      {isSearchOpen && (
        <div className="absolute top-3 right-3 z-[60] w-[280px] max-w-[calc(100vw-24px)] rounded-lg border border-neutral-800 bg-neutral-950/95 shadow-xl p-2.5 pointer-events-auto">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                  setSearchQuery('');
                }
                if (e.key === 'Enter') {
                  jumpToSearchResult(searchResults[0]);
                }
              }}
              placeholder="Search timeline"
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 pl-8 pr-7 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            />
            <button
              onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition"
              title="Close search"
            >
              <X size={12} />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-neutral-500">
            <span>{searchResults.length ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}` : 'No matches'}</span>
            <span>Ctrl/Cmd+F</span>
          </div>
          {searchResults.length > 0 && (
            <button
              onClick={() => jumpToSearchResult(searchResults[0])}
              className="mt-2 w-full rounded-md border border-blue-500/20 bg-blue-600/10 px-2.5 py-2 text-left text-xs text-blue-200 hover:bg-blue-600/20 transition flex items-center justify-between"
            >
              <div className="truncate">
                <div className="font-medium truncate">{searchResults[0].label}</div>
                <div className="text-[10px] text-blue-300/70 uppercase tracking-wider">First result</div>
              </div>
              <ArrowDown size={12} className="shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* Playback Header Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-900 bg-neutral-900/40 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (currentTimeMs >= totalDurationMs) setCurrentTimeMs(0);
              setIsPlaying(!isPlaying);
            }}
            className="w-9 h-9 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 flex items-center justify-center transition text-neutral-200"
          >
            {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
          </button>

          <div className="text-xs font-mono text-neutral-400 flex items-center">
            {isEditingTime ? (
              <input
                type="text" autoFocus value={timeInputValue}
                onChange={(e) => setTimeInputValue(e.target.value)}
                onBlur={handleCommitTimeChange}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCommitTimeChange(); if (e.key === 'Escape') setIsEditingTime(false); }}
                className="w-16 bg-neutral-800 border border-blue-500 rounded px-1 py-0.5 text-white font-bold text-center focus:outline-none"
              />
            ) : (
              <span
                onClick={() => { setTimeInputValue((currentTimeMs / 1000).toFixed(2)); setIsEditingTime(true); }}
                className="text-white font-bold cursor-pointer hover:bg-neutral-800 hover:text-blue-400 px-1.5 py-0.5 rounded transition"
              >
                {(currentTimeMs / 1000).toFixed(2)}s
              </span>
            )}
            <span className="mx-1.5 text-neutral-600">/</span>
            <span>{(totalDurationMs / 1000).toFixed(2)}s</span>
          </div>
        </div>

        <button
          onClick={triggerProductionRender} disabled={isRendering}
          className={`h-8 px-3 rounded-lg text-white font-medium text-xs flex items-center gap-1.5 transition shadow-lg ${isRendering ? 'bg-neutral-800 border border-neutral-700 text-neutral-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
        >
          {isRendering ? <Loader2 size={13} className="animate-spin" /> : <Cpu size={13} />}
          <span>{isRendering ? 'Rendering...' : 'Render Video'}</span>
        </button>
      </div>

      {/* Editor Main Content Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Layer Labels Track Column */}
        <div className="w-30 bg-neutral-950/90 border-r border-neutral-900 flex flex-col py-2 shrink-0 z-30 space-y-2.5">
          <div className="h-6 mb-1 flex items-center px-2.5 text-[9px] tracking-wider font-bold text-neutral-600 uppercase">Layers</div>
          
          <div className="h-11 flex items-center justify-between px-2.5 bg-neutral-900/10 rounded-l-md text-neutral-400">
            <div className="flex items-center gap-1.5 min-w-0"><Type size={13} className="text-blue-500 shrink-0" /><span className="text-[10px] font-semibold">Captions</span></div>
            <button onClick={() => { setModalTargetTime(currentTimeMs); setEditingAsset(null); setActiveModal('caption'); }} className="p-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md border border-blue-500/20 transition opacity-80 hover:opacity-100"><Plus size={13} /></button>
          </div>

          <div className="h-11 flex items-center justify-between px-2.5 bg-neutral-900/10 rounded-l-md text-neutral-400">
            <div className="flex items-center gap-1.5 min-w-0"><Video size={13} className="text-purple-500 shrink-0" /><span className="text-[10px] font-semibold">Visuals</span></div>
            <button onClick={() => { setModalTargetTime(currentTimeMs); setEditingAsset(null); setActiveModal('title'); }} className="p-1.5 bg-purple-600/10 text-purple-400 hover:bg-purple-600 hover:text-white rounded-md border border-purple-500/20 transition opacity-80 hover:opacity-100"><Plus size={13} /></button>
          </div>

          <div className="h-11 flex items-center px-2.5 bg-neutral-900/10 rounded-l-md text-neutral-400">
            <div className="flex items-center gap-1.5 min-w-0"><Music size={13} className="text-emerald-500 shrink-0" /><span className="text-[10px] font-semibold">Audio</span></div>
          </div>
        </div>

        {/* Right Scrollable Timeline Viewport Track */}
        <div
          ref={trackContainerRef}
          onClick={(e) => { handleTimelineScrub(e.clientX); setSelectedItemIds([]); setSelectedType(null); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`flex-1 overflow-x-auto overflow-y-auto py-2 transition-colors relative ${isDragOver ? 'bg-blue-950/5' : ''}`}
        >
          <div className="relative min-h-[220px] flex flex-col space-y-2.5" style={{ width: `${(totalDurationMs * PX_PER_MS) + 120}px` }}>
            {/* Horizontal Timeline Ruler Top Boundary */}
            <div className="h-6 border-b border-neutral-900 bg-neutral-950/40 relative w-full pointer-events-none mb-1">
              {Array.from({ length: Math.ceil(totalDurationMs / 1000) + 1 }).map((_, i) => (
                <div key={i} className="absolute text-[9px] font-mono text-neutral-500 border-l border-neutral-800/80 h-3 bottom-0 pl-1" style={{ left: `${i * 1000 * PX_PER_MS}px` }}>
                  {i}s
                </div>
              ))}
            </div>

            {/* Interactive Scrubbing Playhead Core */}
            <div className={`absolute top-0 bottom-0 w-[2px] bg-red-500 z-40 pointer-events-none ${isScrubbing ? 'shadow-[0_0_8px_rgba(239,68,68,0.7)] bg-red-400' : ''}`} style={{ left: `${currentTimeMs * PX_PER_MS}px` }}>
              <div
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setIsScrubbing(true); handleTimelineScrub(e.clientX); const move = (me: MouseEvent) => handleTimelineScrub(me.clientX); const up = () => { setIsScrubbing(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }}
                className="w-3.5 h-3.5 bg-red-500 rounded-full -translate-x-1/2 -mt-0.5 shadow-md cursor-ew-resize border border-neutral-950 pointer-events-auto"
              />
            </div>

            {/* TRACK 1: Captions Render Row */}
            <div className="h-11 bg-neutral-900/20 border border-neutral-900/40 rounded-md relative flex items-center w-full">
              {config?.captions?.map((c: any) => {
                const label = `[${c.speaker}] ${c.text}`;
                const isSelected = selectedItemIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: 'captions', id: c.id, label, x: e.clientX, y: e.clientY, item: c, isEditable: true }); }}
                    onMouseDown={e => startBlockSlide(e, 'captions', c)}
                    onClick={e => handleItemClick(e, 'captions', c)}
                    onDoubleClick={() => triggerTargetModalPipeline('captions', c)}
                    className={`absolute h-7 border rounded px-2 flex items-center text-[10px] text-blue-200 truncate font-medium cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-blue-400 border-white bg-blue-900/90 z-30 shadow-lg' : 'bg-blue-950/60 border-blue-500/40 hover:bg-blue-900/80 z-20'}`}
                    style={{ left: `${c.start_ms * PX_PER_MS}px`, width: `${(c.audio_duration_ms || 3000) * PX_PER_MS}px` }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: Visual Tracks Render Row */}
            <div className="h-11 bg-neutral-900/20 border border-neutral-900/40 rounded-md relative flex items-center w-full">
              {config?.visuals?.map((v: any) => {
                const isDynamicTitle = v.asset.includes('public/images/title_') || v.asset.includes('public/images/visual_title_');
                const displayLabel = isDynamicTitle ? `📝 Title: "${decodeURIComponent(v.asset.split('?text=')[1] || '')}"` : v.asset.split('/').pop()?.split('?')[0] || 'Visual Clip';
                const isSelected = selectedItemIds.includes(v.id);
                return (
                  <div
                    key={v.id}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: 'visuals', id: v.id, label: displayLabel, x: e.clientX, y: e.clientY, item: v, isEditable: true }); }}
                    onMouseDown={e => startBlockSlide(e, 'visuals', v)}
                    onClick={e => handleItemClick(e, 'visuals', v)}
                    onDoubleClick={() => triggerTargetModalPipeline('visuals', v)}
                    className={`group/item absolute h-7 border rounded px-2 flex items-center justify-between text-[10px] font-medium cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-purple-400 border-white bg-purple-900/90 z-30 shadow-lg' : isDynamicTitle ? 'bg-amber-950/60 border-amber-500/40 text-amber-200 hover:bg-amber-900/80 z-20' : 'bg-purple-950/60 border-purple-500/40 text-purple-200 hover:bg-purple-900/80 z-20'}`}
                    style={{ left: `${v.start_ms * PX_PER_MS}px`, width: `${v.duration_ms * PX_PER_MS}px` }}
                  >
                    <span className="truncate flex-1 pointer-events-none">{displayLabel}</span>
                    
                    {!isDynamicTitle && (
                      <button
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setEditingAsset(v); setIsFxModalOpen(true); }}
                        className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-purple-500/30 text-purple-300 transition mr-3 z-30 shrink-0"
                      >
                        <Wand2 size={11} />
                      </button>
                    )}

                    <div
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingItem({ id: v.id, type: 'visuals', startX: e.clientX, originalDurationMs: v.duration_ms }); }}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-purple-500/20 hover:bg-purple-500/80 rounded-r opacity-0 group-hover/item:opacity-100 cursor-ew-resize transition-opacity flex items-center justify-center z-30"
                    >
                      <GripVertical size={8} className="text-white/60 pointer-events-none" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: Background Audio Render Row */}
            <div className="h-11 bg-neutral-900/20 border border-neutral-900/40 rounded-md relative flex items-center w-full">
              {filteredAmbientTracks.map((a: any) => {
                const audioLabel = a.asset.split('/').pop() || 'Audio Track';
                const isSelected = selectedItemIds.includes(a.id);
                return (
                  <div
                    key={a.id}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: 'audio_tracks', id: a.id, label: audioLabel, x: e.clientX, y: e.clientY, item: a, isEditable: false }); }}
                    onMouseDown={e => startBlockSlide(e, 'audio_tracks', a)}
                    onClick={e => handleItemClick(e, 'audio_tracks', a)}
                    className={`group/item absolute h-7 border rounded px-2 flex items-center justify-between text-[10px] text-emerald-200 truncate font-medium cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-emerald-400 border-white bg-emerald-900/90 z-30 shadow-lg' : 'bg-emerald-950/60 border-emerald-500/40 hover:bg-emerald-900/80 z-20'}`}
                    style={{ left: `${a.start_ms * PX_PER_MS}px`, width: `${(a.duration_ms || 3000) * PX_PER_MS}px` }}
                  >
                    <span className="truncate flex-1 pointer-events-none">{audioLabel}</span>
                    <div
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingItem({ id: a.id, type: 'audio_tracks', startX: e.clientX, originalDurationMs: a.duration_ms || 3000 }); }}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-emerald-500/20 hover:bg-emerald-500/80 rounded-r opacity-0 group-hover/item:opacity-100 cursor-ew-resize transition z-30"
                    >
                      <GripVertical size={8} className="text-white/60 pointer-events-none" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: Blur Region Render Row */}
            <div className="h-11 bg-neutral-900/20 border border-neutral-900/40 rounded-md relative flex items-center w-full">
              {config?.blurRegions?.map((region: any) => {
                const regionWidth = Math.max(frameMs, (region.end_ms || region.start_ms) - region.start_ms);

                return (
                  <div
                    key={region.id}
                    className="group/item absolute h-7 border rounded px-2 flex items-center justify-between text-[10px] text-cyan-100 truncate font-medium cursor-default bg-cyan-950/60 border-cyan-500/40 hover:bg-cyan-900/80 z-20"
                    style={{ left: `${region.start_ms * PX_PER_MS}px`, width: `${regionWidth * PX_PER_MS}px` }}
                  >
                    <span className="truncate flex-1 pointer-events-none">Blur {region.blur_px}px</span>

                    <button
                      onClick={(e) => { e.stopPropagation(); removeTimelineEvent('blurRegions', region.id); }}
                      className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-cyan-500/30 text-cyan-200 transition mr-2 z-30 shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>

                    <div
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingBlurRegion({ id: region.id, edge: 'start', startX: e.clientX, originalStartMs: region.start_ms, originalEndMs: region.end_ms }); }}
                      className="absolute left-0 top-0 bottom-0 w-2 bg-cyan-500/20 hover:bg-cyan-500/80 rounded-l opacity-0 group-hover/item:opacity-100 cursor-ew-resize transition-opacity flex items-center justify-center z-30"
                    >
                      <GripVertical size={8} className="text-white/60 pointer-events-none" />
                    </div>

                    <div
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setResizingBlurRegion({ id: region.id, edge: 'end', startX: e.clientX, originalStartMs: region.start_ms, originalEndMs: region.end_ms }); }}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-cyan-500/20 hover:bg-cyan-500/80 rounded-r opacity-0 group-hover/item:opacity-100 cursor-ew-resize transition-opacity flex items-center justify-center z-30"
                    >
                      <GripVertical size={8} className="text-white/60 pointer-events-none" />
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </div>

      {/* Unified Action Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-neutral-950 border border-neutral-800 rounded-lg shadow-2xl p-1 z-50 min-w-[160px] flex flex-col"
          style={{ top: Math.min(window.innerHeight - 120, contextMenu.y), left: Math.min(window.innerWidth - 180, contextMenu.x) }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isEditable && (
            <button
              onClick={() => { triggerTargetModalPipeline(contextMenu.type, contextMenu.item); setContextMenu(null); }}
              className="w-full text-left px-2.5 py-1.5 text-xs text-neutral-200 hover:text-white hover:bg-neutral-900 rounded flex items-center gap-2 transition"
            >
              <Edit3 size={12} className="text-blue-400" />
              <span>Edit Asset Config</span>
            </button>
          )}
          {contextMenu.isEditable && <div className="h-[1px] bg-neutral-800/60 my-1" />}
          <button
            onClick={() => { removeTimelineEvent(contextMenu.type, contextMenu.id); saveProjectConfig(); setContextMenu(null); }}
            className="w-full text-left px-2.5 py-1.5 text-xs text-red-400 hover:text-white hover:bg-red-600/20 rounded flex items-center gap-2 transition"
          >
            <Trash2 size={12} className="text-red-500" />
            <span>Remove Element</span>
          </button>
        </div>
      )}

      {/* Layer Modal Portals */}
      <CaptionModal
        isOpen={activeModal === 'caption'}
        onClose={() => { setActiveModal(null); setEditingAsset(null); }}
        targetTimeMs={modalTargetTime}
        editingAsset={editingAsset}
      />
      
      <TitleModal
        isOpen={activeModal === 'title'}
        onClose={() => { setActiveModal(null); setEditingAsset(null); }}
        targetTimeMs={modalTargetTime}
        editingAsset={editingAsset}
      />

      <ClipEffectsModal 
        isOpen={isFxModalOpen}
        onClose={() => { setIsFxModalOpen(false); setEditingAsset(null); }}
        trackType="visuals"
        item={editingAsset}
      />
    </div>
  );
}
