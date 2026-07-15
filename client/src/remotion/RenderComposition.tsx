import { useRef, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { Sequence, Video, Audio, interpolate, useCurrentFrame, Img } from 'remotion';
import { useProjectStore } from '../state/useProjectStore';
import { BlurMaskLayer } from './BlurMaskLayer';

const BACKEND_STATIC_URL = 'http://localhost:4000';

const isVoiceActiveAtFrame = (globalFrame: number, captions: any[], fps: number): boolean => {
  if (!captions) return false;
  const currentTimeMs = (globalFrame / fps) * 1000;
  return captions.some((caption) => {
    const start = caption.start_ms;
    const end = start + (caption.audio_duration_ms || 3000);
    return currentTimeMs >= start && currentTimeMs <= end;
  });
};

const rectToPolygon = (style: any) => {
  const x = style?.x_pct ?? 0;
  const y = style?.y_pct ?? 0;
  const width = style?.width_pct ?? 10;
  const height = style?.height_pct ?? 10;

  return [
    [x / 100, y / 100],
    [(x + width) / 100, y / 100],
    [(x + width) / 100, (y + height) / 100],
    [x / 100, (y + height) / 100],
  ] as [number, number][];
};

const VisualClipItem = ({ visual, currentProject, fps, durationFrames, globalStartFrame, captions }: { visual: any; currentProject: string; fps: number; durationFrames: number; globalStartFrame: number; captions: any[] }) => {
  const currentFrame = useCurrentFrame();

  const zStart = visual.zoom_start !== undefined ? visual.zoom_start : (visual.zoom || 100);
  const zEnd = visual.zoom_end !== undefined ? visual.zoom_end : (visual.zoom || 100);

  const currentZoomCalculated = interpolate(
    currentFrame,
    [0, Math.max(1, durationFrames)],
    [zStart / 100, zEnd / 100],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const visualTransformStyles: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transformOrigin: 'center center',
    transform: `
    rotate(${visual.rotation || 0}deg)
    scaleX(${visual.flop ? -1 : 1})
    scaleY(${visual.flipped ? -1 : 1})
    scale(${currentZoomCalculated})
  `,
  };

  const normalizedAsset = visual.asset.startsWith('public/') ? visual.asset : `public/${visual.asset}`;
  const absoluteAssetUrl = `${BACKEND_STATIC_URL}/projects/${currentProject}/${normalizedAsset}`;
  const isVideo = absoluteAssetUrl.toLowerCase().split('?')[0].endsWith('.mp4') || absoluteAssetUrl.toLowerCase().split('?')[0].endsWith('.mov');

  const sourceStartFrame = Math.floor(((visual.source_start_ms || 0) / 1000) * fps);
  const sourceEndFrame = sourceStartFrame + durationFrames;

  const globalFrame = globalStartFrame + currentFrame;
  const isSpeaking = isVoiceActiveAtFrame(globalFrame, captions, fps);
  const videoVolume = isSpeaking ? 0.2 : 1.0;
  const isMutedRender = Boolean((visual as any).muteAudio);

  if (isVideo) {
    return (
      <Video
        src={absoluteAssetUrl}
        startFrom={sourceStartFrame}
        endAt={sourceEndFrame}
        volume={isMutedRender ? 0 : videoVolume}
        style={visualTransformStyles}
      />
    );
  }

  return (
    <Img
      src={absoluteAssetUrl}
      style={visualTransformStyles}
      alt="Asset Frame"
    />
  );
};

const DuckableAudioTrack = ({ absoluteAudioUrl, globalStartFrame, captions, fps }: { absoluteAudioUrl: string; globalStartFrame: number; captions: any[]; fps: number }) => {
  const currentFrame = useCurrentFrame();
  const globalFrame = globalStartFrame + currentFrame;

  const isSpeaking = isVoiceActiveAtFrame(globalFrame, captions, fps);

  const trackVolume = interpolate(
    isSpeaking ? 1 : 0,
    [0, 1],
    [1.0, 0.75],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return <Audio src={absoluteAudioUrl} volume={trackVolume} />;
};

const CompositionScene = ({ config, currentProject, fps, includeAudio = true, includeCaptions = true }: { config: any; currentProject: string; fps: number; includeAudio?: boolean; includeCaptions?: boolean }) => {
  return (
    <div className="absolute inset-0 bg-neutral-900 w-full h-full overflow-hidden select-none">
      {config.visuals?.map((visual: any) => {
        const startFrame = Math.floor((visual.start_ms / 1000) * fps);
        const durationFrames = Math.floor((visual.duration_ms / 1000) * fps);

        return (
          <Sequence key={visual.id} from={startFrame} durationInFrames={durationFrames} layout="none">
            <VisualClipItem
              visual={visual}
              currentProject={currentProject}
              fps={fps}
              durationFrames={durationFrames}
              globalStartFrame={startFrame}
              captions={config.captions}
            />
          </Sequence>
        );
      })}

      {includeAudio && config.audio_tracks?.map((audio: any) => {
        const normalizedAsset = audio.asset.startsWith('public/') ? audio.asset : `public/${audio.asset}`;
        const absoluteAssetUrl = `${BACKEND_STATIC_URL}/projects/${currentProject}/${normalizedAsset}`;

        const startFrame = Math.floor((audio.start_ms / 1000) * fps);
        const durationFrames = Math.floor((audio.duration_ms / 1000) * fps);

        return (
          <Sequence key={audio.id} from={startFrame} durationInFrames={durationFrames} layout="none">
            <DuckableAudioTrack
              absoluteAudioUrl={absoluteAssetUrl}
              globalStartFrame={startFrame}
              captions={config.captions}
              fps={fps}
            />
          </Sequence>
        );
      })}

      {includeCaptions && config.captions?.map((caption: any) => {
        const startFrame = Math.floor((caption.start_ms / 1000) * fps);
        const durationFrames = Math.floor(((caption.audio_duration_ms || 3000) / 1000) * fps);

        const normalizedAsset = caption.audio_asset
          ? (caption.audio_asset.startsWith('public/') ? caption.audio_asset : `public/${caption.audio_asset}`)
          : null;
        const absoluteAudioUrl = normalizedAsset ? `${BACKEND_STATIC_URL}/projects/${currentProject}/${normalizedAsset}` : null;

        return (
          <Sequence key={caption.id} from={startFrame} durationInFrames={durationFrames} layout="none">
            {absoluteAudioUrl && includeAudio && <Audio src={absoluteAudioUrl} volume={1.5} />}

            <div className="absolute bottom-8 left-6 right-6 flex justify-center z-50 pointer-events-none">
              <span className="bg-black/90 px-4 py-2 rounded-xl text-xs font-sans font-bold tracking-wide border border-neutral-800 text-yellow-400 shadow-2xl max-w-[90%] text-center">
                {caption.text}
              </span>
            </div>
          </Sequence>
        );
      })}
    </div>
  );
};

export const RenderCompositionCanvas = ({ config, currentProject, fps }: { config: any; currentProject: string; fps: number }) => {
  const legacyBlurRegions = (config.effects || [])
    .filter((fx: any) => fx.type === 'blur')
    .map((blurEffect: any) => ({
      id: blurEffect.id,
      start_ms: blurEffect.start_ms,
      end_ms: blurEffect.start_ms + (blurEffect.duration_ms || 0),
      points: rectToPolygon(blurEffect.style),
      blur_px: blurEffect.style?.blur_radius_px ?? 15,
    }));

  const blurRegions = [...(config.blurRegions || []), ...legacyBlurRegions];
  const baseSceneStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  };

  return (
    <div className="absolute inset-0 bg-neutral-900 w-full h-full overflow-hidden select-none">
      <CompositionScene config={config} currentProject={currentProject} fps={fps} includeAudio includeCaptions />
      {blurRegions.length > 0 && (
        <BlurMaskLayer blurRegions={blurRegions} videoStyle={baseSceneStyle}>
          <CompositionScene config={config} currentProject={currentProject} fps={fps} includeAudio={false} includeCaptions={false} />
        </BlurMaskLayer>
      )}
    </div>
  );
};

export default function PreviewPanel() {
  const { config, isPlaying, currentProject, setCurrentTimeMs, setIsPlaying } = useProjectStore();
  const playerRef = useRef<PlayerRef>(null);

  const width = config.render?.width || 1920;
  const height = config.render?.height || 1080;
  const fps = config.render?.fps || 30;

  const totalFrames = Math.max(30, Math.floor((config.total_ms / 1000) * fps));

  const memoizedInputProps = useMemo(() => ({
    config,
    currentProject,
    fps,
  }), [config, currentProject, fps]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying && !player.isPlaying()) player.play();
    if (!isPlaying && player.isPlaying()) player.pause();
  }, [isPlaying]);

  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!playerRef.current) return;

      if (!state.isPlaying) {
        const currentTargetFrame = Math.floor((state.currentTimeMs / 1000) * fps);
        if (playerRef.current.getCurrentFrame() !== currentTargetFrame) {
          playerRef.current.seekTo(currentTargetFrame);
        }
      }
    });
    return unsubscribe;
  }, [fps]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = () => {
      const storeState = useProjectStore.getState();

      if (storeState.isPlaying) {
        const currentFrame = player.getCurrentFrame();
        const calculatedMs = (currentFrame / fps) * 1000;
        const maxLimitBoundaryMs = storeState.config.total_ms;

        if (calculatedMs >= maxLimitBoundaryMs) {
          setCurrentTimeMs(maxLimitBoundaryMs);
          setIsPlaying(false);
          player.pause();
        } else {
          setCurrentTimeMs(Math.round(calculatedMs));
        }
      }
    };

    player.addEventListener('frameupdate', onFrameUpdate);
    return () => player.removeEventListener('frameupdate', onFrameUpdate);
  }, [fps, setCurrentTimeMs, setIsPlaying]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        className="relative bg-black rounded-lg shadow-2xl overflow-hidden border border-neutral-800 w-full max-w-[90%]"
        style={{ aspectRatio: `${width} / ${height}`, maxHeight: '63vh' }}
      >
        <Player
          ref={playerRef}
          component={RenderCompositionCanvas}
          inputProps={memoizedInputProps}
          durationInFrames={totalFrames}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          style={{ width: '100%', height: '100%' }}
          controls={false}
          loop={false}
        />
      </div>
    </div>
  );
}
