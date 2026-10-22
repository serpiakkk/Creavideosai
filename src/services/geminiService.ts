import { AspectRatio, SceneItem, YouTubeMetadata, VideoProject } from '../types';

export interface ParsedScene {
  title: string;
  narrationText: string;
  visualDescription: string;
  visualPrompt: string;
  estimatedDuration: number;
  cameraMotion: string;
  keywords?: string[];
}

export interface ParseScriptResult {
  title: string;
  scenes: ParsedScene[];
  modelUsed: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  modelUsed: string;
  isFallback: boolean;
}

export interface GenerateVoiceResult {
  audioUrl: string;
  voiceName: string;
  modelUsed: string;
}

// --------------------------------------------------------------------------
// Script Chunking & Local Visual Extraction (Requisitos 9 y 10)
// --------------------------------------------------------------------------

export interface ScriptBlock {
  blockIndex: number;
  headerTitle: string;
  localVisualDescription?: string;
  rawContent: string;
}

export function splitScriptIntoBlocks(rawScript: string): ScriptBlock[] {
  const lines = rawScript.split('\n');
  const blocks: ScriptBlock[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let currentVisualDesc = '';

  const flushBlock = () => {
    if (currentLines.length === 0 && !currentTitle) return;
    const content = currentLines.join('\n').trim();
    if (content || currentTitle) {
      blocks.push({
        blockIndex: blocks.length,
        headerTitle: currentTitle || `Escena ${blocks.length + 1}`,
        localVisualDescription: currentVisualDesc,
        rawContent: content,
      });
    }
    currentLines = [];
    currentVisualDesc = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader =
      /^##\s+/i.test(trimmed) ||
      /^ESCENA\s+\d+/i.test(trimmed) ||
      /^NÚMERO\s+\d+/i.test(trimmed) ||
      /^NUMERO\s+\d+/i.test(trimmed) ||
      /^\d+[\.\)]\s+[A-ZÁÉÍÓÚ]/i.test(trimmed);

    if (isHeader) {
      flushBlock();
      currentTitle = trimmed.replace(/^##\s*/, '').trim();
    } else if (/^(IMAGEN|IMÁGEN|VISUAL):\s*/i.test(trimmed)) {
      // Requisito 10: Las líneas "IMAGEN:" se extraen localmente en el cliente como visualDescription; nunca deben entrar en narrationText.
      const extracted = trimmed.replace(/^(IMAGEN|IMÁGEN|VISUAL):\s*/i, '').trim();
      currentVisualDesc = currentVisualDesc ? `${currentVisualDesc}. ${extracted}` : extracted;
    } else {
      currentLines.push(line);
    }
  }
  flushBlock();

  // If no structured headers were detected, split into paragraphs
  if (blocks.length <= 1 && rawScript.length > 250) {
    const paragraphs = rawScript.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length > 1) {
      return paragraphs.map((para, idx) => {
        const paraLines = para.split('\n');
        let visDesc = '';
        const cleanLines: string[] = [];
        for (const pl of paraLines) {
          const pt = pl.trim();
          if (/^(IMAGEN|IMÁGEN|VISUAL):\s*/i.test(pt)) {
            visDesc = pt.replace(/^(IMAGEN|IMÁGEN|VISUAL):\s*/i, '').trim();
          } else {
            cleanLines.push(pl);
          }
        }
        return {
          blockIndex: idx,
          headerTitle: `Escena ${idx + 1}`,
          localVisualDescription: visDesc,
          rawContent: cleanLines.join('\n').trim(),
        };
      });
    }
  }

  return blocks.length > 0 ? blocks : [{
    blockIndex: 0,
    headerTitle: 'Escena 1',
    localVisualDescription: '',
    rawContent: rawScript.trim(),
  }];
}

