export type AspectRatio = '16:9' | '9:16';

export type CameraMotion = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';

export type SceneTransition = 'fade' | 'cut' | 'crossfade';

export type SceneStatus = 'pending' | 'generating_image' | 'generating_voice' | 'ready' | 'error' | 'outdated_voice';

export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'error' | 'paused';

export interface SceneItem {
  id: string;
  order: number;
  title: string;
  narrationText: string;
  visualDescription: string;
  visualPrompt: string;
  imageUrl?: string; // data URL or blob URL
  isFallbackImage?: boolean; // True if created by SVG fallback generator
  audioUrl?: string; // data URL
  audioBlob?: Blob;
  duration: number; // in seconds
  cameraMotion: CameraMotion;
  transition: SceneTransition;
  status: SceneStatus;
  voiceOutdated?: boolean;
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

export type ModelProviderType = 'gemini' | 'local' | 'internal';

export interface SelectedModel {
  provider: ModelProviderType;
  modelId: string;
  modelName: string;
  sizeLabel?: string;
  tier?: 'light' | 'medium' | 'heavy';
}

export interface TaskModelConfig {
  script: SelectedModel;
  image: SelectedModel;
  voice: SelectedModel;
}

export interface HardwareCapabilities {
  hasWebGPU: boolean;
  adapterInfo?: string;
  deviceMemoryGB?: number;
  hardwareConcurrency: number;
  isIOS: boolean;
  storageQuotaMB?: number;
  storageUsedMB?: number;
  isPersisted: boolean;
}

export interface ModelItem {
  id: string;
  name: string;
  task: 'script' | 'image' | 'voice';
  provider: ModelProviderType;
  tier?: 'light' | 'medium' | 'heavy';
  downloadSize: string;
  requirements: string;
  quality: string;
  speed: string;
  status: 'not_downloaded' | 'downloading' | 'installed' | 'unsupported';
  downloadProgress?: number;
  suitability: 'recommended' | 'slow' | 'may_crash';
  description?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  text: string;
  attachment?: {
    name: string;
    type: 'script' | 'music' | 'image';
    snippet?: string;
  };
  widgetType?:
    | 'script_parsed'
    | 'generating_progress'
    | 'video_ready'
    | 'quota_alert'
    | 'fallback_image_prompt'
    | 'models_sheet'
    | 'test_ready'
    | 'style_change_confirm'
    | 'confirm_replace_script'
    | 'failed_scenes_alert';
  widgetData?: any;
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
  thumbnailSubtitle?: string; // Editable subtitle for YouTube thumbnail
  fallbackImagePreference?: 'ask' | 'use_fallback' | 'wait_retry';
  modelConfig?: TaskModelConfig;
  characterDescription?: string;
  chatHistory?: ChatMessage[];
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

