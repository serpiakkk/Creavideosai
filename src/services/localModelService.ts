import { ModelItem, SelectedModel, TaskModelConfig, HardwareCapabilities } from '../types';
import { detectHardwareCapabilities, evaluateSuitability } from './hardwareDetector';

// Catalogo exhaustivo de modelos organizados segun Requisitos 1, 2, 8, 9, 10
export const ALL_MODELS: ModelItem[] = [
  // ===================== GUION =====================
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    task: 'script',
    provider: 'gemini',
    tier: 'light',
    downloadSize: '0 MB (Nube)',
    requirements: 'Conexión a internet · Cuota Gemini',
    quality: 'Muy Alta · Creatividad cinematográfica',
    speed: '~1-3 segundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Modelo en la nube rápido, optimizado para structuring y continuidad de personajes.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    task: 'script',
    provider: 'gemini',
    tier: 'medium',
    downloadSize: '0 MB (Nube)',
    requirements: 'Conexión a internet · Cuota Gemini',
    quality: 'Excelente · Guiones profundos y virales',
    speed: '~3-6 segundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Modelo de razonamiento superior para guiones complejos.',
  },
  {
    id: 'local-script-light',
    name: 'Qwen2.5 0.5B Instruct (Ligero)',
    task: 'script',
    provider: 'local',
    tier: 'light',
    downloadSize: '350 MB',
    requirements: 'Cualquier dispositivo · WASM / WebGPU',
    quality: 'Buena · Estructura rápida en escenas',
    speed: '~2 segundos (Local)',
    status: 'installed', // Preinstalado según respuesta de usuario
    suitability: 'recommended',
    description: 'Modelo local ultra compacto. Genera escenas y duraciones en el navegador.',
  },
  {
    id: 'local-script-medium',
    name: 'Llama 3.2 3B Instruct (Medio)',
    task: 'script',
    provider: 'local',
    tier: 'medium',
    downloadSize: '1.8 GB',
    requirements: '4GB RAM · WebGPU recomendado',
    quality: 'Muy Alta · Diálogos dinámicos',
    speed: '~4-8 segundos',
    status: 'not_downloaded',
    suitability: 'recommended',
    description: 'Equilibrio ideal entre potencia narrativa y consumo en navegador.',
  },
  {
    id: 'local-script-heavy',
    name: 'Qwen2.5 7B Instruct (Pesado)',
    task: 'script',
    provider: 'local',
    tier: 'heavy',
    downloadSize: '4.2 GB',
    requirements: '8GB RAM · GPU dedicada / WebGPU',
    quality: 'Máxima · Calidad editorial completa',
    speed: '~8-15 segundos',
    status: 'not_downloaded',
    suitability: 'recommended',
    description: 'El modelo local de texto más potente disponible para WebGPU.',
  },
  {
    id: 'internal-script-parser',
    name: 'Analizador Determinista (Sin IA)',
    task: 'script',
    provider: 'internal',
    downloadSize: '0 MB (Integrado)',
    requirements: 'Sin requisitos',
    quality: 'Precisa · Extrae escenas por encabezados',
    speed: '<10 milisegundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Motor interno instantáneo sin consumo de cuota ni descarga.',
  },

  // ===================== IMÁGENES =====================
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Gemini Flash Lite Image',
    task: 'image',
    provider: 'gemini',
    tier: 'medium',
    downloadSize: '0 MB (Nube)',
    requirements: 'Conexión a internet · Cuota Gemini',
    quality: 'Ráster Fotorrealista / Ilustrado',
    speed: '~4-7 segundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Generación directa de imágenes PNG/JPEG desde la nube de Google.',
  },
  {
    id: 'local-image-sd-turbo',
    name: 'SD-Turbo Whiteboard (Pesado)',
    task: 'image',
    provider: 'local',
    tier: 'heavy',
    downloadSize: '1.9 GB',
    requirements: 'WebGPU Obligatorio · 6GB VRAM',
    quality: 'Alta · Estilo pizarra 1 solo paso',
    speed: '~3-5 segundos (WebGPU)',
    status: 'installed', // 1 potente instalado segun respuesta
    suitability: 'recommended',
    description: 'Modelo de difusión de 1 paso en WebGPU para dibujos estilo pizarra.',
  },
  {
    id: 'internal-vector-illustrator',
    name: 'Ilustrador Vectorial (Sin IA / Interno)',
    task: 'image',
    provider: 'internal',
    downloadSize: '0 MB (Integrado)',
    requirements: 'Sin requisitos',
    quality: 'Alta definición vectorial SVG adaptable',
    speed: '<5 milisegundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Generador semántico integrado que crea escenas whiteboard sin cuota ni esperas.',
  },

  // ===================== VOZ =====================
  {
    id: 'gemini-3.8-flash-lite-tts',
    name: 'Gemini Flash Lite TTS',
    task: 'voice',
    provider: 'gemini',
    tier: 'medium',
    downloadSize: '0 MB (Nube)',
    requirements: 'Conexión a internet · Cuota Gemini',
    quality: 'Muy Alta · Voces multitonales fluidas',
    speed: '~2-4 segundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Voces de Google (Kore, Puck, Charon, Fenrir, Zephyr) con modulación de ritmo y tono.',
  },
  {
    id: 'local-voice-piper',
    name: 'Piper TTS Español (Ligero)',
    task: 'voice',
    provider: 'local',
    tier: 'light',
    downloadSize: '45 MB',
    requirements: 'Cualquier dispositivo · WASM/CPU',
    quality: 'Muy Buena · Locución clara en español',
    speed: '~0.5 segundos',
    status: 'installed', // Preinstalado segun respuesta
    suitability: 'recommended',
    description: 'Motor fonético ultra rápido en español. Produce audio WAV nativo.',
  },
  {
    id: 'local-voice-kokoro',
    name: 'Kokoro-82M TTS Español (Medio)',
    task: 'voice',
    provider: 'local',
    tier: 'medium',
    downloadSize: '180 MB',
    requirements: '4GB RAM · WASM o WebGPU',
    quality: 'Excelente · Gran entonación y calidez',
    speed: '~1-2 segundos',
    status: 'installed', // Preinstalado segun respuesta
    suitability: 'recommended',
    description: 'Modelo neuronal compacto de 82M parámetros adaptado a español.',
  },
  {
    id: 'local-voice-heavy',
    name: 'Neural Voice ES Studio (Pesado)',
    task: 'voice',
    provider: 'local',
    tier: 'heavy',
    downloadSize: '380 MB',
    requirements: 'WebGPU / 6GB RAM',
    quality: 'Estudio Profesional · Expresividad máxima',
    speed: '~2-3 segundos',
    status: 'not_downloaded',
    suitability: 'recommended',
    description: 'Modelo neuronal de alta fidelidad para podcasting y narración dramática.',
  },
  {
    id: 'internal-speech-synth',
    name: 'Sintetizador Web Audio (Sin IA)',
    task: 'voice',
    provider: 'internal',
    downloadSize: '0 MB (Integrado)',
    requirements: 'Sin requisitos',
    quality: 'Robótica acústica clara',
    speed: '<50 milisegundos',
    status: 'installed',
    suitability: 'recommended',
    description: 'Respaldo absoluto instantáneo sin ninguna dependencia externa.',
  },
];