// Helper según Requisito 33: quita solo líneas "IMAGEN:", encabezados markdown y acotaciones actorales; no borra paréntesis con datos
export function cleanNarration(text: string): string {
  return (text || '')
    .replace(/^(?:IMAGEN|IMÁGEN|VISUAL):.*$/gim, '')
    .replace(/#{1,6}\s.*$/gm, '')
    .replace(/\((?:suspiro|suspirando|risa|risas|riendo|pausa|silencio|tose|tos|gasp|bostezo|llanto|aplausos|música|tono\s+[^)]*|acotaci[oó]n[^)]*)\)/gi, '')
    .replace(/\[(?:suspiro|risa|pausa|silencio|tose|gasp|bostezo|música|efecto).*?\]/gi, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 1. Parse Script en bloques (Requisitos 9, 21, 23, 28)
export async function parseScriptWithGemini(
  script: string,
  visualStyle: string,
  maxScenes?: number,
  modelId?: string
): Promise<ParseScriptResult & { characterDescription?: string }> {
  const blocks = splitScriptIntoBlocks(script);

  // If in testMode with maxScenes, restrict blocks
  const targetBlocks = maxScenes ? blocks.slice(0, maxScenes) : blocks;

  // Group into chunks of 3 to 4 blocks per call (Requisito 9)
  const CHUNK_SIZE = 4;
  const chunkedBlocks: ScriptBlock[][] = [];
  for (let i = 0; i < targetBlocks.length; i += CHUNK_SIZE) {
    chunkedBlocks.push(targetBlocks.slice(i, i + CHUNK_SIZE));
  }

  const allScenes: ParsedScene[] = [];
  let suggestedTitle = '';
  let modelUsed = modelId || 'gemini-3.1-flash-lite';
  let characterDescription: string | undefined = undefined;

  for (let chunkIdx = 0; chunkIdx < chunkedBlocks.length; chunkIdx++) {
    const chunk = chunkedBlocks[chunkIdx];
    // If it's a single block with short rawContent (e.g. an idea/topic), send raw script directly
    const chunkScript = (chunk.length === 1 && chunk[0].rawContent.length < 150)
      ? script
      : chunk
          .map((b) => `## ${b.headerTitle}\n${b.localVisualDescription ? `IMAGEN: ${b.localVisualDescription}\n` : ''}${b.rawContent}`)
          .join('\n\n');

    let chunkSuccess = false;
    let attempts = 0;

    while (!chunkSuccess && attempts < 2) {
      attempts++;
      try {
        // Requisito 28: pasa characterDescription guardada y maxOutputTokens
        const fetchRes: Response = await fetch('/api/script/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: chunkScript,
            visualStyle,
            maxOutputTokens: 8192,
            characterDescription,
            modelId,
          }),
        });

        const data: any = await fetchRes.json();
        if (!fetchRes.ok) {
          throw new Error(data.error || `Error al procesar bloque ${chunkIdx + 1}`);
        }

        if (data.title && !suggestedTitle) {
          suggestedTitle = data.title;
        }

        // Requisito 28: guardar characterDescription del primer bloque para los siguientes
        if (data.characterDescription && !characterDescription) {
          characterDescription = data.characterDescription;
        }

        const chunkScenes: ParsedScene[] = (data.scenes || []).map((sc: any, idx: number) => {
          // Requisito 28: Empareja escenas con bloques por título, no por posición
          const cleanTitle = (sc.title || '').trim().toLowerCase();
          const correspondingBlock =
            chunk.find((b) => b.headerTitle.trim().toLowerCase() === cleanTitle) ||
            chunk.find((b) => cleanTitle.includes(b.headerTitle.trim().toLowerCase()) || b.headerTitle.trim().toLowerCase().includes(cleanTitle)) ||
            chunk[idx] ||
            chunk[chunk.length - 1];

          // Ensure visualDescription incorporates local extraction if present
          const finalVisualDesc = correspondingBlock?.localVisualDescription || sc.visualDescription || sc.title;
          const cleanedNarr = cleanNarration(sc.narrationText || '');

          return {
            title: sc.title || correspondingBlock?.headerTitle || `Escena ${allScenes.length + idx + 1}`,
            narrationText: cleanedNarr,
            visualDescription: finalVisualDesc,
            visualPrompt: sc.visualPrompt || `${visualStyle}: ${finalVisualDesc}`,
            estimatedDuration: sc.estimatedDuration || Math.max(3.0, (cleanedNarr.split(/\s+/).length / 2.3)),
            cameraMotion: sc.cameraMotion || 'zoom_in',
            keywords: sc.keywords || [],
          };
        });

        allScenes.push(...chunkScenes);
        modelUsed = data.modelUsed || modelUsed;
        chunkSuccess = true;
      } catch (err: any) {
        console.warn(`Intento ${attempts} falló en bloque ${chunkIdx + 1}:`, err?.message);
        if (attempts >= 2) {
          // Fallback local solo para este bloque, sin perder los demás
          console.warn(`Usando estructuración local para el bloque ${chunkIdx + 1}`);
          const fallbackScenes: ParsedScene[] = chunk.map((b) => {
            const narr = cleanNarration(b.rawContent);
            return {
              title: b.headerTitle,
              narrationText: narr,
              visualDescription: b.localVisualDescription || b.headerTitle,
              visualPrompt: `${visualStyle}: ${b.localVisualDescription || b.headerTitle}`,
              estimatedDuration: Math.max(3.0, (narr.split(/\s+/).length / 2.3)),
              cameraMotion: 'zoom_in',
              keywords: ['resumen', 'clave'],
            };
          });
          allScenes.push(...fallbackScenes);
          chunkSuccess = true;
        } else {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  return {
    title: suggestedTitle || (blocks[0]?.headerTitle || 'Nuevo Video'),
    scenes: allScenes.length > 0 ? allScenes : [
      {
        title: 'Escena 1',
        narrationText: cleanNarration(script),
        visualDescription: 'Ilustración explicativa de la escena',
        visualPrompt: `${visualStyle}: Ilustración explicativa`,
        estimatedDuration: 4.5,
        cameraMotion: 'zoom_in',
        keywords: ['video'],
      },
    ],
    modelUsed,
    characterDescription,
  };
}


// 1.1 Enhance Script with Gemini
export async function enhanceScriptWithGemini(
  script: string,
  tone?: string
): Promise<{ title: string; enhancedScript: string }> {
  const response = await fetch('/api/script/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, tone }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al optimizar el guion con Gemini.');
  }

  return {
    title: data.title,
    enhancedScript: data.enhancedScript,
  };
}

// 2. Generate Image (Requisito 5: lee isFallback)
export async function generateImageWithGemini(
  prompt: string,
  aspectRatio: AspectRatio,
  sceneContext?: { title?: string; narrationText?: string; keywords?: string[] },
  modelId?: string
): Promise<GenerateImageResult> {
  const response = await fetch('/api/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      aspectRatio,
      title: sceneContext?.title,
      narrationText: sceneContext?.narrationText,
      keywords: sceneContext?.keywords,
      modelId,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data.error || 'Error al generar la imagen con Gemini.');
    error.isQuotaError = data.isQuotaError || response.status === 429;
    throw error;
  }

  return {
    imageUrl: data.imageUrl,
    modelUsed: data.modelUsed,
    isFallback: Boolean(data.isFallback),
  };
}

