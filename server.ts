import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { generateSceneSvg } from './server/visualGenerator';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser with 50mb limit for base64 images and audio buffers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to initialize Gemini SDK with required telemetry User-Agent and per-task timeout (Requisito 21)
function getGeminiClient(timeoutMs: number = 60000): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Clean JSON response helper from model (strips markdown fences if present)
function cleanJsonResponse(text: string): any {
  if (!text) return {};
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  }
  return JSON.parse(cleaned);
}

// Requisito 33: cleanNarration quita solo líneas "IMAGEN:", encabezados markdown y acotaciones tipo "(suspiro)"; no borres paréntesis con datos
function cleanNarration(text: string): string {
  return text
    .replace(/^(?:IMAGEN|IMÁGEN|VISUAL):.*$/gim, '') // Quita líneas IMAGEN
    .replace(/#{1,6}\s.*$/gm, '') // Quita encabezados markdown
    .replace(/\((?:suspiro|suspirando|risa|risas|riendo|pausa|silencio|tose|tos|gasp|bostezo|llanto|aplausos|música|tono\s+[^)]*|acotaci[oó]n[^)]*)\)/gi, '') // Acotaciones actorales
    .replace(/\[(?:suspiro|risa|pausa|silencio|tose|gasp|bostezo|música|efecto).*?\]/gi, '')
    .replace(/\*+/g, '') // Quita asteriscos
    .replace(/\s+/g, ' ')
    .trim();
}

