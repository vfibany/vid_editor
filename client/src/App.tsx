import { useEffect, useState, useRef } from 'react';
import { useProjectStore } from './state/useProjectStore';
import ProjectSelector from './components/ProjectSelector';
import PreviewPanel from './components/PreviewPanel';
import AssetsPanel from './components/AssetsPanel';
import Timeline from './components/Timeline';
import { Settings, Sliders } from 'lucide-react';

export default function App() {
  const {
    currentProject,
    setProject,
    config,
    setConfig,
    saveProjectConfig,
  } = useProjectStore();

  const [showSettings, setShowSettings] = useState(false);

  const settingsRef = useRef<HTMLDivElement>(null);

  // -------------------------
  // Layout state
  // -------------------------

  const HEADER_HEIGHT = 56;

  const [previewRatio, setPreviewRatio] = useState(0.72);
  const [timelineHeight, setTimelineHeight] = useState(288);

  const dragRef = useRef(false);

  const width = config.render?.width || 1920;

  useEffect(() => {
    if (currentProject) {
      setProject(currentProject);
    }
  }, []);

  // Close settings popup

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setShowSettings(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  // ---------------------------------------
  // Intersection splitter dragging
  // ---------------------------------------

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight - HEADER_HEIGHT;

      const nextPreviewRatio = Math.min(
        0.85,
        Math.max(0.35, e.clientX / windowWidth)
      );

      const nextTimelineHeight = Math.min(
        500,
        Math.max(
          180,
          windowHeight - (e.clientY - HEADER_HEIGHT)
        )
      );

      setPreviewRatio(nextPreviewRatio);
      setTimelineHeight(nextTimelineHeight);
    };

    const handleUp = () => {
      dragRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener(
        'mousemove',
        handleMove
      );
      window.removeEventListener(
        'mouseup',
        handleUp
      );
    };
  }, []);

  const beginDragging = () => {
    dragRef.current = true;
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  const handleDimensionPreset = (
    type: 'horizontal' | 'vertical'
  ) => {
    const render =
      type === 'horizontal'
        ? {
          width: 1920,
          height: 1080,
          fps: 30,
        }
        : {
          width: 1080,
          height: 1920,
          fps: 30,
        };

    setConfig({
      ...config,
      render,
    });

    saveProjectConfig();
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white font-sans overflow-hidden select-none">

      <header className="h-14 border-b border-neutral-900 bg-neutral-900/30 flex items-center justify-between px-4 shrink-0 relative">

        <ProjectSelector />

        <div
          className="relative"
          ref={settingsRef}
        >
          <button
            onClick={() =>
              setShowSettings(!showSettings)
            }
            className={`p-2 rounded-lg border border-neutral-800 transition flex items-center gap-2 text-xs font-medium ${showSettings
                ? 'bg-neutral-800 text-white border-neutral-700'
                : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
          >
            <Settings
              size={14}
              className={
                showSettings
                  ? 'animate-spin-slow'
                  : ''
              }
            />

            <span>Settings</span>
          </button>

          {showSettings && (
            <div className="absolute right-0 mt-2 w-72 bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">

              <div className="flex items-center gap-1.5 text-neutral-200 font-semibold text-xs mb-3 border-b border-neutral-800 pb-2">

                <Sliders
                  size={13}
                  className="text-blue-400"
                />

                <span>
                  Composition Configuration
                </span>

              </div>

              <div className="space-y-3">

                <div>

                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block mb-1.5">
                    Output Format Preset
                  </span>

                  <div className="grid grid-cols-2 gap-2">

                    <button
                      onClick={() =>
                        handleDimensionPreset(
                          'horizontal'
                        )
                      }
                      className={`py-2 rounded-lg text-xs font-medium transition ${width === 1920
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                          : 'bg-neutral-950 text-neutral-400 hover:bg-neutral-800'
                        }`}
                    >
                      Landscape (16:9)
                    </button>

                    <button
                      onClick={() =>
                        handleDimensionPreset(
                          'vertical'
                        )
                      }
                      className={`py-2 rounded-lg text-xs font-medium transition ${width === 1080
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20'
                          : 'bg-neutral-950 text-neutral-400 hover:bg-neutral-800'
                        }`}
                    >
                      Shorts (9:16)
                    </button>

                  </div>

                </div>

                <div className="bg-neutral-950/50 rounded-lg p-2.5 border border-neutral-800/60 font-mono text-[10px] text-neutral-500 space-y-1">

                  <div className="flex justify-between">
                    <span>Width:</span>
                    <span className="text-neutral-300">
                      {config.render?.width || 1920}px
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Height:</span>
                    <span className="text-neutral-300">
                      {config.render?.height || 1080}px
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Target FPS:</span>
                    <span className="text-neutral-300">
                      {config.render?.fps || 30}fps
                    </span>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>

      </header>
      <div
        className="relative flex-1 overflow-hidden"
      >

        {/* ===================== */}
        {/* TOP WORKSPACE */}
        {/* ===================== */}

        <div
          className="flex absolute left-0 right-0 top-0"
          style={{
            bottom: `${timelineHeight}px`,
          }}
        >

          {/* Preview */}

          <main
            className="bg-neutral-950/60 p-6 flex items-center justify-center min-w-0 border-r border-neutral-900"
            style={{
              width: `${previewRatio * 100}%`,
            }}
          >
            <PreviewPanel />
          </main>

          {/* Assets */}

          <aside
            className="flex flex-col border-l border-neutral-900 bg-neutral-950"
            style={{
              width: `${(1 - previewRatio) * 100}%`,
              minWidth: 240,
              maxWidth: 520,
            }}
          >
            <AssetsPanel />
          </aside>

        </div>

        {/* ===================== */}
        {/* TIMELINE */}
        {/* ===================== */}

        <footer
          className="absolute left-0 right-0 bottom-0 border-t border-neutral-900 bg-neutral-950 z-10"
          style={{
            height: `${timelineHeight}px`,
          }}
        >
          <Timeline />
        </footer>

        {/* ===================== */}
        {/* INTERSECTION HANDLE */}
        {/* ===================== */}

        <button
          onMouseDown={beginDragging}
          className="
            absolute
            rounded-full
            bg-blue-500
            border-2
            border-neutral-900
            shadow-xl
            hover:bg-blue-400
            active:scale-95
            transition-colors
          "
          style={{
            width: 12,
            height: 12,

            left: `${previewRatio * 100}%`,
            top: `calc(100% - ${timelineHeight}px)`,

            transform: 'translate(-50%, -50%)',

            cursor: 'nwse-resize',

            zIndex: 1000,
          }}
          title="Resize workspace"
        />

        {/* Horizontal guide */}

        <div
          className="absolute left-0 right-0 bg-neutral-800 pointer-events-none"
          style={{
            top: `calc(100% - ${timelineHeight}px)`,
            height: 1,
          }}
        />

        {/* Vertical guide */}

        <div
          className="absolute top-0 bottom-0 bg-neutral-800 pointer-events-none"
          style={{
            left: `${previewRatio * 100}%`,
            width: 1,
          }}
        />
      </div>
    </div>
  );
}