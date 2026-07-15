import { registerRoot, Composition, getInputProps } from 'remotion';
import { RenderCompositionCanvas } from './remotion/RenderComposition';

const RemotionRoot = () => {
  const config = getInputProps() as any;

  const fps = config?.render?.fps ?? 30;
  const width = config?.render?.width ?? 1920;
  const height = config?.render?.height ?? 1080;
  const durationInFrames = Math.max(
    30,
    Math.ceil(((config?.total_ms ?? 1000) / 1000) * fps)
  );

  return (
    <Composition
      id="RenderEngine"
      component={RenderCompositionCanvas}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
      defaultProps={{
        config,
        currentProject: config.projectId ?? "",
        fps,
      }}
    />
  );
};



registerRoot(RemotionRoot);