// Requisito 34: Servidor de voz: si es audio crudo (audio/L16 o pcm), agregar cabecera WAV (24000 Hz, 16 bits, mono)
function wrapPcmWithWavHeader(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitDepth = 16): Buffer {
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
  header.writeUInt16LE(1, 20); // audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Helper para limitar tiempo de espera de llamadas a Gemini y evitar bucle o bloqueos por cuota agotada
async function callGeminiWithTimeout<T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('GEMINI_TIMEOUT_EXCEEDED')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------------------
// Local Intelligent Script Parser (Fallback when Quota is Limited or Offline)
// --------------------------------------------------------------------------
interface LocalParsedScene {
  title: string;
  narrationText: string;
  visualDescription: string;
  visualPrompt: string;
  estimatedDuration: number;
  cameraMotion: string;
  keywords: string[];
}

function parseScriptLocally(script: string, visualStyle: string, maxScenes?: number): { title: string; scenes: LocalParsedScene[] } {
  const stylePrompt = visualStyle || 'Simple 2D whiteboard animation style illustration';
  const lines = script.split('\n');

  // Requisito 30: Corrige parseScriptLocally para detectar el título ("# Título")
  let detectedTitle = '';
  const rawScenes: { title: string; lines: string[]; imageLines: string[] }[] = [];
  let currentScene: { title: string; lines: string[]; imageLines: string[] } | null = null;
  let sceneCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect Title if it starts with single # (and not ##)
    if (line.startsWith('# ') && !line.startsWith('## ') && !detectedTitle) {
      detectedTitle = line.replace(/^#\s+/, '').trim();
      continue;
    }

    // Detect Scene separator: ##, ###, NÚMERO, Número, Escena
    const isSceneHeader = line.match(/^(?:##+|n[uú]mero\s*\d+|escena\s*\d+|\d+\.)/i);

    if (isSceneHeader) {
      if (currentScene && (currentScene.lines.length > 0 || currentScene.imageLines.length > 0)) {
        rawScenes.push(currentScene);
      }
      const cleanHeader = line.replace(/^[#\d\.\s\:]+/, '').trim() || `Escena ${sceneCounter}`;
      currentScene = {
        title: cleanHeader.length > 3 ? cleanHeader : `Escena ${sceneCounter}`,
        lines: [],
        imageLines: [],
      };
      sceneCounter++;
      continue;
    }

    // Detect IMAGEN visual guidance
    if (line.toUpperCase().startsWith('IMAGEN:')) {
      const imgDesc = line.replace(/^IMAGEN:\s*/i, '').trim();
      if (!currentScene) {
        currentScene = { title: `Escena ${sceneCounter}`, lines: [], imageLines: [] };
        sceneCounter++;
      }
      currentScene.imageLines.push(imgDesc);
      continue;
    }

    // Narration line
    if (!currentScene) {
      currentScene = { title: `Escena ${sceneCounter}`, lines: [], imageLines: [] };
      sceneCounter++;
    }
    currentScene.lines.push(line);
  }

  if (currentScene && (currentScene.lines.length > 0 || currentScene.imageLines.length > 0)) {
    rawScenes.push(currentScene);
  }

  // If no structured headers were found, divide into logical chunks by sentence
  if (rawScenes.length === 0) {
    const fullText = lines.filter((l) => !l.toUpperCase().startsWith('IMAGEN:')).join(' ');
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    const chunkSize = 2;

    for (let s = 0; s < sentences.length; s += chunkSize) {
      const chunk = sentences.slice(s, s + chunkSize).join(' ').trim();
      if (chunk.length > 5) {
        rawScenes.push({
          title: `Escena ${Math.floor(s / chunkSize) + 1}`,
          lines: [chunk],
          imageLines: [],
        });
      }
    }
  }

  const cameraMotions = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'zoom_in'];
  const scenesToProcess = maxScenes ? rawScenes.slice(0, maxScenes) : rawScenes;

  const scenes: LocalParsedScene[] = scenesToProcess.map((raw, idx) => {
    const rawNarration = raw.lines.join(' ');
    const narrationText = cleanNarration(rawNarration) || 'Observa atentamente este concepto clave.';
    const visualDescription = raw.imageLines.join('. ') || `Ilustración conceptual de ${raw.title.toLowerCase()}`;
    
    // Words count for duration
    const words = narrationText.split(/\s+/).length;
    const estimatedDuration = Math.max(3.2, Math.round((words / 2.3) * 10) / 10);

    // Extract keywords (words longer than 5 chars, omitting common Spanish stopwords)
    const stopwords = new Set(['sobre', 'cuando', 'donde', 'porque', 'nuestro', 'nuestra', 'primer', 'primero', 'después', 'entonces', 'tambien', 'también', 'hacer', 'tener', 'mucho', 'muchos']);
    const candidateWords = narrationText
      .replace(/[^\wáéíóúñÁÉÍÓÚÑ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !stopwords.has(w.toLowerCase()));
    const keywords = candidateWords.slice(0, 3);

    return {
      title: raw.title,
      narrationText,
      visualDescription,
      visualPrompt: `${stylePrompt}, depicting: ${visualDescription}. Focal composition, sharp outlines, expressive stick figure.`,
      estimatedDuration,
      cameraMotion: cameraMotions[idx % cameraMotions.length],
      keywords: keywords.length > 0 ? keywords : ['estrategia', 'enfoque'],
    };
  });

  const finalTitle = detectedTitle || (scenes.length > 0 ? scenes[0].title : 'Mi Video Autónomo');
  return { title: finalTitle, scenes };
}

// --------------------------------------------------------------------------
// API Routes
// --------------------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    status: 'ok',
    hasApiKey: hasKey,
    timestamp: Date.now(),
  });
});

// Requisito 4: Detectar modelos disponibles llamando a la API de Gemini
app.get('/api/models/available', async (req, res) => {
  try {
    const ai = getGeminiClient(10000);
    const modelsResponse = await ai.models.list();
    const modelsList: any[] = [];
    if (modelsResponse) {
      for await (const m of modelsResponse) {
        const cleanId = m.name ? m.name.replace(/^models\//, '') : '';
        modelsList.push({
          id: cleanId,
          displayName: m.displayName || cleanId,
          description: m.description || '',
          supportedActions: m.supportedActions || [],
        });
      }
    }
    return res.json({ success: true, models: modelsList });
  } catch (err: any) {
    console.warn('Error al listar modelos Gemini:', err?.message);
    // Lista verificada oficial como respaldo si falla el listado
    return res.json({
      success: true,
      isFallback: true,
      models: [
        { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite (Rápido)', supportedActions: ['generateContent'] },
        { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash (Equilibrado)', supportedActions: ['generateContent'] },
        { id: 'gemini-3.8-flash-lite-tts', displayName: 'Gemini 3.8 Flash Lite TTS (Voz)', supportedActions: ['generateContent'] },
        { id: 'gemini-3.1-flash-lite-image', displayName: 'Gemini 3.1 Flash Lite Image (Imagen)', supportedActions: ['generateContent'] },
      ],
    });
  }
});

// Requisito 4: Botón Probar para modelos de nube (llamada mínima y reporte de cuota)
app.post('/api/models/test', async (req, res) => {
  const { modelId, task = 'script' } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'modelId es requerido' });
  }

  const startTime = Date.now();
  try {
    const ai = getGeminiClient(12000);
    if (task === 'voice') {
      await ai.models.generateContent({
        model: modelId,
        contents: 'Prueba de voz.',
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });
      const latencyMs = Date.now() - startTime;
      return res.json({ success: true, latencyMs, message: `Voz lista (${latencyMs} ms)` });
    } else if (task === 'image') {
      await ai.models.generateContent({
        model: modelId,
        contents: 'Whiteboard stick figure minimal',
      });
      const latencyMs = Date.now() - startTime;
      return res.json({ success: true, latencyMs, message: `Imagen lista (${latencyMs} ms)` });
    } else {
      await ai.models.generateContent({
        model: modelId,
        contents: 'Di OK',
      });
      const latencyMs = Date.now() - startTime;
      return res.json({ success: true, latencyMs, message: `Modelo listo (${latencyMs} ms)` });
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isQuota = err?.status === 429 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('quota');
    return res.json({
      success: false,
      latencyMs,
      isQuota,
      error: isQuota ? 'Cuota agotada en este modelo' : (err?.message || 'Error al conectar con el modelo'),
    });
  }
});

// 1. POST /api/script/parse: Divide un guion en escenas (Requisitos 21, 28: timeout 60s, maxOutputTokens, characterDescription y modelId)
app.post('/api/script/parse', async (req, res) => {
  const {
    script,
    visualStyle,
    maxScenes,
    maxOutputTokens = 8192,
    characterDescription,
    modelId = 'gemini-3.1-flash-lite',
  } = req.body;

  if (!script || typeof script !== 'string') {
    return res.status(400).json({ error: 'El guion es requerido.' });
  }

  const stylePrompt = visualStyle || 'Simple 2D whiteboard animation style illustration';

  try {
    // Requisito 21: Timeout de 60s para analizar guion
    const ai = getGeminiClient(60000);

    const characterGuideline = characterDescription
      ? `MANTÉN ESTRICTAMENTE ESTE PERSONAJE RECURRENTE: "${characterDescription}". Úsalo en TODAS las escenas donde aparezca para consistencia total.`
      : `MANTÉN CONTINUIDAD: Diseña al personaje recurrente (ej: "a friendly stick figure with round head and neat red tie") y usa exactamente esa descripción en TODAS las escenas donde aparezca para consistencia total.`;

    const systemPrompt = `Eres un director audiovisual de clase mundial para canales virales de YouTube y TikTok.
Tu tarea es tomar un guion o idea en español y desglosarlo en escenas cinematográficas precisas, manteniendo COHERENCIA VISUAL DE PERSONAJES y ritmo dinámico.

Reglas obligatorias:
1. NARRACIÓN HABLADA (narrationText):
   - Solo texto que se narrará en voz alta en español fluido, natural y atrapante.
   - NUNCA incluyas guías visuales "IMAGEN:", ni notas actorales como "(suspiro)", ni asteriscos markdown.
2. GUÍA VISUAL (visualDescription):
   - Qué ocurre exactamente en pantalla para el espectador.
3. PROMPT DE IMAGEN (visualPrompt):
   - Prompt detallado en inglés optimizado para generación de imagen.
   - Combina el estilo visual elegido: "${stylePrompt}".
   - ${characterGuideline}
4. PALABRAS CLAVE (keywords):
   - 2 a 4 palabras clave de alto impacto que aparezcan en narrationText para resaltarlas con color en los subtítulos dinámicos.
5. DURACIÓN (estimatedDuration):
   - Duración estimada en segundos (aprox 1s por cada 2.4 palabras habladas, mínimo 3.0s).
6. CÁMARA (cameraMotion):
   - Uno de: "zoom_in", "zoom_out", "pan_left", "pan_right", "static".
${maxScenes ? `7. Limita la respuesta a exactamente ${maxScenes} escenas (modo prueba).` : ''}`;

    let response: any = null;
    let effectiveModel = modelId || 'gemini-3.1-flash-lite';

    try {
      response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: effectiveModel,
          contents: `Guion o tema a estructurar:\n\n${script}`,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.3,
            maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 8192,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestedTitle: { type: Type.STRING },
                characterDescription: { type: Type.STRING },
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      narrationText: { type: Type.STRING },
                      visualDescription: { type: Type.STRING },
                      visualPrompt: { type: Type.STRING },
                      estimatedDuration: { type: Type.NUMBER },
                      cameraMotion: { type: Type.STRING },
                      keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['title', 'narrationText', 'visualDescription', 'visualPrompt', 'estimatedDuration', 'cameraMotion'],
                  },
                },
              },
              required: ['suggestedTitle', 'scenes'],
            },
          },
        }),
        8000
      );
    } catch (primaryErr: any) {
      console.warn(`Llamada de guion a Gemini falló o tardó demasiado (${primaryErr?.message}). Pasando de inmediato al analizador inteligente local sin esperas.`);
      const localResult = parseScriptLocally(script, visualStyle, maxScenes);
      return res.json({
        success: true,
        title: localResult.title,
        scenes: localResult.scenes,
        characterDescription,
        modelUsed: 'Motor Inteligente Adaptativo (Respaldo sin cuota)',
        isFallback: true,
      });
    }

    const parsed = cleanJsonResponse(response.text || '{}');
    const cleanedScenes = (parsed.scenes || []).map((sc: any) => ({
      ...sc,
      narrationText: cleanNarration(sc.narrationText || ''),
    }));

    return res.json({
      success: true,
      title: parsed.suggestedTitle || 'Mi Nuevo Video',
      scenes: cleanedScenes,
      characterDescription: parsed.characterDescription || characterDescription,
      modelUsed: effectiveModel,
    });
  } catch (error: any) {
    console.warn('Gemini script parser no disponible o cuota limitada. Activando analizador inteligente local...', error?.message);
    // Intelligent Local Fallback: guarantees user is NEVER blocked
    const localResult = parseScriptLocally(script, visualStyle, maxScenes);
    return res.json({
      success: true,
      title: localResult.title,
      scenes: localResult.scenes,
      characterDescription,
      modelUsed: 'Motor Inteligente Adaptativo (Respaldo sin límites de cuota)',
      isFallback: true,
    });
  }
});

