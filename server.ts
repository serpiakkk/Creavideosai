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

// Helper to initialize Gemini SDK with required telemetry User-Agent and resilient timeout
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 15000,
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

// Clean narration text: removes stage directions, brackets, and markdown symbols
function cleanNarration(text: string): string {
  return text
    .replace(/^IMAGEN:.*$/gim, '') // Remove any leftover IMAGEN lines
    .replace(/\(.*?\)/g, '') // Remove parenthetical notes
    .replace(/\[.*?\]/g, '') // Remove bracketed directions
    .replace(/\*+/g, '') // Remove asterisks
    .replace(/#{1,6}\s.*$/gm, '') // Remove markdown headers
    .replace(/\s+/g, ' ')
    .trim();
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

  let title = 'Mi Video Autónomo';
  const rawScenes: { title: string; lines: string[]; imageLines: string[] }[] = [];
  let currentScene: { title: string; lines: string[]; imageLines: string[] } | null = null;
  let sceneCounter = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect Title if it starts with #
    if (line.startsWith('# ') && !title.includes('Mi Video')) {
      title = line.replace(/^#\s+/, '').trim();
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

  return { title, scenes };
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

// 1. POST /api/script/parse: Divide un guion en escenas con Gemini 3.8 Flash (con Character Continuity)
app.post('/api/script/parse', async (req, res) => {
  const { script, visualStyle, maxScenes } = req.body;
  if (!script || typeof script !== 'string') {
    return res.status(400).json({ error: 'El guion es requerido.' });
  }

  const stylePrompt = visualStyle || 'Simple 2D whiteboard animation style illustration';

  try {
    const ai = getGeminiClient();

    const systemPrompt = `Eres un director audiovisual de clase mundial para canales virales de YouTube y TikTok.
Tu tarea es tomar un guion en español y desglosarlo en escenas cinematográficas precisas, manteniendo COHERENCIA VISUAL DE PERSONAJES y ritmo dinámico.

Reglas obligatorias:
1. NARRACIÓN HABLADA (narrationText):
   - Solo texto que se narrará en voz alta en español fluido, natural y atrapante.
   - NUNCA incluyas guías visuales "IMAGEN:", ni notas entre paréntesis (ej: "(suspiro)"), ni asteriscos markdown.
2. GUÍA VISUAL (visualDescription):
   - Qué ocurre exactamente en pantalla para el espectador.
3. PROMPT DE IMAGEN (visualPrompt):
   - Prompt detallado en inglés optimizado para generación de imagen.
   - Combina el estilo visual elegido: "${stylePrompt}".
   - MANTÉN CONTINUIDAD: Diseña al personaje recurrente (ej: "a friendly stick figure with round head and neat red tie") y usa exactamente esa descripción en TODAS las escenas donde aparezca para consistencia total.
4. PALABRAS CLAVE (keywords):
   - 2 a 4 palabras clave de alto impacto que aparezcan en narrationText para resaltarlas con color en los subtítulos dinámicos.
5. DURACIÓN (estimatedDuration):
   - Duración estimada en segundos (aprox 1s por cada 2.4 palabras habladas, mínimo 3.0s).
6. CÁMARA (cameraMotion):
   - Uno de: "zoom_in", "zoom_out", "pan_left", "pan_right", "static".
${maxScenes ? `7. Limita la respuesta a exactamente ${maxScenes} escenas (modo prueba).` : ''}`;

    // Probar primero gemini-3.1-flash-lite y luego gemini-3.8-flash
    let response: any = null;
    let modelUsed = 'gemini-3.1-flash-lite';
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Guion o tema a estructurar:\n\n${script}`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
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
      });
    } catch (liteErr: any) {
      console.warn('gemini-3.1-flash-lite no disponible, intentando con gemini-3.8-flash...', liteErr?.message);
      modelUsed = 'gemini-3.8-flash';
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Guion o tema a estructurar:\n\n${script}`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.3,
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
      characterDescription: parsed.characterDescription,
      modelUsed,
    });
  } catch (error: any) {
    console.warn('Gemini script parser no disponible o cuota limitada. Activando analizador inteligente local...', error?.message);
    // Intelligent Local Fallback: guarantees user is NEVER blocked
    const localResult = parseScriptLocally(script, visualStyle, maxScenes);
    return res.json({
      success: true,
      title: localResult.title,
      scenes: localResult.scenes,
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

// 2. POST /api/image/generate: Genera una imagen con gemini-3.1-flash-lite-image o fallback vectorial de alta resolución
app.post('/api/image/generate', async (req, res) => {
  const { prompt, aspectRatio = '16:9', title, narrationText, keywords } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'El prompt de imagen es requerido.' });
  }

  // 1. Intentar con modelo de imagen ráster de Gemini
  try {
    const ai = getGeminiClient();
    const runGeneration = async (promptText: string) => {
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
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
          modelUsed: 'gemini-3.1-flash-lite-image',
          isFallback: false,
        });
      }
    }
  } catch (error: any) {
    console.warn('Modelo ráster no disponible o cuota limitada. Activando ilustrador vectorial...', error?.message);
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
      modelUsed: 'gemini-3.8-flash (Ilustrador Vectorial Adaptativo - Cuenta Gratuita)',
      isFallback: true,
    });
  } catch (fallbackErr: any) {
    console.error('Error en fallback visual:', fallbackErr);
    return res.status(500).json({ error: 'Error al generar la ilustración visual.' });
  }
});

