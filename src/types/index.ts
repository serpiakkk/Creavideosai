export type AspectRatio = '16:9' | '9:16';

export type CameraMotion = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';

export type SceneTransition = 'fade' | 'cut' | 'crossfade';

export type SceneStatus = 'pending' | 'generating_image' | 'generating_voice' | 'ready' | 'error';

export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'error' | 'paused';

export interface SceneItem {
  id: string;
  order: number;
  title: string;
  narrationText: string;
  visualDescription: string;
  visualPrompt: string;
  imageUrl?: string; // data URL or blob URL
  audioUrl?: string; // data URL or blob URL
  audioBlob?: Blob;
  duration: number; // in seconds
  cameraMotion: CameraMotion;
  transition: SceneTransition;
  status: SceneStatus;
  errorMessage?: string;
  keywords?: string[];
}

export interface BackgroundMusicConfig {
  id: string;
  name: string;
  type: 'preset' | 'custom' | 'none';
  volume: number; // 0.0 to 1.0
  presetType?: 'lofi' | 'upbeat' | 'cinematic' | 'corporate';
  customFileName?: string;
  customAudioUrl?: string;
}

export interface VideoProject {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  aspectRatio: AspectRatio;
  rawScript: string;
  visualStyle: string;
  voiceName: string;
  voiceSpeed: number; // 0.9 to 1.3
  voiceTone: 'informativo' | 'curioso' | 'dramático' | 'entusiasta';
  music: BackgroundMusicConfig;
  status: ProjectStatus;
  scenes: SceneItem[];
  currentSceneIndex?: number;
  testMode?: boolean; // If tested with only 2 scenes
}

export interface VisualPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  badge: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: 'Femenino' | 'Masculino';
  style: string;
}

export interface YouTubeMetadata {
  titles: string[];
  description: string;
  tags: string[];
  hashtags: string[];
}
