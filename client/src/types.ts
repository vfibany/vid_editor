export interface RenderSettings {
  width: number;
  height: number;
  fps: number;
}

export interface CaptionAsset {
  id: string;
  text: string;
  speaker: string;
  start_ms: number;
  audio_asset: string;
  audio_duration_ms: number;
  show_captions: boolean;
}

export interface VisualAsset {
  id: string;
  asset: string;
  start_ms: number;
  duration_ms: number;
  trim_start_ms?: number;
  trim_end_ms?: number;
  crop?: { x: number; y: number; width: number; height: number };
}

export interface AudioTrack {
  id: string;
  asset: string;
  type: 'bgm' | 'sfx';
  start_ms: number;
  duration_ms: number;
  volume: number;
  duck_when_narration: boolean;
  duck_amount: number;
}

export interface BlurEffectStyle {
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
  blur_radius_px: number;
}

export interface VideoEffectItem {
  id: string;
  type: 'blur' | string; // Allows for extension down the line (e.g., 'pixelate', 'crop')
  target_visual_id: string;
  start_ms: number;
  duration_ms: number;
  style: BlurEffectStyle;
}

export interface BlurRegion {
  id: string;
  start_ms: number;
  end_ms: number;
  points: [number, number][];
  blur_px: number;
}

export interface ProjectConfig {
  captions: CaptionAsset[];
  visuals: VisualAsset[];
  audio_tracks: AudioTrack[];
  blurRegions?: BlurRegion[];
  total_ms: number;
  fps: number;
  render?: RenderSettings;
  effects?: VideoEffectItem[];
}

export interface RawAsset {
  name: string;
  relativePath: string; // e.g., 'video/clip.mp4'
  type: 'video' | 'audio' | 'image';
  size: number;
}