// 3. Generate Voice (TTS) - Requisito 1: falla limpiamente ante cuota sin falso zumbido
export async function generateVoiceWithGemini(
  text: string,
  voiceName: string = 'Kore',
  speed: number = 1.1,
  tone: string = 'informativo',
  modelId?: string
): Promise<GenerateVoiceResult> {
  const response = await fetch('/api/voice/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voiceName, speed, tone, modelId }),
  });

  const data = await response.json();
  if (!response.ok) {
    const error: any = new Error(data.error || 'Error al sintetizar voz con Gemini TTS.');
    error.isQuotaError = data.isQuotaError || response.status === 429;
    throw error;
  }

  return {
    audioUrl: data.audioUrl,
    voiceName: data.voiceName,
    modelUsed: data.modelUsed,
  };
}

// Requisito 4: Muestra de voz en memoria para no gastar cuota cada vez
const voiceSampleCache = new Map<string, string>();

export async function getVoiceSample(
  voiceName: string,
  sampleText: string = 'Hola, esta es una muestra de mi voz generada por Gemini.'
): Promise<string> {
  if (voiceSampleCache.has(voiceName)) {
    return voiceSampleCache.get(voiceName)!;
  }
  const result = await generateVoiceWithGemini(sampleText, voiceName, 1.0, 'informativo');
  voiceSampleCache.set(voiceName, result.audioUrl);
  return result.audioUrl;
}