// Configuracion por defecto
export const DEFAULT_TASK_CONFIG: TaskModelConfig = {
  script: {
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-lite',
    modelName: 'Gemini 3.1 Flash Lite',
  },
  image: {
    provider: 'internal',
    modelId: 'internal-vector-illustrator',
    modelName: 'Ilustrador Vectorial (Sin IA)',
  },
  voice: {
    provider: 'local',
    modelId: 'local-voice-piper',
    modelName: 'Piper TTS Español (Local)',
  },
};

export function getStoredDefaultModels(): TaskModelConfig {
  try {
    const saved = localStorage.getItem('autovideo_default_models');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Error leyendo modelos por defecto:', err);
  }
  return DEFAULT_TASK_CONFIG;
}

export function saveStoredDefaultModels(config: TaskModelConfig): void {
  try {
    localStorage.setItem('autovideo_default_models', JSON.stringify(config));
  } catch (err) {
    console.warn('Error guardando modelos por defecto:', err);
  }
}

// Singleton de comunicacion con el Worker
class ModelWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (val: any) => void; reject: (err: any) => void; onProgress?: (p: number, msg: string) => void }> = new Map();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/modelWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, status, result, error, progress, message } = e.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        if (status === 'progress') {
          pending.onProgress?.(progress, message);
        } else if (status === 'success') {
          pending.resolve(result || message);
          this.pendingRequests.delete(id);
        } else if (status === 'cancelled') {
          pending.reject(new Error('Operación cancelada'));
          this.pendingRequests.delete(id);
        } else if (status === 'error') {
          pending.reject(new Error(error || 'Error en ejecución de modelo local'));
          this.pendingRequests.delete(id);
        }
      };
    }
    return this.worker;
  }

  public async postAction<T = any>(
    action: string,
    payload: any,
    onProgress?: (progress: number, msg: string) => void
  ): Promise<T> {
    const worker = this.getWorker();
    const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress });
      worker.postMessage({ id, action, payload });
    });
  }

  public cancel(id?: string) {
    if (this.worker) {
      this.worker.postMessage({ action: 'CANCEL', id });
    }
  }

  public async unloadModel(): Promise<void> {
    if (this.worker) {
      await this.postAction('UNLOAD', {});
    }
  }

  public async deleteCache(): Promise<void> {
    if (this.worker) {
      await this.postAction('DELETE_CACHE', {});
    }
  }
}

export const modelWorkerManager = new ModelWorkerManager();

// Helper para sintetizar voz local a Data URL WAV
export async function generateLocalVoice(
  text: string,
  tier: 'light' | 'medium' | 'heavy' = 'light',
  onProgress?: (p: number, msg: string) => void
): Promise<{ audioUrl: string; duration: number }> {
  const res = await modelWorkerManager.postAction(
    'GENERATE_VOICE',
    { text, tier },
    onProgress
  );

  const blob = new Blob([res.wavBuffer], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(blob);
  
  // Calcular duración aproximada desde tamaño de buffer PCM
  const samples = (res.wavBuffer.byteLength - 44) / 2;
  const duration = Math.max(1.8, samples / 24000);

  return { audioUrl, duration };
}

// Helper para generar guion local
export async function generateLocalScript(
  text: string,
  tier: 'light' | 'medium' | 'heavy' = 'light',
  onProgress?: (p: number, msg: string) => void
): Promise<{ title: string; scenes: any[] }> {
  return await modelWorkerManager.postAction(
    'GENERATE_SCRIPT',
    { text, tier },
    onProgress
  );
}
