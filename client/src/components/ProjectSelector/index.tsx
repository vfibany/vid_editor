import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../state/useProjectStore';
import { ChevronDown, Plus, Folder, FileArchive, Loader2, Sliders } from 'lucide-react';

export default function ProjectSelector() {
  const { currentProject, setProject } = useProjectStore();
  const [projects, setProjects] = useState<string[]>([]);
  
  // UI Visibility States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form States
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);

  // --- ADDED: NEW STATES CAPTURING EXPRESSIVENESS CONTROLS FOR BATCH PROCESSING ---
  const [exaggerationScale, setExaggerationScale] = useState<number>(1.0);
  const [cfgWeight, setCfgWeight] = useState<number>(0.3);

  // --- NEW BATCH GENERATION PROGRESS INDICATOR UI STATE MATRIX ---
  const [progressData, setProgressData] = useState<{
    current: number;
    total: number;
    text: string;
    message: string;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchProjectsList = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to load project files:', err);
    }
  };

  useEffect(() => {
    fetchProjectsList();
  }, [currentProject]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- RE-ENGINEERED STREAM READER EXECUTION CORE PIPELINE ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !script) return;
    setLoading(true);
    setProgressData({ current: 0, total: 0, text: '', message: 'Initializing local workspace environments...' });

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // MODIFIED: Forward slider settings alongside title and markdown blocks inside the payload
        body: JSON.stringify({ 
          title, 
          script,
          exaggeration_scale: exaggerationScale,
          cfg_weight: cfgWeight
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed connecting to bulk synthesis initialization streams.');
      }

      const dataStreamReader = response.body.getReader();
      const textDecoder = new TextDecoder();
      let completeWorkspaceBufferStr = '';

      while (true) {
        const { value, done } = await dataStreamReader.read();
        if (done) break;

        completeWorkspaceBufferStr += textDecoder.decode(value, { stream: true });
        const textPayloadLines = completeWorkspaceBufferStr.split('\n\n');
        
        completeWorkspaceBufferStr = textPayloadLines.pop() || '';

        for (const logLine of textPayloadLines) {
          if (logLine.startsWith('data: ')) {
            const cleanJsonData = JSON.parse(logLine.replace('data: ', '').trim());
            
            if (cleanJsonData.stage === 'start') {
              setProgressData({ current: 0, total: cleanJsonData.total, text: '', message: cleanJsonData.message });
            } else if (cleanJsonData.stage === 'processing') {
              setProgressData({
                current: cleanJsonData.current,
                total: cleanJsonData.total,
                text: cleanJsonData.text,
                message: `Synthesizing Audio Segment: ${cleanJsonData.current} of ${cleanJsonData.total}`
              });
            } else if (cleanJsonData.stage === 'complete') {
              await fetchProjectsList();
              setProject(cleanJsonData.projectId);
              setIsModalOpen(false);
              setTitle('');
              setScript('');
              setExaggerationScale(1.0);
              setCfgWeight(0.3);
              setProgressData(null);
            } else if (cleanJsonData.stage === 'error') {
              alert(`Batch Synthesis Failed: ${cleanJsonData.error}`);
              setProgressData(null);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`Critical operational interruption fault matching parameters: ${err.message}`);
      setProgressData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Active Dropdown Trigger */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`h-9 px-3 rounded-lg border border-neutral-800 flex items-center gap-2.5 text-xs font-medium transition ${
          isDropdownOpen 
            ? 'bg-neutral-800 text-white border-neutral-700' 
            : 'bg-neutral-900/50 text-neutral-300 hover:text-white hover:bg-neutral-900'
        }`}
      >
        <FileArchive size={14} className="text-blue-400" />
        <span className="font-mono tracking-wide">
          {currentProject || 'Select Active Project...'}
        </span>
        <ChevronDown 
          size={12} 
          className={`text-neutral-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-neutral-300' : ''}`} 
        />
      </button>

      {/* Dropdown Menu List */}
      {isDropdownOpen && (
        <div className="absolute left-0 mt-2 w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
          <button
            onClick={() => {
              setIsModalOpen(true);
              setIsDropdownOpen(false);
            }}
            className="w-[calc(100%-12px)] mx-1.5 px-2.5 py-2 rounded-lg text-left text-xs font-semibold text-blue-400 hover:bg-blue-950/40 hover:text-blue-300 transition flex items-center gap-2"
          >
            <div className="w-4 h-4 rounded-md bg-blue-950 flex items-center justify-center text-blue-400 border border-blue-900/50">
              <Plus size={11} strokeWidth={3} />
            </div>
            <span>Create New Project...</span>
          </button>

          <div className="h-px bg-neutral-800/80 my-1.5" />

          <div className="max-h-60 overflow-y-auto space-y-0.5 px-1.5">
            {projects.length === 0 ? (
              <div className="text-[10px] text-neutral-500 font-medium px-2.5 py-2 italic">
                No active directories initialized.
              </div>
            ) : (
              projects.map((projId) => {
                const isActive = projId === currentProject;
                return (
                  <button
                    key={projId}
                    onClick={() => {
                      setProject(projId);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-md text-left font-mono text-xs transition flex items-center justify-between ${
                      isActive
                        ? 'bg-neutral-800 text-white font-semibold border-l-2 border-blue-500 pl-2'
                        : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Folder size={13} className={isActive ? 'text-blue-400' : 'text-neutral-600'} />
                      <span className="truncate">{projId}</span>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-400" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Script Input Environment Modal Layout Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm context-modal-container">
          <form onSubmit={handleCreate} className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-xl p-6 shadow-2xl flex flex-col gap-4 text-white">
            <h3 className="text-lg font-bold tracking-tight">Spawn Local Project Workspace</h3>
            
            {!progressData ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Project Identifier Title</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g., my_cool_chess_short" 
                    value={title} 
                    disabled={loading}
                    onChange={e => setTitle(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 text-white rounded-md p-2.5 text-sm outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Dialogue Multitone Script (.md format)</label>
                  <textarea 
                    rows={5} 
                    required 
                    placeholder={`[adi_soft:whisper] Who is there?\n[adi_norm] Oh, no one.\n[narrator] I am here.`}
                    value={script} 
                    disabled={loading}
                    onChange={e => setScript(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 text-white rounded-md p-2.5 text-sm font-mono outline-none focus:border-blue-500 transition resize-none"
                  />
                </div>

                {/* --- ADDED: EXPRESSIVE TTS TUNING CONTROLS MATRIX PANEL --- */}
                <div className="border border-neutral-800 bg-neutral-950/40 rounded-lg p-3.5 space-y-3.5 mt-1">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800 pb-1.5">
                    <Sliders size={13} className="text-blue-500" />
                    <span>Chatterbox 500M Voice Synthesis Parameter Overrides</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Exaggeration Scale Track Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-neutral-300">Exaggeration Scale</span>
                        <span className="font-mono text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-900/30">{exaggerationScale.toFixed(1)}x</span>
                      </div>
                      <input 
                        type="range"
                        min="0.0"
                        max="2.5"
                        step="0.1"
                        value={exaggerationScale}
                        disabled={loading}
                        onChange={(e) => setExaggerationScale(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-neutral-500 leading-normal">Controls emotional cadence variance. Values above 1.5 yield extreme micro-inflections.</p>
                    </div>

                    {/* CFG Tracking Weight Track Slider */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-neutral-300">CFG Tracking Weight</span>
                        <span className="font-mono text-blue-400 bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-900/30">{cfgWeight.toFixed(2)}</span>
                      </div>
                      <input 
                        type="range"
                        min="0.1"
                        max="1.5"
                        step="0.05"
                        value={cfgWeight}
                        disabled={loading}
                        onChange={(e) => setCfgWeight(parseFloat(e.target.value))}
                        className="w-full accent-blue-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-neutral-500 leading-normal">Lower figures (0.2 - 0.4) allow pacing flow adjustments. High figures enforce prompt rigidity.</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 mt-1">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)} 
                    className="px-4 py-2 text-sm font-semibold text-neutral-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-md transition flex items-center gap-2"
                  >
                    Generate Environment
                  </button>
                </div>
              </>
            ) : (
              /* PROGRESS HUD VIEW OVERLAY */
              <div className="flex flex-col items-center justify-center py-8 px-4 bg-neutral-950 border border-neutral-800/60 rounded-xl my-2 gap-4">
                <Loader2 size={32} className="animate-spin text-blue-500" />
                
                <div className="text-center space-y-1 w-full max-w-sm">
                  <div className="text-sm font-bold text-neutral-100">{progressData.message}</div>
                  {progressData.total > 0 && (
                    <div className="text-xs text-neutral-400 font-mono">
                      Completed: {progressData.current} / {progressData.total} ({Math.round((progressData.current / progressData.total) * 100)}%)
                    </div>
                  )}
                </div>

                {progressData.total > 0 && (
                  <div className="w-full bg-neutral-900 border border-neutral-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      style={{ width: `${(progressData.current / progressData.total) * 100}%` }}
                    />
                  </div>
                )}

                {progressData.text && (
                  <div className="w-full border border-neutral-900 bg-neutral-900/30 font-mono text-[11px] text-neutral-400 px-3 py-2 rounded-lg truncate italic text-center">
                    &quot;{progressData.text}&quot;
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}