// 4. Generate YouTube Metadata
export async function generateYouTubeMetadata(
  script: string,
  title?: string
): Promise<YouTubeMetadata> {
  const response = await fetch('/api/youtube/metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, title }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al generar metadatos de YouTube.');
  }

  return data.metadata;
}

export interface ChatCommandResult {
  success: boolean;
  understood: boolean;
  actionType:
    | 'start_generation'
    | 'create_script'
    | 'conversation'
    | 'edit_scene'
    | 'change_voice'
    | 'change_aspect_ratio'
    | 'change_style'
    | 'change_music'
    | 'regenerate_image'
    | 'regenerate_voice'
    | 'ask_scene_correction'
    | 'unknown';
  parameters?: {
    voiceName?: string;
    aspectRatio?: AspectRatio;
    visualStyle?: string;
    presetType?: string;
    sceneIndex?: number;
    newNarrationText?: string;
    customPrompt?: string;
    question?: string;
    testMode?: boolean;
    title?: string;
    autoStart?: boolean;
    scenes?: any[];
  };
  replyMessage: string;
}

export async function sendChatCommand(
  userMessage: string,
  currentProject: VideoProject
): Promise<ChatCommandResult> {
  // Requisito 25: manda solo título, número de escenas, voz, formato y música, no el proyecto completo con imágenes y audios
  const compactProject = {
    title: currentProject.title,
    scenesCount: currentProject.scenes?.length || 0,
    voiceName: currentProject.voiceName,
    aspectRatio: currentProject.aspectRatio,
    music: {
      presetType: currentProject.music?.presetType,
      type: currentProject.music?.type,
      volume: currentProject.music?.volume,
    },
    // Memoria contextual: ultimos 10 mensajes y resumen de texto de escenas sin imagenes ni audios
    chatHistory: (currentProject.chatHistory || []).slice(-10).map((m) => ({
      sender: m.sender,
      text: m.text,
    })),
    scenesSummary: (currentProject.scenes || []).map((s) => ({
      order: s.order,
      title: s.title,
      narration: s.narrationText ? s.narrationText.slice(0, 150) : '',
    })),
  };

  const response = await fetch('/api/chat/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userMessage, currentProject: compactProject }),
  });

  const data = await response.json();
  return data;
}

// Requisito 3: La duración de cada escena debe salir del AudioBuffer ya decodificado (buffer.duration)
let sharedAudioCtx: AudioContext | null = null;
function getSharedAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return sharedAudioCtx;
}

export async function decodeAudioBuffer(audioUrlOrArrayBuffer: string | ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }
  let arrayBuffer: ArrayBuffer;
  if (typeof audioUrlOrArrayBuffer === 'string') {
    const res = await fetch(audioUrlOrArrayBuffer);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = audioUrlOrArrayBuffer;
  }
  return await ctx.decodeAudioData(arrayBuffer);
}

export async function getAudioDuration(audioUrl: string): Promise<number> {
  const buffer = await decodeAudioBuffer(audioUrl);
  return buffer.duration;
}
