import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { Type as TitleIcon, X, Check } from 'lucide-react';

interface TitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetTimeMs: number;
  editingAsset?: any | null;
}

export default function TitleModal({ isOpen, onClose, targetTimeMs, editingAsset }: TitleModalProps) {
  // Pull currentProject state context to route filesystem directories accurately
  const { config, setConfig, saveProjectConfig, currentProject } = useProjectStore();
  
  const [titleText, setTitleText] = useState('');
  const [titleDurationMs, setTitleDurationMs] = useState(3000);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingAsset) {
        // Extract original text from the asset query string parameter matrix
        const parsedText = decodeURIComponent(editingAsset.asset.split('?text=')[1] || '');
        setTitleText(parsedText);
        setTitleDurationMs(editingAsset.duration_ms);
      } else {
        setTitleText('');
        setTitleDurationMs(3000);
      }
    }
  }, [isOpen, editingAsset]);

  if (!isOpen) return null;

  // OFF-SCREEN PNG ENGINE RENDERING HELPER
  const generateTitlePngBase64 = (text: string): string => {
    const canvas = document.createElement('canvas');
    // Match presentation size to match project dimension configurations
    canvas.width = config.render?.width || 1920;
    canvas.height = config.render?.height || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 1. Semi-transparent black backdrop overlay matching your styling rules
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. High-Fidelity Text Configuration Matrix
    ctx.font = '900 80px sans-serif'; 
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop Shadow metrics for readability over moving clip streams
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;

    // Word Wrap logic constraints
    const words = text.toUpperCase().split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';
    const maxWidth = canvas.width - 240;

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Render multi-line offsets centered vertically
    const lineHeight = 100;
    const totalHeight = lines.length * lineHeight;
    let startY = (canvas.height - totalHeight) / 2 + lineHeight / 2;

    lines.forEach(line => {
      ctx.fillText(line, canvas.width / 2, startY);
      startY += lineHeight;
    });

    return canvas.toDataURL('image/png');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleText.trim() || isSaving) return;

    try {
      setIsSaving(true);
      const assetId = editingAsset ? editingAsset.id : `title_${Math.random().toString(36).substring(2, 11)}`;
      
      // Render text down to PNG
      const base64DataString = generateTitlePngBase64(titleText);

      // POST image packet directly to your local Express server architecture
      const uploadResponse = await fetch('http://localhost:4000/api/projects/save-title-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject,
          assetId: assetId.replace('visual_title_', ''), // Clean string mapping
          imageData: base64DataString
        })
      });

      if (!uploadResponse.ok) throw new Error('Failed writing static asset stream to disk');

      // Append text query param safely to preserve layout edits
      const savedAssetUrl = `public/images/${assetId}.png?text=${encodeURIComponent(titleText)}`;

      let revisedVisuals = [];
      if (editingAsset) {
        revisedVisuals = config.visuals.map((v: any) => 
          v.id === editingAsset.id ? { ...v, asset: savedAssetUrl, duration_ms: titleDurationMs } : v
        );
      } else {
        const newVisual = {
          id: `visual_title_${assetId}`,
          asset: savedAssetUrl,
          start_ms: targetTimeMs,
          duration_ms: titleDurationMs
        };
        revisedVisuals = [...(config.visuals || []), newVisual];
      }

      const potentialEndBoundary = targetTimeMs + titleDurationMs;
      const finalTotalMs = potentialEndBoundary > config.total_ms ? potentialEndBoundary : config.total_ms;

      setConfig({
        ...config,
        total_ms: finalTotalMs,
        visuals: revisedVisuals
      });
      
      saveProjectConfig();
      onClose();
    } catch (err) {
      console.error('[Title Compilation Fault]:', err);
      alert('Could not compile text image file.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-white select-none">
      <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
          <div>
            <h4 className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-amber-400">
              <TitleIcon size={14} /> 
              <span>{editingAsset ? 'Revise Screen Title Image Overlay' : 'Instantiate Screen Title Image Overlay'}</span>
            </h4>
            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">
              {editingAsset ? 'Editing' : 'Inserting'} track segment starting at: {(targetTimeMs / 1000).toFixed(2)}s
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white transition"><X size={16} /></button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Title Display String</label>
          <input
            type="text" required autoFocus placeholder="e.g., THE CARO-KANN DEFENSE" value={titleText}
            onChange={e => setTitleText(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 focus:border-amber-500 outline-none text-sm font-bold uppercase rounded-lg p-2.5 text-white tracking-wide"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Track View Length Duration</label>
            <span className="text-xs font-mono text-amber-400 font-bold">{(titleDurationMs / 1000).toFixed(2)}s</span>
          </div>
          <input
            type="range" min={500} max={10000} step={250} value={titleDurationMs}
            onChange={e => setTitleDurationMs(Number(e.target.value))}
            className="w-full accent-amber-500 cursor-ew-resize bg-neutral-950 h-2 rounded-lg appearance-none border border-neutral-800"
          />
        </div>

        {/* Local Real-time Layout Sandbox Canvas Simulator */}
        <div className="border border-neutral-800 bg-neutral-950 aspect-video rounded-lg flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="text-center font-black tracking-tighter text-neutral-200 uppercase break-words px-6 drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] text-xl">
            {titleText.trim() || 'Dynamic Preview Value'}
          </div>
          <span className="absolute bottom-2 right-2.5 font-mono text-[8px] text-neutral-600 uppercase tracking-widest">Canvas Render Pipeline Target</span>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3">
          <button type="button" disabled={isSaving} onClick={onClose} className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition">Cancel</button>
          <button 
            type="submit" disabled={!titleText.trim() || isSaving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold text-xs rounded-lg transition flex items-center gap-1.5"
          >
            <Check size={13} strokeWidth={2.5} />
            <span>{isSaving ? 'Saving File...' : editingAsset ? 'Update Title Track' : 'Insert Title Track'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}