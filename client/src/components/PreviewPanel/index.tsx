import { useRef, useEffect, useMemo } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { useProjectStore } from '../../state/useProjectStore';
import { RenderCompositionCanvas } from '../../remotion/RenderComposition';

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
    fps
  }), [config, currentProject, fps]);

  // Handle Play/Pause toggling natively without re-triggering positions
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying && !player.isPlaying()) player.play();
    if (!isPlaying && player.isPlaying()) player.pause();
  }, [isPlaying]);

  // FIX: Separate manual scrubber seek triggers from internal frame progress
  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!playerRef.current) return;

      // CRITICAL: Only allow external updates to sync to the player if it's PAUSED.
      // This prevents the state loop from fighting the player's natural ticks during video playback.
      if (!state.isPlaying) {
        const currentTargetFrame = Math.floor((state.currentTimeMs / 1000) * fps);
        if (playerRef.current.getCurrentFrame() !== currentTargetFrame) {
          playerRef.current.seekTo(currentTargetFrame);
        }
      }
    });
    return unsubscribe;
  }, [fps]);

  // Handle timeline ticks during active playback
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate = () => {
      // Direct access checking inside event frames to prevent stale scope issues
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
          // Use Math.round to keep milliseconds and frames cleanly structured
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