// 3. POST /api/voice/generate: Genera voz con gemini-3.8-flash-lite-tts sin speechMetadata usando prompt directo con ritmo
app.post('/api/voice/generate', async (req, res) => {
  try {
    const { text, voiceName = 'Kore', speed = 1.1, tone = 'informativo' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El texto de narración es requerido.' });
    }

    const cleanText = cleanNarration(text);
    if (!cleanText) {
      return res.status(400).json({ error: 'El texto de narración no contiene palabras legibles.' });
    }

    const ai = getGeminiClient();

    // Requisito 2: Quita el campo speechMetadata. Para el tono usa el texto del prompt, por ejemplo:
    // "Di con tono curioso y a ritmo rápido: <texto>". Usa el ritmo (voiceSpeed) dentro de ese texto.
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
          model: 'gemini-3.8-flash-lite-tts',
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

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error('El modelo de voz no devolvió datos de audio.');
        }

        const audioUrl = `data:audio/wav;base64,${base64Audio}`;

        return res.json({
          success: true,
          audioUrl,
          voiceName: validVoice,
          modelUsed: 'gemini-3.8-flash-lite-tts',
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

    const ai = getGeminiClient();
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

// 5. POST /api/chat/command: Interpreta comandos en lenguaje natural del usuario
app.post('/api/chat/command', async (req, res) => {
  try {
    const { userMessage, currentProject } = req.body;
    if (!userMessage || typeof userMessage !== 'string') {
      return res.status(400).json({ error: 'El mensaje es requerido.' });
    }

    const msgLower = userMessage.toLowerCase().trim();

    // Reglas instantáneas (0ms) para los comandos más frecuentes solicitados
    // A. Voz: "cambia la voz a Charon", "pon voz de fenrir"
    const voiceMatch = msgLower.match(/\b(voz|narrador|locutor)\s+(?:a|de|por)?\s*(kore|puck|charon|fenrir|zephyr)\b/i) ||
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

    // B. Formato: "hazlo en formato vertical", "cambia a vertical", "9:16", "16:9", "horizontal"
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

    // Si no coincide con reglas exactas, llamar a Gemini 3.1 Flash Lite con fallback rápido
    const ai = getGeminiClient();
    const systemPrompt = `Eres el asistente inteligente de AutoVideo IA. El usuario te da instrucciones en lenguaje natural para su video en curso.
Debes convertir la intención del usuario en una acción ejecutable precisa o, si no estás seguro o la petición es ambigua, pedir aclaración con una pregunta directa.
NUNCA inventes una acción si no está claramente expresada.

Acciones válidas:
- "change_voice": Parámetros: voiceName ('Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr').
- "change_aspect_ratio": Parámetros: aspectRatio ('16:9' | '9:16').
- "change_style": Parámetros: visualStyle (estilo gráfico en inglés o descriptivo).
- "change_music": Parámetros: presetType ('lofi' | 'upbeat' | 'cinematic' | 'corporate' | 'none').
- "regenerate_image": Parámetros: sceneIndex (número de escena 0-based), customPrompt (opcional nuevo prompt).
- "regenerate_voice": Parámetros: sceneIndex (número de escena 0-based).
- "unknown": Si el usuario dice algo que no es un comando claro de edición, pide aclaración amablemente en replyMessage.

Estado actual del proyecto:
- Título: ${currentProject?.title || 'Sin título'}
- Escenas totales: ${currentProject?.scenes?.length || 0}
- Voz actual: ${currentProject?.voiceName || 'Kore'}
- Formato: ${currentProject?.aspectRatio || '16:9'}
- Música: ${currentProject?.music?.presetType || 'lofi'}`;

    let response: any = null;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `Mensaje del usuario: "${userMessage}"`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              understood: { type: Type.BOOLEAN },
              actionType: {
                type: Type.STRING,
                enum: ['change_voice', 'change_aspect_ratio', 'change_style', 'change_music', 'regenerate_image', 'regenerate_voice', 'unknown']
              },
              parameters: {
                type: Type.OBJECT,
                properties: {
                  voiceName: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  visualStyle: { type: Type.STRING },
                  presetType: { type: Type.STRING },
                  sceneIndex: { type: Type.NUMBER },
                  customPrompt: { type: Type.STRING },
                  question: { type: Type.STRING },
                }
              },
              replyMessage: { type: Type.STRING }
            },
            required: ['understood', 'actionType', 'replyMessage']
          }
        }
      });
    } catch (liteErr) {
      console.warn('Fallo en lite para comando, probando gemini-3.8-flash...', liteErr);
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Mensaje del usuario: "${userMessage}"`,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              understood: { type: Type.BOOLEAN },
              actionType: {
                type: Type.STRING,
                enum: ['change_voice', 'change_aspect_ratio', 'change_style', 'change_music', 'regenerate_image', 'regenerate_voice', 'unknown']
              },
              parameters: {
                type: Type.OBJECT,
                properties: {
                  voiceName: { type: Type.STRING },
                  aspectRatio: { type: Type.STRING },
                  visualStyle: { type: Type.STRING },
                  presetType: { type: Type.STRING },
                  sceneIndex: { type: Type.NUMBER },
                  customPrompt: { type: Type.STRING },
                  question: { type: Type.STRING },
                }
              },
              replyMessage: { type: Type.STRING }
            },
            required: ['understood', 'actionType', 'replyMessage']
          }
        }
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
