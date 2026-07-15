import { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import {
  UploadCloud,
  Film,
  Music,
  Image,
  Wand2,
  EyeOff,
  RefreshCw,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Search,
  Type,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { RawAsset } from '../../types';
import AssetBlurModal from '../AssetBlurModal';

export default function AssetsPanel() {
  const { currentProject, assets, fetchProjectData, config, setConfig, saveProjectConfig } = useProjectStore();
  const [dragActive, setDragActive] = useState(false);
  const [processingAsset, setProcessingAsset] = useState<string | null>(null);
  const [fxProgress, setFxProgress] = useState<number | null>(null);
  const [isBlurModalOpen, setIsBlurModalOpen] = useState(false);
  const [blurTargetAsset, setBlurTargetAsset] = useState<RawAsset | null>(null);

  // Search and Filter State Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'visual' | 'audio' | 'caption'>('all');

  // Preview Tracking State Control 💡
  const [expandedAssetPath, setExpandedAssetPath] = useState<string | null>(null);

  // Rename Workflow State Controls
  const [renamingAsset, setRenamingAsset] = useState<RawAsset | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleUpload = async (files: FileList | File[]) => {
    if (!currentProject || files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) formData.append('assets', files[i]);
    formData.append('projectId', currentProject);

    try {
      const res = await fetch(`/api/assets/upload?projectId=${currentProject}`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) fetchProjectData(currentProject);
    } catch (err) {
      console.error(err);
    }
  };

  // NATIVE PASTE EVENT INTERCEPTION PIPELINE
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const pastedText = e.clipboardData?.getData('text');

      if (pastedText && pastedText.trim().startsWith('http')) {
        const cleanUrl = pastedText.trim().split('?')[0];

        if (
          cleanUrl.toLowerCase().endsWith('.gif') ||
          cleanUrl.toLowerCase().endsWith('.mp4') ||
          cleanUrl.toLowerCase().endsWith('.webp')
        ) {
          e.preventDefault();

          try {
            const res = await fetch(`/api/assets/download-url?projectId=${currentProject}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: pastedText.trim() })
            });

            if (res.ok) {
              fetchProjectData(currentProject);
            } else {
              console.error('Server side download failed.');
            }
          } catch (err) {
            console.error('Failed processing server asset url fetch:', err);
          }
          return;
        }
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const extension = items[i].type.split('/')[1] || 'png';
            const timestampName = `pasted_asset_${Date.now()}.${extension}`;
            const file = new File([blob], timestampName, { type: items[i].type });
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleUpload(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [currentProject, fetchProjectData]);

  // RUNS PYTHON PIPELINE (Now invoked for Videos, Images, and GIFs)
  const runComicAnonymity = (asset: RawAsset) => {
    if (!currentProject) return;
    if (eventSourceRef.current) eventSourceRef.current.close();

    setProcessingAsset(asset.name);
    setFxProgress(0);

    const url = `/api/effects/apply-comic-fx?projectId=${currentProject}&assetPath=${encodeURIComponent(asset.relativePath)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'processing') setFxProgress(data.progress);
      if (data.status === 'complete') {
        eventSource.close();
        eventSourceRef.current = null;
        setProcessingAsset(null);
        setFxProgress(null);
        fetchProjectData(currentProject);
      }
      if (data.status === 'failed') {
        console.error('Render processing failed:', data.error);
        eventSource.close();
        eventSourceRef.current = null;
        setProcessingAsset(null);
        setFxProgress(null);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Connection Engine Error:', err);
      eventSource.close();
      eventSourceRef.current = null;
      setProcessingAsset(null);
      setFxProgress(null);
    };
  };

  const openBlurModal = (asset: RawAsset) => {
    setBlurTargetAsset(asset);
    setIsBlurModalOpen(true);
  };

  const initiateRename = (asset: RawAsset) => {
    setRenamingAsset(asset);
    setRenameValue(asset.name);
    setRenameError(null);
  };

  const checkAssetUsage = (asset: RawAsset) => {
    if (!config) return { inUse: false, location: '' };
    const targetPath = `public/${asset.relativePath}`;

    const activeInVisuals = config.visuals?.some((v: any) => v.asset === targetPath);
    const activeInCaptions = config.captions?.some((c: any) => c.audio_asset === asset.relativePath || c.audio_asset === targetPath);
    const activeInMusic = config.audio_tracks?.some((t: any) => t.assetPath === asset.relativePath || t.assetPath === targetPath);

    if (activeInVisuals) return { inUse: true, location: 'Visual Track' };
    if (activeInCaptions) return { inUse: true, location: 'Narration Tracks' };
    if (activeInMusic) return { inUse: true, location: 'Ambient Audio Tracks' };

    return { inUse: false, location: '' };
  };

  const submitRename = async (asset: RawAsset) => {
    const trimmedName = renameValue.trim();
    if (!currentProject || !trimmedName || trimmedName === asset.name) {
      setRenamingAsset(null);
      setRenameError(null);
      return;
    }

    const nameCollisionExists = assets.some(
      (a) => a.name.toLowerCase() === trimmedName.toLowerCase() && a.relativePath !== asset.relativePath
    );

    if (nameCollisionExists) {
      setRenameError(`A file named "${trimmedName}" already exists inside this folder structural grid.`);
      return;
    }

    const folderType = asset.relativePath.split('/')[0];
    const targetPath = `${folderType}/${trimmedName}`;

    try {
      const res = await fetch('/api/assets/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject,
          oldRelativePath: asset.relativePath,
          newRelativePath: targetPath
        })
      });
      if (res.ok) {
        fetchProjectData(currentProject);
        setRenamingAsset(null);
        setRenameError(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAsset = async (asset: RawAsset) => {
    if (!currentProject) return;

    const usage = checkAssetUsage(asset);
    let confirmationMessage = `Are you sure you want to permanently delete "${asset.name}" from the project storage container?`;

    if (usage.inUse) {
      confirmationMessage = `⚠️ WARNING: "${asset.name}" is currently active on your preview timeline inside the [${usage.location}] layer!\n\nDeleting it now will forcefully pull it from your video composition.\n\nProceed anyway?`;
    }

    if (!window.confirm(confirmationMessage)) return;

    try {
      const res = await fetch('/api/assets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject,
          relativePath: asset.relativePath
        })
      });

      if (res.ok) {
        if (usage.inUse && config) {
          const targetPath = `public/${asset.relativePath}`;
          const filteredVisuals = config.visuals?.filter((v: any) => v.asset !== targetPath) || [];
          const filteredCaptions = config.captions?.filter((c: any) => c.audio_asset !== asset.relativePath && c.audio_asset !== targetPath) || [];
          const filteredAudioTracks = config.audio_tracks?.filter((t: any) => t.assetPath !== asset.relativePath && t.assetPath !== targetPath) || [];

          setConfig({
            ...config,
            visuals: filteredVisuals,
            captions: filteredCaptions,
            audio_tracks: filteredAudioTracks
          });
          await saveProjectConfig();
        }
        if (expandedAssetPath === asset.relativePath) setExpandedAssetPath(null);
        fetchProjectData(currentProject);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const pushToTimeline = (asset: RawAsset) => {
    if (asset.type === 'video' || asset.type === 'image') {
      const newVisual = {
        id: `visual_${Math.random().toString(36).substr(2, 9)}`,
        asset: `public/${asset.relativePath}`,
        start_ms: 0,
        duration_ms: 3000,
        flipped: false
      };
      setConfig({ ...config, visuals: [...(config.visuals || []), newVisual] });
      saveProjectConfig();
    }
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'all') return true;

    const usage = checkAssetUsage(asset);
    if (activeFilter === 'visual') return asset.type === 'video' || asset.type === 'image' || usage.location === 'Visual Track';
    if (activeFilter === 'audio') return (asset.type === 'audio' && !asset.relativePath.startsWith('voices/')) || usage.location === 'Ambient Audio Tracks';
    if (activeFilter === 'caption') return asset.relativePath.startsWith('voices/') || usage.location === 'Narration Tracks';
    return true;
  });

  const toggleFilter = (type: 'visual' | 'audio' | 'caption') => {
    setActiveFilter(prev => prev === type ? 'all' : type);
  };

  return (
    <div
      className={`h-full w-full flex flex-col p-4 bg-neutral-900 border-l border-neutral-800 transition ${dragActive ? 'bg-neutral-950/50 border-blue-500' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files) handleUpload(e.dataTransfer.files); }}
    >
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-950 p-6 rounded-lg text-center cursor-pointer flex flex-row items-center justify-center gap-2 mb-3 group transition shrink-0"
      >
        <UploadCloud size={24} className="text-neutral-500 group-hover:text-neutral-400 transition" />
        <span className="text-xs font-medium text-neutral-400">Drag, paste clipboard images, or click to import</span>
        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={e => e.target.files && handleUpload(e.target.files)} />
      </div>

      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-7 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-neutral-700 transition"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-md p-0.5 shrink-0">
          <button onClick={() => toggleFilter('visual')} className={`p-1.5 rounded transition ${activeFilter === 'visual' ? 'bg-purple-600/20 text-purple-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`} title="Show Visuals (Video / Images)">
            <Film size={13} />
          </button>
          <button onClick={() => toggleFilter('audio')} className={`p-1.5 rounded transition ${activeFilter === 'audio' ? 'bg-emerald-600/20 text-emerald-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`} title="Show Ambient Audio Tracks">
            <Music size={13} />
          </button>
          <button onClick={() => toggleFilter('caption')} className={`p-1.5 rounded transition ${activeFilter === 'caption' ? 'bg-blue-600/20 text-blue-400 font-bold' : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'}`} title="Show Narration / Captions Audio">
            <Type size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
        {filteredAssets.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center border border-dashed border-neutral-800 rounded-lg bg-neutral-950/30 p-4 text-center">
            <span className="text-[11px] font-medium text-neutral-500">No matching assets found</span>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isEditingThisAsset = renamingAsset?.relativePath === asset.relativePath;
            const isExpanded = expandedAssetPath === asset.relativePath;
            const usageTracker = checkAssetUsage(asset);

            const mediaServeUrl = `/api/assets/serve?projectId=${currentProject}&relativePath=${encodeURIComponent(asset.relativePath)}`;

            return (
              <div
                key={asset.relativePath}
                onDoubleClick={() => !isEditingThisAsset && pushToTimeline(asset)}
                onContextMenu={(e) => { e.preventDefault(); initiateRename(asset); }}
                onClick={() => {
                  if (!isEditingThisAsset) {
                    setExpandedAssetPath(isExpanded ? null : asset.relativePath);
                  }
                }}
                draggable={!isEditingThisAsset}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(asset));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className={`group relative flex flex-col bg-neutral-950 border rounded-lg p-2.5 transition ${isEditingThisAsset
                  ? 'border-blue-500 ring-1 ring-blue-500/20 bg-neutral-950'
                  : isExpanded
                    ? 'border-neutral-600 bg-neutral-900 shadow-xl'
                    : usageTracker.inUse
                      ? 'border-blue-500/40 bg-blue-950/5 hover:border-blue-400 cursor-grab active:cursor-grabbing shadow-inner shadow-blue-500/5'
                      : 'border-neutral-800 hover:border-neutral-700 cursor-grab active:cursor-grabbing'
                  }`}
                title={usageTracker.inUse ? `Active in composition: ${usageTracker.location}` : undefined}
              >
                <div className="flex items-center justify-between w-full">
                  {isEditingThisAsset ? (
                    <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                      {asset.type === 'video' && <Film size={14} className="text-purple-400 shrink-0" />}
                      {asset.type === 'audio' && <Music size={14} className="text-emerald-400 shrink-0" />}
                      {asset.type === 'image' && <Image size={14} className="text-blue-400 shrink-0" />}

                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => {
                          setRenameValue(e.target.value);
                          if (renameError) setRenameError(null);
                        }}
                        className="bg-neutral-900 border border-neutral-800 text-xs font-medium tracking-wide text-white rounded px-2 py-0.5 outline-none focus:border-neutral-700 flex-1 min-w-0"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitRename(asset);
                          if (e.key === 'Escape') { setRenamingAsset(null); setRenameError(null); }
                        }}
                        onFocus={(e) => {
                          const lastDotIndex = e.target.value.lastIndexOf('.');
                          if (lastDotIndex > 0) {
                            e.target.setSelectionRange(0, lastDotIndex);
                          } else {
                            e.target.select();
                          }
                        }}
                      />

                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <button onClick={() => submitRename(asset)} className="p-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white transition">
                          <Check size={11} strokeWidth={2.5} />
                        </button>
                        <button onClick={() => { setRenamingAsset(null); setRenameError(null); }} className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition">
                          <X size={11} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {asset.type === 'video' && <Film size={14} className="text-purple-400 shrink-0" />}
                        {asset.type === 'audio' && (
                          asset.relativePath.startsWith('voices/')
                            ? <Type size={14} className="text-blue-400 shrink-0" />
                            : <Music size={14} className="text-emerald-400 shrink-0" />
                        )}
                        {asset.type === 'image' && <Image size={14} className="text-blue-400 shrink-0" />}
                        <span className="text-xs text-neutral-200 truncate font-medium tracking-wide" title="Right-click to rename file asset">
                          {asset.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* WAND2 PYTHON SCRIPT RUNNER: Re-wired to allow both video and image types */}
                        {(asset.type === 'video' || asset.type === 'image') && (
                          <button
                            disabled={!!processingAsset}
                            onClick={(e) => { e.stopPropagation(); runComicAnonymity(asset); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Generate Comic Anonymity Asset via Python script"
                          >
                            <Wand2 size={13} />
                          </button>
                        )}

                        {asset.type === 'video' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openBlurModal(asset); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-400 transition"
                            title="Export blurred mov asset"
                          >
                            <EyeOff size={13} />
                          </button>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-950 text-neutral-500 hover:text-red-400 transition"
                          title="Delete Asset Permanently from Storage Deck"
                        >
                          <Trash2 size={13} />
                        </button>

                        <div className="text-neutral-600 group-hover:text-neutral-400 transition-colors ml-0.5">
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {isExpanded && !isEditingThisAsset && (
                  <div
                    className="mt-2.5 pt-2 border-t border-neutral-800/60 w-full overflow-hidden animate-fadeIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {asset.type === 'video' && (
                      <video
                        src={mediaServeUrl}
                        controls
                        preload="metadata"
                        className="w-full rounded bg-black border border-neutral-800 max-h-44 object-contain shadow-md"
                      />
                    )}
                    {asset.type === 'audio' && (
                      <div className="bg-neutral-950 p-2 border border-neutral-800 rounded flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-neutral-500 truncate">{asset.relativePath}</span>
                        <audio
                          src={mediaServeUrl}
                          controls
                          preload="metadata"
                          className="w-full h-8 mt-1 accent-emerald-500"
                        />
                      </div>
                    )}
                    {asset.type === 'image' && (
                      <img
                        src={mediaServeUrl}
                        alt={asset.name}
                        className="w-full rounded bg-neutral-950 border border-neutral-800 max-h-44 object-contain"
                        loading="lazy"
                      />
                    )}
                  </div>
                )}

                {isEditingThisAsset && renameError && (
                  <div className="mt-2 flex items-start gap-1.5 p-1.5 bg-red-950/40 border border-red-900/50 rounded text-[10px] text-red-400 font-medium leading-relaxed animate-fadeIn">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>{renameError}</span>
                  </div>
                )}

                {/* TRACKING LOADING BAR METRIC OVERLAY */}
                {processingAsset === asset.name && (
                  <div className="absolute inset-0 bg-black/90 rounded-lg flex items-center px-4 justify-between" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1.5">
                      <RefreshCw size={10} className="animate-spin" /> Anonymizing ({fxProgress}%)
                    </span>
                    <div className="w-24 bg-neutral-800 h-1 rounded-full overflow-hidden">
                      <div className="bg-amber-400 h-full transition-all duration-150" style={{ width: `${fxProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <AssetBlurModal
        isOpen={isBlurModalOpen}
        onClose={() => { setIsBlurModalOpen(false); setBlurTargetAsset(null); }}
        asset={blurTargetAsset}
      />
    </div>
  );
}
