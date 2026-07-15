import { create } from 'zustand';
// Add the 'type' keyword right here:
import type { ProjectConfig, RawAsset } from '../types';

interface ProjectState {
  currentProject: string;
  config: ProjectConfig;
  assets: RawAsset[];
  currentTimeMs: number;
  isPlaying: boolean;
  setProject: (projectId: string) => void;
  setConfig: (config: ProjectConfig) => void;
  setAssets: (assets: RawAsset[]) => void;
  setCurrentTimeMs: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  fetchProjectData: (projectId: string) => Promise<void>;
  saveProjectConfig: () => Promise<void>;
  removeTimelineEvent: (trackType: 'captions' | 'visuals' | 'audio_tracks' | 'blurRegions', id: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: localStorage.getItem('current_project') || '',
  config: { captions: [], visuals: [], audio_tracks: [], blurRegions: [], total_ms: 5000, fps: 30, render: { width: 1920, height: 1080, fps: 30 } },
  assets: [],
  currentTimeMs: 0,
  isPlaying: false,

  setProject: (projectId) => {
    localStorage.setItem('current_project', projectId);
    set({ currentProject: projectId });
    if (projectId) get().fetchProjectData(projectId);
  },
  setConfig: (config) => set({ config }),
  setAssets: (assets) => set({ assets }),
  setCurrentTimeMs: (time) => set({ currentTimeMs: Math.max(0, time) }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  fetchProjectData: async (projectId) => {
    try {
      const configRes = await fetch(`/api/config?projectId=${projectId}`);
      if (configRes.ok) {
        const configData = await configRes.json();
        set({ config: configData });
      }
      const assetsRes = await fetch(`/api/assets?projectId=${projectId}`);
      if (assetsRes.ok) {
        const assetsData = await assetsRes.json();
        set({ assets: assetsData });
      }
    } catch (err) {
      console.error("Failed to fetch project payload structure", err);
    }
  },

  saveProjectConfig: async () => {
    const { currentProject, config } = get();
    if (!currentProject) return;
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject, config })
      });
    } catch (err) {
      console.error("Failed autosaving project structure parameters", err);
    }
  },

  removeTimelineEvent: (trackType, id) => {
    set((state) => ({
      config: {
        ...state.config,
        [trackType]: (state.config[trackType] || []).filter((event: any) => event.id !== id)
      }
    }));
    get().saveProjectConfig();
  }
}));