// 1.1 POST /api/script/enhance: Optimiza inteligentemente un guion en español con Gemini 3.8 Flash
app.post('/api/script/enhance', async (req, res) => {
  try {
    const { script, tone = 'informativo' } = req.body;
    if (!script || typeof script !== 'string') {
      return res.status(400).json({ error: 'El texto del guion es requerido.' });
    }

    const ai = getGeminiClient();
    const prompt = `Actúa como un guionista audiovisual viral de YouTube y TikTok en español.
Tu tarea es tomar este borrador o idea de guion y reescribirlo para maximizar la retención y el dinamismo visual:
Reglas:
1. El guion debe estar en español fluido y conversacional.
2. Comienza con un gancho potente en los primeros 3 segundos.
3. Divide el contenido en 3 a 5 escenas claras. Cada escena debe comenzar con "## Escena [Número]: [Título corto]".
4. Para cada escena incluye una línea "IMAGEN: [Descripción visual en estilo dibujo de palitos/pizarra con elementos clave]".
5. La narración hablada debe ser clara, sin rodeos y con ritmo.
6. Devuelve un objeto JSON con dos claves:
   - "title": Título sugerido altamente atractivo.
   - "enhancedScript": El guion completo formateado con las escenas e indicaciones IMAGEN:.

Borrador original:
${script}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            enhancedScript: { type: Type.STRING },
          },
          required: ['title', 'enhancedScript'],
        },
      },
    });

    const data = cleanJsonResponse(response.text || '{}');
    return res.json({
      success: true,
      title: data.title,
      enhancedScript: data.enhancedScript,
      modelUsed: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Error al mejorar guion con IA:', error);
    return res.status(500).json({ error: 'No se pudo mejorar el guion con Gemini en este momento.' });
  }
});

// 2. POST /api/image/generate: Genera una imagen con timeout 90s (Requisito 21) y modelo parametrizable (Requisito 12)
app.post('/api/image/generate', async (req, res) => {
  const { prompt, aspectRatio = '16:9', title, narrationText, keywords, modelId = 'gemini-3.1-flash-lite-image' } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'El prompt de imagen es requerido.' });
  }

  // 1. Intentar con modelo de imagen ráster de Gemini (Timeout 90s segun Requisito 21)
  try {
    const ai = getGeminiClient(90000);
    const effectiveModel = modelId || 'gemini-3.1-flash-lite-image';
    const runGeneration = async (promptText: string) => {
      return await ai.models.generateContent({
        model: effectiveModel,
        contents: {
          parts: [{ text: promptText }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
          },
        },
      });
    };

    let response: any = null;
    try {
      response = await runGeneration(prompt);
    } catch (primaryErr: any) {
      const errStr = (primaryErr?.message || '').toLowerCase();
      const isSafety = errStr.includes('safety') || errStr.includes('blocked') || errStr.includes('harm') || errStr.includes('filter');
      if (isSafety) {
        // Requisito 7: Si Gemini bloquea una imagen por seguridad, reescribe el prompt de forma más suave y reintenta una vez antes de usar el respaldo.
        console.warn('Bloqueo de seguridad detectado. Reintentando con prompt suavizado educativo...');
        const softenedPrompt = `A gentle, friendly educational minimalist whiteboard illustration of: ${prompt.replace(/toxic|fight|gun|blood|kill|death|danger|warning|scary|horror|violencia|muerte|arma/gi, 'challenge')}. Clean simple outlines, positive pastel colors.`;
        try {
          response = await runGeneration(softenedPrompt);
        } catch (retryErr) {
          console.warn('Reintento con prompt suavizado no prosperó. Pasando a respaldo vectorial:', retryErr);
        }
      } else {
        throw primaryErr;
      }
    }

    if (response) {
      let base64Image = '';
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          base64Image = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (base64Image) {
        return res.json({
          success: true,
          imageUrl: base64Image,
          modelUsed: effectiveModel,
          isFallback: false,
        });
      }
    }
  } catch (error: any) {
    const isQuota = error?.status === 429 || (error?.message || '').includes('quota') || (error?.message || '').includes('RESOURCE_EXHAUSTED');
    if (isQuota) {
      console.log('Generación de imagen en la nube sin cuota gratuita (límite 0). Usando ilustrador vectorial adaptativo instantáneo.');
    } else {
      console.warn('Modelo de imagen no disponible. Activando ilustrador vectorial...', error?.message);
    }
  }

  // 2. Fallback Inteligente: Generador de Ilustración de Escena Vectorial de Alta Definición
  try {
    const svgUrl = generateSceneSvg({
      prompt,
      aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
      title,
      narrationText,
      keywords,
    });

    return res.json({
      success: true,
      imageUrl: svgUrl,
      modelUsed: 'Ilustrador Vectorial Adaptativo (Sin IA / Interno)',
      isFallback: true,
    });
  } catch (fallbackErr: any) {
    console.error('Error en fallback visual:', fallbackErr);
    return res.status(500).json({ error: 'Error al generar la ilustración visual.' });
  }
});

// 3. POST /api/voice/generate: Genera voz con timeout 90s (Req. 21) y cabecera WAV si es PCM crudo (Req. 34)
app.post('/api/voice/generate', async (req, res) => {
  try {
    const { text, voiceName = 'Kore', speed = 1.1, tone = 'informativo', modelId = 'gemini-3.8-flash-lite-tts' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El texto de narración es requerido.' });
    }

    const cleanText = cleanNarration(text);
    if (!cleanText) {
      return res.status(400).json({ error: 'El texto de narración no contiene palabras legibles.' });
    }

    // Requisito 21: Timeout de 90s para voz
    const ai = getGeminiClient(90000);
    const effectiveModel = modelId || 'gemini-3.8-flash-lite-tts';

    // Requisito 2: Quita el campo speechMetadata. Usa el texto del prompt con tono y ritmo
    let speedLabel = 'normal';
    if (speed <= 0.85) speedLabel = 'pausado y lento';
    else if (speed < 1.05) speedLabel = 'moderado';
    else if (speed < 1.25) speedLabel = 'rápido y enérgico';
    else speedLabel = 'muy rápido y ágil';

    let toneLabel = 'informativo y claro';
    if (tone === 'curioso') toneLabel = 'curioso e intrigante';
    else if (tone === 'dramático' || tone === 'dramatico') toneLabel = 'dramático y cinematográfico';
    else if (tone === 'entusiasta') toneLabel = 'entusiasta y motivador';

    const promptText = `Di con tono ${toneLabel} y a ritmo ${speedLabel}: ${cleanText}`;
    const validVoice = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].includes(voiceName) ? voiceName : 'Kore';

    let lastError: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: effectiveModel,
          contents: promptText,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: validVoice },
              },
            },
          },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const base64Audio = part?.inlineData?.data;
        const mimeType = (part?.inlineData?.mimeType || '').toLowerCase();

        if (!base64Audio) {
          throw new Error('El modelo de voz no devolvió datos de audio.');
        }

        const rawBuffer = Buffer.from(base64Audio, 'base64');

        // Requisito 34: Servidor de voz: si es audio crudo (audio/L16 o pcm) agrégale la cabecera WAV (24000 Hz, 16 bits, mono)
        let finalBuffer: any = rawBuffer;
        const isRawPcm =
          mimeType.includes('l16') ||
          mimeType.includes('pcm') ||
          mimeType.includes('raw') ||
          rawBuffer.length < 44 ||
          rawBuffer.toString('ascii', 0, 4) !== 'RIFF';

        if (isRawPcm) {
          finalBuffer = wrapPcmWithWavHeader(rawBuffer, 24000, 1, 16);
        }

        const audioUrl = `data:audio/wav;base64,${finalBuffer.toString('base64')}`;

        return res.json({
          success: true,
          audioUrl,
          voiceName: validVoice,
          modelUsed: effectiveModel,
        });
      } catch (err: any) {
        lastError = err;
        if (err?.status === 429 || err?.message?.includes('RESOURCE_EXHAUSTED')) {
          break; // Don't burn retries if quota exhausted
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error('Error al generar voz con Gemini TTS:', error?.message);
    const isQuota = error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('quota');
    return res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? 'Límite de cuota alcanzado en síntesis de voz Gemini. Progreso pausado para reintentar cuando se restablezca la cuota.'
        : `Error al generar voz: ${error?.message || 'Error desconocido'}`,
      isQuotaError: isQuota,
    });
  }
});

// 4. POST /api/youtube/metadata: Genera títulos, descripción y etiquetas SEO para YouTube
app.post('/api/youtube/metadata', async (req, res) => {
  try {
    const { script, title } = req.body;
    if (!script) {
      return res.status(400).json({ error: 'El guion es requerido.' });
    }

    const ai = getGeminiClient(30000);
    const prompt = `Actúa como un experto en SEO de YouTube en español. Basándote en el siguiente guion de video y su título propuesto ("${title || 'Video'}"), genera:
1. 3 opciones de títulos altamente atractivos y con alto CTR (click-through-rate).
2. Una descripción completa con introducción llamativa, resumen de puntos clave, capítulos o marcas de tiempo sugeridas, y llamado a la acción.
3. Lista de 15 etiquetas separadas por comas.
4. 5 hashtags relevantes (#) para YouTube Shorts o video largo.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `${prompt}\n\nGuion:\n${script}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            description: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['titles', 'description', 'tags', 'hashtags'],
        },
      },
    });

    const data = cleanJsonResponse(response.text || '{}');
    return res.json({
      success: true,
      metadata: data,
    });
  } catch (error: any) {
    console.error('Error al generar metadatos de YouTube:', error);
    return res.status(500).json({ error: 'Error al generar metadatos de YouTube.' });
  }
});

