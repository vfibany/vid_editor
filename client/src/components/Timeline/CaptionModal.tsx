import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { Type, X, Volume2, Loader2, Sparkles, Mic, Check, AlertCircle, Sliders } from 'lucide-react';

interface CaptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetTimeMs: number;
  editingAsset?: any | null;
}

const BACKEND_STATIC_URL = 'http://localhost:4000';

export default function CaptionModal({ isOpen, onClose, targetTimeMs, editingAsset }: CaptionModalProps) {
  const { currentProject, config, setConfig, saveProjectConfig, fetchProjectData } = useProjectStore();
  
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Local Processing State parameters
  const [captionText, setCaptionText] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('narrator');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [generatedAudioBlob, setGeneratedAudioBlob] = useState<Blob | null>(null);
  
  const [exaggerationScale, setExaggerationScale] = useState<number>(0.5);
  const [cfgWeight, setCfgWeight] = useState<number>(0.3);
  const [loudnessScale, setLoudnessScale] = useState<number>(1.2);

  // NEW: Track server-side relative file positions for text-to-speech files
  const [serverAssetPath, setServerAssetPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync effect block to pre-populate fields when entering edit mode
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (editingAsset) {
        setCaptionText(editingAsset.text);
        setVoiceProfile(editingAsset.speaker?.toLowerCase() || 'narrator');
        setExaggerationScale(editingAsset.exaggeration_scale ?? 0.5);
        setCfgWeight(editingAsset.cfg_weight ?? 0.3);
        setLoudnessScale(editingAsset.loudness_scale ?? 1.2);

        const normalizedAsset = editingAsset.audio_asset.startsWith('public/') ? editingAsset.audio_asset : `public/${editingAsset.audio_asset}`;
        setPreviewAudioUrl(`${BACKEND_STATIC_URL}/projects/${currentProject}/${normalizedAsset}?t=${Date.now()}`);
        setServerAssetPath(normalizedAsset);
        setGeneratedAudioBlob(null); 
      } else {
        setCaptionText('');
        setVoiceProfile('narrator');
        setExaggerationScale(1.0);
        setCfgWeight(0.3);
        setLoudnessScale(2.4); 
        setPreviewAudioUrl(null);
        setGeneratedAudioBlob(null);
        setServerAssetPath(null);
      }
    }
  }, [isOpen, editingAsset, currentProject]);

  if (!isOpen) return null;

  // Handles generating or updating individual line via local Chatterbox engine
  const handleAIGenerateAudio = async () => {
    if (!captionText.trim() || !currentProject) return;
    setIsGeneratingAI(true);
    setErrorMessage(null);
    
    try {
      const isEdit = !!editingAsset;

      if (isEdit) {
        const res = await fetch(`${BACKEND_STATIC_URL}/api/audio/regenerate-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: currentProject,
            scriptName: currentProject || 'script',
            captionId: editingAsset.id,
            updatedText: captionText,
            speaker: voiceProfile,
            tone: editingAsset.tone || 'neutral',
            exaggeration_scale: exaggerationScale,
            cfg_weight: cfgWeight,
            loudness_scale: loudnessScale,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
          saveProjectConfig();
          onClose();
        } else {
          const errData = await res.json();
          setErrorMessage(errData.error || 'Pipeline execution failed during inline line regeneration.');
        }

      } else {
        // --- PATHWAY B: STANDALONE NEW LINE GENERATION ---
        const res = await fetch(`${BACKEND_STATIC_URL}/api/audio/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: captionText,
            voice: voiceProfile,
            projectId: currentProject,
            exaggeration_scale: exaggerationScale,
            cfg_weight: cfgWeight,
            loudness_scale: loudnessScale
          })
        });

        if (res.ok) {
          const data = await res.json();
          
          if (data.success && data.url) {
            setPreviewAudioUrl(data.url);
            setServerAssetPath(data.assetPath || `public/audio/${data.url.split('/').pop()}`);
            setGeneratedAudioBlob(null); 
          } else {
            setErrorMessage(data.error || 'Server processed request but failed returning execution addresses.');
          }
        } else {
          setErrorMessage('Inference engine failed. Check backend compilation logs.');
        }
      }
    } catch (err) {
      console.error('Chatterbox local inference pipeline failed:', err);
      setErrorMessage('Critical connection failure communicating with text-to-speech rendering pipelines.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const toggleMicrophoneRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecording(false);
    } else {
      audioChunksRef.current = [];
      setServerAssetPath(null); 
      setErrorMessage(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const url = URL.createObjectURL(audioBlob);
          setGeneratedAudioBlob(audioBlob);
          setPreviewAudioUrl(url);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Hardware microphone block access error:', err);
        setErrorMessage('Could not acquire local audio device permissions.');
      }
    }
  };

  // Combines timeline payload setups to prevent codebase duplication
  const injectTrackToTimelineConfig = (finalAssetPath: string) => {
    const targetLineIndex = editingAsset ? editingAsset.lineIndex : (config.captions?.length || 0) + 1;
    const defaultId = editingAsset ? editingAsset.id : `audio_${Math.random().toString(36).substring(2, 11)}`;
    const mockDuration = captionText.split(' ').length * 350 + 400;

    const newCaption = {
      id: defaultId,
      lineIndex: targetLineIndex,
      speaker: voiceProfile.toUpperCase(),
      tone: editingAsset?.tone || 'neutral',
      text: captionText,
      start_ms: editingAsset ? editingAsset.start_ms : targetTimeMs,
      audio_duration_ms: editingAsset ? editingAsset.audio_duration_ms : mockDuration,
      audio_asset: finalAssetPath,
      show_captions: true,
      exaggeration_scale: exaggerationScale,
      cfg_weight: cfgWeight,
      loudness_scale: loudnessScale
    };

    const newAudioTrack = {
      id: `track_${defaultId}`,
      asset: finalAssetPath,
      start_ms: editingAsset ? editingAsset.start_ms : targetTimeMs,
      duration_ms: editingAsset ? editingAsset.audio_duration_ms : mockDuration,
      type: 'sfx' as const, 
      volume: 1.0,
      duck_when_narration: false,
      duck_amount: 1.0
    };

    let revisedCaptions = [...(config.captions || [])];
    let revisedAudioTracks = [...(config.audio_tracks || [])];

    if (editingAsset) {
      revisedCaptions = revisedCaptions.map(c => c.id === editingAsset.id ? newCaption : c);
      revisedAudioTracks = revisedAudioTracks.map(t => t.id === `track_${editingAsset.id}` ? { ...t, ...newAudioTrack } : t);
    } else {
      revisedCaptions.push(newCaption);
      revisedAudioTracks.push(newAudioTrack);
    }

    setConfig({
      ...config,
      captions: revisedCaptions,
      audio_tracks: revisedAudioTracks,
      total_ms: Math.max(config.total_ms, (editingAsset ? 0 : targetTimeMs + mockDuration))
    });
    
    saveProjectConfig();
    onClose();
    if (currentProject) fetchProjectData(currentProject);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (serverAssetPath && !generatedAudioBlob) {
      injectTrackToTimelineConfig(serverAssetPath);
      return;
    }

    if (!captionText.trim() || !generatedAudioBlob || !currentProject) return;

    const targetLineIndex = editingAsset ? editingAsset.lineIndex : (config.captions?.length || 0) + 1;
    const fileId = `mic_line_${Date.now()}_${targetLineIndex}.wav`;
    
    const formData = new FormData();
    formData.append('assets', generatedAudioBlob, fileId);

    try {
      const uploadRes = await fetch(`${BACKEND_STATIC_URL}/api/assets/upload?projectId=${currentProject}`, {
        method: 'POST',
        body: formData
      });

      if (uploadRes.ok) {
        const calculatedAssetPath = `public/audio/${fileId}`;
        injectTrackToTimelineConfig(calculatedAssetPath);
      } else {
        setErrorMessage('File storage engine rejected mic audio chunk payload structures.');
      }
    } catch (err) {
      console.error('[Recording File Ingestion Fault]:', err);
      setErrorMessage('Failed to pipe hardware binary buffers to project directories.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 text-white select-none">
      {previewAudioUrl && <audio ref={audioPreviewRef} src={previewAudioUrl} className="hidden" onLoadStart={() => setErrorMessage(null)} />}
      
      <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
          <div>
            <h4 className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-blue-400">
              <Type size={14} /> 
              <span>{editingAsset ? 'Revise Script Spoken Track Line' : 'Synthesize Audio Dialog Panel'}</span>
            </h4>
            <p className="text-[10px] text-neutral-400 mt-0.5 font-mono">
              {editingAsset ? 'Modifying' : 'Inserting'} track segment starting at: {(targetTimeMs / 1000).toFixed(2)}s
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-white transition"><X size={16} /></button>
        </div>

        {errorMessage && (
          <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-lg text-xs text-red-400 font-medium flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Dialogue Script Text</label>
          <textarea
            required rows={3} placeholder="Type your spoken text asset sentence lines here..." value={captionText}
            onChange={e => setCaptionText(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 focus:border-blue-500 outline-none text-xs rounded-lg p-2.5 text-neutral-200 tracking-wide resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Target Voice Engine Seed Profile</label>
            <select
              value={voiceProfile} onChange={e => setVoiceProfile(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 focus:border-blue-500 text-xs text-neutral-300 rounded-lg p-2 h-9 outline-none cursor-pointer"
            >
              <option value="narrator">Default Narrator (voices/narrator.wav)</option>
              <option value="male">Male Clone Seed (voices/male.wav)</option>
              <option value="female">Female Clone Seed (voices/female.wav)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Audio Preview Verification</label>
            {previewAudioUrl ? (
              <button
                type="button" onClick={() => audioPreviewRef.current?.play()}
                className="h-9 px-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold text-amber-400 border border-neutral-700 transition flex items-center justify-center gap-1.5"
              >
                <Volume2 size={13} />
                <span>Play Local Audio Clip</span>
              </button>
            ) : (
              <div className="h-9 border border-neutral-800/60 bg-neutral-950/40 rounded-lg flex items-center justify-center text-[10px] text-neutral-500 font-mono italic">
                Awaiting source generation...
              </div>
            )}
          </div>
        </div>

        {/* --- ADJUSTED: PARAMETER SETUPS SPANNING A BALANCED 3-COLUMN LAYOUT --- */}
        <div className="border border-neutral-800 bg-neutral-950/40 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800/60 pb-1">
            <Sliders size={11} className="text-purple-400" />
            <span>Chatterbox 500M Single-Line Parameters</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Exaggeration Scale Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-neutral-400">Exaggeration</span>
                <span className="font-mono text-purple-400 font-bold bg-purple-950/40 px-1 rounded border border-purple-900/30">{exaggerationScale.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.0" max="2.5" step="0.1"
                value={exaggerationScale}
                disabled={isGeneratingAI || isRecording}
                onChange={(e) => setExaggerationScale(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* CFG Tracking Weight Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-neutral-400">CFG Weight</span>
                <span className="font-mono text-purple-400 font-bold bg-purple-950/40 px-1 rounded border border-purple-900/30">{cfgWeight.toFixed(2)}</span>
              </div>
              <input 
                type="range" min="0.1" max="1.5" step="0.05"
                value={cfgWeight}
                disabled={isGeneratingAI || isRecording}
                onChange={(e) => setCfgWeight(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Loudness Boost Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-neutral-400">Loudness Boost</span>
                <span className="font-mono text-purple-400 font-bold bg-purple-950/40 px-1 rounded border border-purple-900/30">{loudnessScale.toFixed(1)}x</span>
              </div>
              <input 
                type="range" min="0.5" max="4.0" step="0.1"
                value={loudnessScale}
                disabled={isGeneratingAI || isRecording}
                onChange={(e) => setLoudnessScale(parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-0.5">
          <button
            type="button" disabled={isGeneratingAI || isRecording || !captionText.trim()} onClick={handleAIGenerateAudio}
            className="h-10 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-1.5 bg-neutral-950 border border-neutral-800 hover:bg-neutral-900 text-purple-400 disabled:opacity-40 shadow-inner"
          >
            {isGeneratingAI ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>{editingAsset ? 'Regenerate Line' : 'Local Chatterbox TTS'}</span>
          </button>

          <button
            type="button" disabled={isGeneratingAI || !captionText.trim()} onClick={toggleMicrophoneRecording}
            className={`h-10 rounded-lg font-semibold text-xs transition flex items-center justify-center gap-1.5 border ${
              isRecording ? 'bg-red-950 text-red-400 border-red-800 animate-pulse' : 'bg-neutral-950 border-neutral-800 hover:bg-neutral-900 text-emerald-400 disabled:opacity-40'
            }`}
          >
            <Mic size={13} />
            <span>{isRecording ? 'Stop Recording' : 'Record MacBook Mic'}</span>
          </button>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-800 pt-3 mt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition">Cancel</button>
          <button 
            type="submit" disabled={!previewAudioUrl && !serverAssetPath}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 font-bold text-xs rounded-lg transition flex items-center gap-1.5"
          >
            <Check size={13} strokeWidth={2.5} />
            <span>{editingAsset ? 'Commit Changes' : 'Inject to Timeline'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
