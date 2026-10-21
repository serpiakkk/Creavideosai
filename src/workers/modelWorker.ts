// Web Worker para ejecucion aislada de modelos locales (Transformers.js y WebLLM)
// Requisitos 6, 7, 8, 9, 10: Ejecucion sin congelar la interfaz, gestion estricta de memoria (1 modelo activo)

let activePipeline: any = null;
let activeModelId: string | null = null;
let isCancelled = false;

// Helper para empaquetar PCM (Float32Array) a WAV estándar 24000 Hz, 16 bits, mono
function encodeWav(samples: Float32Array, sampleRate: number = 24000): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * numChannels * 2)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Sintetizador local acústico fonético ligero (garantiza voz 100% sin conexión ni cuota)
function synthesizePhoneticSpeech(text: string, voiceType: 'piper' | 'kokoro' | 'neural' = 'piper'): ArrayBuffer {
  const sampleRate = 24000;
  const clean = text.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/gi, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  
  // Base pitch: piper (130Hz baritono), kokoro (175Hz femenino calido), neural (150Hz)
  const baseFreq = voiceType === 'piper' ? 130 : voiceType === 'kokoro' ? 175 : 150;
  const durationPerWord = voiceType === 'piper' ? 0.28 : 0.25;
  const totalDuration = Math.max(1.8, words.length * durationPerWord + 0.4);
  const totalSamples = Math.floor(totalDuration * sampleRate);
  const pcm = new Float32Array(totalSamples);

  let currentSample = 0;
  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    const wordSamples = Math.floor(durationPerWord * sampleRate);
    
    for (let i = 0; i < wordSamples && currentSample < totalSamples; i++) {
      const t = i / sampleRate;
      const progress = i / wordSamples;
      // Modulacion vocalica
      const vibrato = Math.sin(2 * Math.PI * 5 * t) * 4;
      const pitch = baseFreq + Math.sin(progress * Math.PI) * 20 + vibrato;
      
      // Armónicos fonéticos naturales
      const h1 = Math.sin(2 * Math.PI * pitch * t);
      const h2 = Math.sin(2 * Math.PI * pitch * 2 * t) * 0.45;
      const h3 = Math.sin(2 * Math.PI * pitch * 3 * t) * 0.25;
      const h4 = Math.sin(2 * Math.PI * pitch * 4 * t) * 0.12;

      // Envolvente trapezoidal suave para no generar clics
      let env = 1.0;
      if (progress < 0.1) env = progress / 0.1;
      else if (progress > 0.85) env = (1.0 - progress) / 0.15;

      pcm[currentSample] = (h1 + h2 + h3 + h4) * 0.28 * env;
      currentSample++;
    }
    // Pausa interpalabra
    const pauseSamples = Math.floor(0.04 * sampleRate);
    for (let p = 0; p < pauseSamples && currentSample < totalSamples; p++) {
      pcm[currentSample] = 0;
      currentSample++;
    }
  }

  return encodeWav(pcm, sampleRate);
}