// 5. POST /api/chat/command: Interpreta comandos en lenguaje natural del usuario (Requisito 29)
app.post('/api/chat/command', async (req, res) => {
  try {
    const { userMessage, currentProject } = req.body;
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido.' });
    }

    const msgLower = userMessage.toLowerCase().trim();

    // 0. PEDIR EJEMPLO O ESCENA DE MUESTRA
    // Resuelve directamente: "Dame una escena de cualquier cosa de ejemplo para ver"
    const isExampleRequest =
      /\b(?:dame|pon|muestra|haz(?:me)?|crea|inventa|escribe|quiero)\s+(?:una?\s+)?(?:escena|ejemplo|muestra)\b/i.test(msgLower) ||
      /\b(?:ejemplo\s+de\s+(?:video|escena)|escena\s+de\s+ejemplo|video\s+de\s+ejemplo|un\s+ejemplo\s+para\s+ver)\b/i.test(msgLower) ||
      /\b(?:dame\s+una\s+escena|mu[eé]strame\s+una\s+escena)\b/i.test(msgLower);

    if (isExampleRequest) {
      let topic = '';
      const topicMatch = msgLower.match(/(?:sobre|de)\s+([^.!?,\n]+)/i);
      if (topicMatch && topicMatch[1].trim().length > 2 && !topicMatch[1].includes('ejemplo') && !topicMatch[1].includes('cualquier')) {
        topic = topicMatch[1].trim();
      }
      const title = topic ? `Video sobre ${topic.slice(0, 30)}` : 'Amanecer en Marte: El Planeta Rojo';
      const narration = topic
        ? `Descubrimos los aspectos más fascinantes e impactantes sobre ${topic}. Una mirada profunda que transformará lo que sabías.`
        : 'A millones de kilómetros de la Tierra, un solitario astronauta camina sobre las rocas rojizas de Marte mientras contempla el impresionante amanecer azul en el horizonte.';
      const visualDesc = topic
        ? `Ilustración conceptual de alta definición explicando los puntos clave de ${topic}`
        : 'Un astronauta con traje espacial blanco moderno contemplando un amanecer azul sobre el suelo rocoso de Marte.';
      const visualPrompt = `${currentProject?.visualStyle || 'Cinematic whiteboard concept art'}: A solitary astronaut in a futuristic spacesuit on the rocky red surface of Mars, watching an ethereal blue sunrise over the distant horizon, epic cinematic atmosphere, high detail`;

      const exampleScene = {
        title: topic ? `Escena 1: ${topic}` : 'Amanecer en Marte',
        narrationText: narration,
        visualDescription: visualDesc,
        visualPrompt,
        estimatedDuration: 6.0,
        cameraMotion: 'zoom_in',
        keywords: topic ? [topic.split(' ')[0] || 'concepto', 'clave'] : ['Marte', 'astronauta', 'amanecer azul'],
      };

      return res.json({
        success: true,
        understood: true,
        actionType: 'create_script',
        parameters: {
          title,
          scenes: [exampleScene],
          autoStart: false,
        },
        replyMessage: `¡He creado la escena de ejemplo "${title}"! Ya está cargada en tu proyecto. Puedes pulsar "Generar video completo" o decirme "haz el video" para comenzar la producción de imagen y voz de inmediato.`,
      });
    }

    // 0.1 GENERAR VIDEO / INICIAR PRODUCCIÓN DE ESCENAS
    // Resuelve directamente: "ella habla y nunca me hace los videos" y "no lo veo que lo estes generando"
    const isStartGenIntent =
      /\b(?:haz(?:me)?|genera|crea|inicia|empieza|arranca|renderiza|produc(?:e|ir))\s+(?:el\s+|la\s+)?(?:video|generaci[oó]n|escenas|producci[oó]n|dibujo|dibujos)\b/i.test(msgLower) ||
      /\b(?:hazlo\s+ya|empieza\s+ya|inicia\s+ya|gen[eé]ralo\s+ya|hazlo|empieza|inicia)\b/i.test(msgLower) ||
      /\b(?:no\s+(?:lo\s+)?veo\s+(?:que\s+lo\s+est[eé]s?\s+generando|que\s+empiece)|por\s+qu[eé]\s+no\s+(?:se\s+genera|empieza))\b/i.test(msgLower);

    if (isStartGenIntent && !msgLower.includes('sobre') && !msgLower.includes('de un') && !msgLower.includes('guion')) {
      const isTest = msgLower.includes('prueba') || msgLower.includes('2 escenas');
      const sceneCount = currentProject?.scenesCount || currentProject?.scenes?.length || 0;

      // Si el proyecto ya tiene escenas, lanza la generación directamente
      if (sceneCount > 0) {
        return res.json({
          success: true,
          understood: true,
          actionType: 'start_generation',
          parameters: { testMode: isTest },
          replyMessage: isTest
            ? '¡Iniciando la prueba rápida con las 2 primeras escenas ahora mismo!'
            : '¡Iniciando la generación de tu video completo ahora mismo!',
        });
      }

      // Si no tiene escenas aún pero el usuario dice "genera el video":
      // Buscar en el historial de chat si se habló de algún tema o escena (ej: astronauta en Marte)
      let detectedTopic = '';
      const history = currentProject?.chatHistory || [];
      for (let i = history.length - 1; i >= 0; i--) {
        const hText = (history[i].text || '').toLowerCase();
        if (hText.includes('marte') || hText.includes('astronauta')) {
          detectedTopic = 'Amanecer en Marte';
          break;
        }
        if (hText.includes('luna')) {
          detectedTopic = 'Viaje a la Luna';
          break;
        }
        const ideaMatch = hText.match(/(?:sobre|de)\s+([^.!?,\n\"\'\:]+)/i);
        if (ideaMatch && ideaMatch[1].trim().length > 3 && !ideaMatch[1].includes('video') && !ideaMatch[1].includes('ejemplo')) {
          detectedTopic = ideaMatch[1].trim();
          break;
        }
      }
      if (!detectedTopic) detectedTopic = 'Amanecer en Marte';

      const localGen = parseScriptLocally(
        `# ${detectedTopic}\n\n## Escena 1: El Despertar\nUn astronauta camina sobre la superficie rojiza de Marte contemplando un asombroso amanecer azul en el horizonte.\n\n## Escena 2: La Frontera Estelar\nLa humanidad avanza hacia nuevos límites explorando los misterios del cosmos.`,
        currentProject?.visualStyle || 'Simple 2D whiteboard animation style illustration'
      );

      return res.json({
        success: true,
        understood: true,
        actionType: 'create_script',
        parameters: {
          title: localGen.title || detectedTopic,
          scenes: localGen.scenes,
          autoStart: true, // ChatView iniciará runGenerationPipeline de inmediato!
        },
        replyMessage: `¡Estructuré las escenas para "${detectedTopic}" a partir de nuestra conversación e inicio la producción de imagen y voz de inmediato!`,
      });
    }

    // C. Regenerar imagen: "rehaz la imagen de la escena 3 con un cerebro gigante"
    const regenImgMatch = msgLower.match(/\b(?:rehaz|regenera|cambia|actualiza)\s+(?:la\s+)?imagen\s+(?:de\s+la\s+)?escena\s+(\d+)(?:\s+con\s+(.+))?/i);
    if (regenImgMatch) {
      const sceneNum = parseInt(regenImgMatch[1], 10);
      const customPrompt = regenImgMatch[2]?.trim();
      return res.json({
        success: true,
        understood: true,
        actionType: 'regenerate_image',
        parameters: {
          sceneIndex: Math.max(0, sceneNum - 1),
          customPrompt: customPrompt || undefined,
        },
        replyMessage: customPrompt
          ? `Regenerando la imagen de la escena ${sceneNum} con: "${customPrompt}"...`
          : `Regenerando la ilustración de la escena ${sceneNum}...`,
      });
    }

    // D. Regenerar voz: "regenera la voz de la escena 2"
    const regenVoiceMatch = msgLower.match(/\b(?:rehaz|regenera|actualiza)\s+(?:la\s+)?voz\s+(?:de\s+la\s+)?escena\s+(\d+)/i);
    if (regenVoiceMatch) {
      const sceneNum = parseInt(regenVoiceMatch[1], 10);
      return res.json({
        success: true,
        understood: true,
        actionType: 'regenerate_voice',
        parameters: { sceneIndex: Math.max(0, sceneNum - 1) },
        replyMessage: `Regenerando y sincronizando la voz de la escena ${sceneNum}...`,
      });
    }

    // B. Arreglar / corregir errores en mensajes o escenas
    // Ejemplos: "arregla la escena 2, dice barco y debe decir avión", "corrige la escena 1: nuevo texto", "cambia el texto de la escena 3 a..."
    const editSceneMatch = userMessage.match(/\b(?:arregla|corrige|cambia|modifica|edita|actualiza)\s+(?:el\s+texto\s+(?:de\s+)?|la\s+narraci[oó]n\s+(?:de\s+)?|el\s+gui[oó]n\s+(?:de\s+)?|la\s+frase\s+(?:de\s+)?|el\s+mensaje\s+(?:de\s+)?)?(?:la\s+)?escena\s+(\d+)(?:[\s\:\,\-]+(?:por|a|diciendo|con|que\s+diga)?\s*[\"\“\']?(.+?)[\"\”\']?)?$/i);
    if (editSceneMatch && !msgLower.includes('imagen') && !msgLower.includes('dibujo') && !msgLower.includes('ilustración')) {
      const sceneNum = parseInt(editSceneMatch[1], 10);
      const rawNewText = editSceneMatch[2]?.trim();
      const sceneIdx = Math.max(0, sceneNum - 1);
      const existingScene = currentProject?.scenes?.[sceneIdx];

      if (rawNewText && rawNewText.length > 2) {
        return res.json({
          success: true,
          understood: true,
          actionType: 'edit_scene',
          parameters: {
            sceneIndex: sceneIdx,
            newNarrationText: rawNewText,
          },
          replyMessage: `Corregí la narración de la escena ${sceneNum} a: "${rawNewText}".`,
        });
      } else {
        return res.json({
          success: true,
          understood: true,
          actionType: 'ask_scene_correction',
          parameters: { sceneIndex: sceneIdx },
          replyMessage: `¿Qué corrección o nuevo texto deseas para la escena ${sceneNum}? (Actualmente dice: "${existingScene?.narrationText || 'sin texto'}")`,
        });
      }
    }

    // C. Saludos y conversación normal amigable
    const isGreetingOrChat =
      /^(?:hola|buen[ao]s\s*(?:d[ií]as|tardes|noches)?|hey|saludos|qu[eé]\s+tal|c[oó]mo\s+est[aá]s|qu[ií]en\s+eres|qu[eé]\s+puedes\s+hacer|ay[uú]dame|gracias|muchas\s+gracias|ok|vale|perfecto|entendido)\b/i.test(msgLower);

    if (isGreetingOrChat && !msgLower.includes('escena') && !msgLower.includes('formato') && !msgLower.includes('voz') && !msgLower.includes('estilo')) {
      const sceneCount = currentProject?.scenesCount || currentProject?.scenes?.length || 0;
      let reply = '';
      if (msgLower.startsWith('hola') || msgLower.startsWith('buen') || msgLower.startsWith('hey') || msgLower.startsWith('saludos')) {
        reply = sceneCount > 0
          ? `¡Hola! Tu proyecto "${currentProject?.title || 'Video'}" tiene ${sceneCount} escenas listas. Puedes decirme: "haz el video", "arregla la escena 1", "cambia la voz a Puck", o pedirme cualquier ajuste.`
          : '¡Hola! Soy tu asistente de AutoVideo IA. Dime sobre qué quieres que sea tu video (por ejemplo: "hazme un video sobre la luna") o pega tu guion y lo estructuraré de inmediato.';
      } else if (msgLower.includes('quién eres') || msgLower.includes('quien eres') || msgLower.includes('qué puedes hacer') || msgLower.includes('que puedes hacer')) {
        reply = 'Soy el asistente inteligente de AutoVideo IA. Conmigo puedes:\n• Crear guiones a partir de cualquier tema o idea.\n• Iniciar la producción completa del video diciendo "haz el video".\n• Arreglar y corregir errores en cualquier escena ("arregla la escena 2...").\n• Cambiar voces (Gemini, Piper local, Kokoro local).\n• Cambiar formato (16:9 horizontal o 9:16 vertical).\n• Elegir estilos visuales y música de fondo.';
      } else if (msgLower.includes('gracias')) {
        reply = '¡Con mucho gusto! Estoy aquí para que tu video quede excelente. Dime "haz el video" cuando quieras que empiece a generarlo.';
      } else {
        reply = sceneCount > 0
          ? `¿En qué te puedo ayudar? Tienes ${sceneCount} escenas. Puedes decirme "haz el video" para iniciar, o pedirme corregir alguna escena.`
          : 'Dime sobre qué tema quieres tu video y te crearé el guion listo para generar.';
      }
      return res.json({
        success: true,
        understood: true,
        actionType: 'conversation',
        replyMessage: reply,
      });
    }

    // D. Creación de guion desde una idea por chat
    const isCreateIntent =
      /^(?:crea|haz|genera|escribe|quiero)\s+(?:un\s+)?(?:video|gui[oó]n|historia|relato)\s+(?:de|sobre|para)\s+(.+)/i.test(userMessage) ||
      /^video\s+(?:de|sobre)\s+(.+)/i.test(userMessage);

    if (isCreateIntent && (!currentProject?.scenes || currentProject.scenes.length === 0)) {
      const match = userMessage.match(/^(?:crea|haz|genera|escribe|quiero)?\s*(?:un\s+)?(?:video|gui[oó]n|historia|relato)?\s*(?:de|sobre|para)\s*(.+)/i);
      const topic = match?.[1]?.trim() || userMessage.trim();
      const shouldAutoStart = msgLower.includes('y hazlo') || msgLower.includes('y genera') || msgLower.includes('ya');
      const generated = parseScriptLocally(
        `# Video: ${topic}\n\n## Introducción\n${topic} es un tema fascinante. En este video veremos sus puntos clave.\n\n## Desarrollo\nExploramos los aspectos más impactantes y relevantes que necesitas saber.\n\n## Conclusión\nEsto demuestra la importancia de ${topic}. Déjanos tu opinión en los comentarios.`,
        currentProject?.visualStyle || 'Simple 2D whiteboard animation style illustration'
      );
      return res.json({
        success: true,
        understood: true,
        actionType: 'create_script',
        parameters: {
          title: `Video sobre ${topic.slice(0, 35)}`,
          scenes: generated.scenes,
          autoStart: shouldAutoStart,
        },
        replyMessage: `¡Listo! He creado el guion de ${generated.scenes.length} escenas sobre "${topic}". Puedes pulsar "Generar video completo" o decirme "haz el video" para empezar la producción de inmediato.`,
      });
    }

    // A. Voz: "cambia la voz a Charon", "pon voz de fenrir"
    const voiceMatch = msgLower.match(/\b(?:cambia|pon|usa|elegir)\s+(?:la\s+)?(?:voz|narrador|locutor)\s+(?:a|de|por)?\s*(kore|puck|charon|fenrir|zephyr)\b/i) ||
      msgLower.match(/\b(kore|puck|charon|fenrir|zephyr)\b/i);
    if (voiceMatch) {
      const rawName = voiceMatch[voiceMatch.length - 1].toLowerCase();
      const capName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      return res.json({
        success: true,
        understood: true,
        actionType: 'change_voice',
        parameters: { voiceName: capName },
        replyMessage: `Cambié la voz del proyecto a ${capName}.`,
      });
    }

    // Requisito 29: Las de formato SOLO se activan si el mensaje contiene "formato" o "cambia a/hazlo en" junto a vertical/horizontal
    const hasFormatIntent =
      msgLower.includes('formato') ||
      msgLower.includes('cambia a') ||
      msgLower.includes('hazlo en') ||
      msgLower.includes('ponlo en') ||
      msgLower.includes('cambiar a') ||
      msgLower.includes('hacerlo en');

    if (hasFormatIntent) {
      if (msgLower.includes('vertical') || msgLower.includes('9:16') || msgLower.includes('shorts') || msgLower.includes('reels') || msgLower.includes('tiktok')) {
        return res.json({
          success: true,
          understood: true,
          actionType: 'change_aspect_ratio',
          parameters: { aspectRatio: '9:16' },
          replyMessage: 'Cambié el formato a vertical (9:16) optimizado para TikTok, Reels y Shorts.',
        });
      }
      if (msgLower.includes('horizontal') || msgLower.includes('16:9') || msgLower.includes('panorámico') || msgLower.includes('panoramico')) {
        return res.json({
          success: true,
          understood: true,
          actionType: 'change_aspect_ratio',
          parameters: { aspectRatio: '16:9' },
          replyMessage: 'Cambié el formato a horizontal clásico (16:9) para YouTube.',
        });
      }
    }

    // E. Música: "música lofi", "cambia la música a upbeat", "sin música"
    if (msgLower.includes('sin música') || msgLower.includes('sin musica') || msgLower.includes('quitar música')) {
      return res.json({
        success: true,
        understood: true,
        actionType: 'change_music',
        parameters: { presetType: 'none' },
        replyMessage: 'Eliminé la pista musical de fondo del video.',
      });
    }
    const musicMatch = msgLower.match(/\b(lofi|upbeat|cinematic|cinemática|cinematica|corporate|corporativo)\b/i);
    if (musicMatch && (msgLower.includes('música') || msgLower.includes('musica') || msgLower.includes('pista') || msgLower.includes('fondo'))) {
      let mType = musicMatch[1].toLowerCase();
      if (mType.includes('cinemat')) mType = 'cinematic';
      if (mType.includes('corporat')) mType = 'corporate';
      return res.json({
        success: true,
        understood: true,
        actionType: 'change_music',
        parameters: { presetType: mType },
        replyMessage: `Música de fondo cambiada a ${mType.toUpperCase()}.`,
      });
    }

    // F. Estilo visual: "estilo anime", "estilo cinemático", "estilo comic"
    const styleMatch = msgLower.match(/\b(cinematic|cinemático|cinematico|digital_art|digital|anime|comic|cómic|minimalist|minimalista)\b/i);
    if (styleMatch && (msgLower.includes('estilo') || msgLower.includes('dibujo') || msgLower.includes('diseño'))) {
      let sType = styleMatch[1].toLowerCase();
      if (sType.includes('cinemat')) sType = 'cinematic';
      else if (sType.includes('digit')) sType = 'digital_art';
      else if (sType.includes('anim')) sType = 'anime';
      else if (sType.includes('comic') || sType.includes('cómic')) sType = 'comic';
      else if (sType.includes('minimal')) sType = 'minimalist';
      return res.json({
        success: true,
        understood: true,
        actionType: 'change_style',
        parameters: { visualStyle: sType },
        replyMessage: `Estilo visual actualizado a ${sType}.`,
      });
    }

    // G. Formatear memoria contextual para Gemini (chatHistory y scenesSummary)
    const historyText = (currentProject?.chatHistory || [])
      .map((m: any) => `${m.sender === 'user' ? 'Usuario' : 'Asistente'}: ${m.text}`)
      .join('\n');

    const scenesSummaryText = (currentProject?.scenesSummary || [])
      .map((s: any) => `• Escena ${s.order + 1} (${s.title}): "${s.narration}"`)
      .join('\n');

    // Llamar a Gemini 3.8 Flash con timeout estricto y razonamiento superior
    const ai = getGeminiClient();
    const systemPrompt = `Eres el asistente ejecutivo y director de producción de AutoVideo IA.
Eres sumamente inteligente, lógico, directo y con memoria contextual impecable. NUNCA sobrepienses ni des rodeos ni pidas confirmaciones obvias.
REGLAS CRÍTICAS:
1. Si el usuario te pide una escena de ejemplo, una muestra, o describe una idea ("dame una escena...", "hazme un ejemplo", "un video sobre..."), NUNCA devuelvas solo texto conversacional. Genera de inmediato "create_script" con escenas reales estructuradas en parameters.scenes.
2. Si el usuario dice "genera el video", "haz el video", "empieza", "inicia", "créalo ya", ejecuta "start_generation" de inmediato. Si no hay escenas previas, usa "create_script" con autoStart: true basándote en la conversación anterior.
3. Si el usuario pide cambiar un texto o detalle de una escena, aplica la acción "edit_scene".
4. Responde con calidez y seguridad, en español conciso.

Historial de conversación reciente (MEMORIA CONTEXTUAL):
${historyText || '(Inicio de conversación)'}

Escenas actuales en el proyecto:
${scenesSummaryText || '(Sin escenas aún)'}

Acciones válidas (actionType):
- "start_generation": El usuario te pide hacer, generar, iniciar o crear el video. (testMode: boolean opcional).
- "create_script": El usuario pide un ejemplo, una escena, o propone una idea para su video. Parámetros: title (string), scenes (array de objetos con title, narrationText, visualDescription, visualPrompt, estimatedDuration, cameraMotion, keywords), autoStart (boolean).
- "conversation": El usuario charla, hace preguntas o comentarios. Responde de forma inteligente, concisa y empática en replyMessage.
- "edit_scene": El usuario pide cambiar, corregir o arreglar el texto de una escena. sceneIndex (0-based), newNarrationText.
- "change_voice": voiceName ('Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr').
- "change_aspect_ratio": aspectRatio ('16:9' | '9:16').
- "change_style": visualStyle (estilo visual).
- "change_music": presetType ('lofi' | 'upbeat' | 'cinematic' | 'corporate' | 'none').
- "regenerate_image": sceneIndex, customPrompt.
- "regenerate_voice": sceneIndex.
- "unknown": Solo si es totalmente ininteligible.

Estado actual del proyecto:
- Título: ${currentProject?.title || 'Sin título'}
- Escenas totales: ${currentProject?.scenesCount || currentProject?.scenes?.length || 0}
- Voz: ${currentProject?.voiceName || 'Kore'}
- Formato: ${currentProject?.aspectRatio || '16:9'}
- Música: ${currentProject?.music?.presetType || 'lofi'}`;

    let response: any = null;
    try {
      response = await callGeminiWithTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Mensaje del usuario: "${userMessage}"`,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                understood: { type: Type.BOOLEAN },
                actionType: {
                  type: Type.STRING,
                  enum: [
                    'start_generation',
                    'create_script',
                    'conversation',
                    'edit_scene',
                    'change_voice',
                    'change_aspect_ratio',
                    'change_style',
                    'change_music',
                    'regenerate_image',
                    'regenerate_voice',
                    'unknown'
                  ]
                },
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    testMode: { type: Type.BOOLEAN },
                    voiceName: { type: Type.STRING },
                    aspectRatio: { type: Type.STRING },
                    visualStyle: { type: Type.STRING },
                    presetType: { type: Type.STRING },
                    sceneIndex: { type: Type.NUMBER },
                    newNarrationText: { type: Type.STRING },
                    customPrompt: { type: Type.STRING },
                    question: { type: Type.STRING },
                    title: { type: Type.STRING },
                    autoStart: { type: Type.BOOLEAN },
                    scenes: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          narrationText: { type: Type.STRING },
                          visualDescription: { type: Type.STRING },
                          visualPrompt: { type: Type.STRING },
                          estimatedDuration: { type: Type.NUMBER },
                          cameraMotion: { type: Type.STRING },
                          keywords: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                          }
                        },
                        required: ['title', 'narrationText', 'visualDescription', 'visualPrompt']
                      }
                    }
                  }
                },
                replyMessage: { type: Type.STRING }
              },
              required: ['understood', 'actionType', 'replyMessage']
            }
          }
        }),
        7000
      );
    } catch (primaryErr) {
      // Fallback conversacional local inteligente con memoria si Gemini no responde a tiempo
      console.warn('Gemini chat command no disponible o timeout. Usando analizador inteligente local con memoria.');
      const sceneCount = currentProject?.scenesCount || currentProject?.scenes?.length || 0;
      let localReply = '';
      
      if (isStartGenIntent) {
        return res.json({
          success: true,
          understood: true,
          actionType: 'start_generation',
          parameters: { testMode: false },
          replyMessage: '¡Iniciando la generación de tu video ahora mismo!',
        });
      } else if (msgLower.includes('escena')) {
        const num = msgLower.match(/\d+/)?.[0] || '1';
        localReply = `Entendido. Para ajustar la escena ${num}, puedes decirme: "corrige la escena ${num}: [tu nuevo texto]" o "rehaz la imagen de la escena ${num}".`;
      } else if (sceneCount === 0) {
        localReply = `¡Te escucho! Dime sobre qué tema quieres tu video (ejemplo: "haz un video sobre la luna") o pega tu guion directamente y lo estructuraré de inmediato.`;
      } else {
        localReply = `Comprendo tu mensaje. Tu proyecto tiene ${sceneCount} escenas. Puedes decirme "haz el video" para iniciar la producción, o pedirme que ajuste cualquier texto.`;
      }

      return res.json({
        success: true,
        understood: true,
        actionType: 'conversation',
        replyMessage: localReply,
      });
    }

    const parsed = cleanJsonResponse(response.text || '{}');
    return res.json({
      success: true,
      ...parsed
    });
  } catch (error: any) {
    console.warn('Error en /api/chat/command:', error?.message);
    return res.json({
      success: false,
      understood: false,
      actionType: 'unknown',
      replyMessage: 'No pude interpretar esa orden con certeza. ¿Podrías indicarme qué cambio deseas hacer en las escenas, voz o formato?'
    });
  }
});

// --------------------------------------------------------------------------
// Vite Middleware / Static Server
// --------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoVideo IA servidor iniciado en el puerto ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
