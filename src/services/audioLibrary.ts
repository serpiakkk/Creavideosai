import { BackgroundMusicConfig } from '../types';

export interface PresetTrack {
  id: string;
  name: string;
  genre: string;
  tempo: string;
  presetType: 'lofi' | 'upbeat' | 'cinematic' | 'corporate';
}

export const PRESET_TRACKS: PresetTrack[] = [
  {
    id: 'lofi-chill',
    name: 'Lo-Fi Chill Hop',
    genre: 'Relax / Estudio',
    tempo: '82 BPM',
    presetType: 'lofi',
  },
  {
    id: 'upbeat-tech',
    name: 'Upbeat Tech Energy',
    genre: 'Dinámico / YouTube',
    tempo: '124 BPM',
    presetType: 'upbeat',
  },
  {
    id: 'cinematic-drama',
    name: 'Cinematic Ambient',
    genre: 'Emotivo / Drama',
    tempo: '70 BPM',
    presetType: 'cinematic',
  },
  {
    id: 'corporate-clean',
    name: 'Corporate Minimal',
    genre: 'Negocios / Explicativo',
    tempo: '105 BPM',
    presetType: 'corporate',
  },
];

// Helper to generate a loopable background ambient AudioBuffer using Web Audio API
export function createSynthesizedMusicBuffer(
  audioCtx: AudioContext,
  presetType: 'lofi' | 'upbeat' | 'cinematic' | 'corporate',
  durationSeconds: number = 30
): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const numFrames = Math.floor(sampleRate * durationSeconds);
  const buffer = audioCtx.createBuffer(2, numFrames, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Musical chord progressions for each style
  const scales = {
    lofi: [220, 261.63, 329.63, 392, 440], // A minor pentatonic / 7th
    upbeat: [261.63, 329.63, 392, 523.25, 587.33], // C major / A minor
    cinematic: [146.83, 174.61, 220, 261.63, 293.66], // D minor epic
    corporate: [261.63, 293.66, 329.63, 392, 440], // C major clean
  };

  const notes = scales[presetType] || scales.lofi;
  const bpm = presetType === 'upbeat' ? 120 : presetType === 'lofi' ? 80 : 70;
  const beatDuration = 60 / bpm;

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const currentBeat = Math.floor(t / beatDuration);
    const beatPhase = (t % beatDuration) / beatDuration;

    // Pick note based on beat
    const noteIndex = currentBeat % notes.length;
    const freq = notes[noteIndex];
    const subFreq = freq / 2;

    // Soft synth envelope (attack + slow decay)
    const env = Math.exp(-beatPhase * 3.5);

    // Warm chord pad
    const pad =
      (Math.sin(2 * Math.PI * freq * t) * 0.08 +
        Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.04 +
        Math.sin(2 * Math.PI * subFreq * t) * 0.06) *
      env;

    // Subtle rhythmic pulse
    const kickEnv = Math.exp(-beatPhase * 12);
    const kick = (currentBeat % 2 === 0 ? Math.sin(2 * Math.PI * 65 * beatPhase) * 0.12 * kickEnv : 0);

    // Subtle texture noise (like vinyl or gentle acoustic shaker)
    const noise = (Math.random() * 2 - 1) * 0.005;

    // Output with stereo widening
    left[i] = pad * 0.8 + kick + noise;
    right[i] = pad * 0.8 + kick - noise;
  }

  return buffer;
}