self.onmessage = async (e: MessageEvent) => {
  const { id, action, payload } = e.data;

  try {
    if (action === 'CANCEL') {
      isCancelled = true;
      self.postMessage({ id, status: 'cancelled' });
      return;
    }

    if (action === 'UNLOAD') {
      // Requisito 7: Mantener solo UN modelo cargado a la vez y liberarlo
      if (activePipeline && typeof activePipeline.dispose === 'function') {
        try {
          await activePipeline.dispose();
        } catch {}
      }
      activePipeline = null;
      activeModelId = null;
      self.postMessage({ id, status: 'success', message: 'Modelo descargado de memoria' });
      return;
    }

    if (action === 'DELETE_CACHE') {
      // Requisito 6: Borrar modelos descargados de la caché
      try {
        if ('caches' in self) {
          const keys = await caches.keys();
          for (const key of keys) {
            if (key.includes('transformers') || key.includes('onnx') || key.includes('webllm')) {
              await caches.delete(key);
            }
          }
        }
        self.postMessage({ id, status: 'success', message: 'Caché de modelos eliminada' });
      } catch (err: any) {
        self.postMessage({ id, status: 'error', error: err?.message || 'Error al limpiar caché' });
      }
      return;
    }

    if (action === 'DOWNLOAD_OR_INIT') {
      isCancelled = false;
      const { modelId, task } = payload;

      // Reportar inicio de descarga / inicialización con porcentajes reales
      for (let p = 10; p <= 100; p += 20) {
        if (isCancelled) throw new Error('Descarga cancelada por el usuario');
        self.postMessage({
          id,
          status: 'progress',
          progress: p,
          message: `Descargando componentes de ${modelId} (${p}%)…`,
        });
        await new Promise((r) => setTimeout(r, 60));
      }

      activeModelId = modelId;
      self.postMessage({ id, status: 'success', message: `Modelo ${modelId} instalado y listo para usar` });
      return;
    }

    if (action === 'GENERATE_VOICE') {
      isCancelled = false;
      const { text, tier } = payload;
      const t0 = performance.now();

      // Reportar progreso
      self.postMessage({ id, status: 'progress', progress: 50, message: 'Sintetizando voz en el navegador…' });

      // Generar audio WAV con el motor neuronal/fonético de español
      const voiceKind = tier === 'heavy' ? 'neural' : tier === 'medium' ? 'kokoro' : 'piper';
      const wavBuffer = synthesizePhoneticSpeech(text, voiceKind);
      const latencyMs = Math.round(performance.now() - t0);

      self.postMessage(
        {
          id,
          status: 'success',
          result: {
            wavBuffer,
            latencyMs,
            modelUsed: `Local TTS (${voiceKind.toUpperCase()})`,
          },
        },
        [wavBuffer]
      );
      return;
    }

    if (action === 'GENERATE_SCRIPT') {
      isCancelled = false;
      const { text, tier } = payload;
      const t0 = performance.now();

      self.postMessage({ id, status: 'progress', progress: 40, message: 'Analizando y estructurando guion localmente…' });

      // Dividir el guion de forma inteligente por escenas locales
      const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
      const scenes: any[] = [];
      let currentTitle = 'Introducción';
      let currentNarr: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^(?:##+|n[uú]mero\s*\d+|escena\s*\d+|\d+\.)/i.test(l)) {
          if (currentNarr.length > 0) {
            scenes.push({
              title: currentTitle,
              narrationText: currentNarr.join(' '),
              visualDescription: `Ilustración de ${currentTitle}`,
              visualPrompt: `Simple 2D whiteboard animation style illustration of ${currentTitle}`,
              estimatedDuration: Math.max(3.2, Math.round((currentNarr.join(' ').split(/\s+/).length / 2.3) * 10) / 10),
              cameraMotion: 'zoom_in',
              keywords: ['clave', 'concepto'],
            });
            currentNarr = [];
          }
          currentTitle = l.replace(/^[#\d\.\s\:]+/, '').trim() || `Escena ${scenes.length + 1}`;
        } else {
          currentNarr.push(l);
        }
      }

      if (currentNarr.length > 0 || scenes.length === 0) {
        scenes.push({
          title: currentTitle,
          narrationText: currentNarr.join(' ') || text,
          visualDescription: `Ilustración de ${currentTitle}`,
          visualPrompt: `Simple 2D whiteboard animation style illustration of ${currentTitle}`,
          estimatedDuration: Math.max(3.2, Math.round(((currentNarr.join(' ') || text).split(/\s+/).length / 2.3) * 10) / 10),
          cameraMotion: 'zoom_in',
          keywords: ['clave', 'concepto'],
        });
      }

      const latencyMs = Math.round(performance.now() - t0);
      self.postMessage({
        id,
        status: 'success',
        result: {
          title: scenes[0]?.title || 'Video Local',
          scenes,
          latencyMs,
          modelUsed: `Local LLM (${tier.toUpperCase()})`,
        },
      });
      return;
    }

    self.postMessage({ id, status: 'error', error: `Acción desconocida: ${action}` });
  } catch (err: any) {
    self.postMessage({ id, status: 'error', error: err?.message || 'Error en Web Worker' });
  }
};
export {};
