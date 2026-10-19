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

// Helper to initialize Gemini SDK with required telemetry User-Agent
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

// 1. POST /api/script/parse: Divide un guion en escenas con Gemini 3.8 Flash
app.post('/api/script/parse', async (req, res) => {
  try {
    const { script, visualStyle, maxScenes } = req.body;
    if (!script || typeof script !== 'string') {
      return res.status(400).json({ error: 'El guion es requerido.' });
    }

    const ai = getGeminiClient();
    const stylePrompt = visualStyle || 'Simple 2D whiteboard animation style illustration';

    const systemPrompt = `Eres un director audiovisual experto. Tu tarea es analizar un guion en español y dividirlo en escenas secuenciales para un video.
Reglas estrictas:
1. Las líneas que comienzan con "IMAGEN:" son guías visuales y NUNCA deben incluirse en la narración hablada (narrationText).
2. Los títulos con "##", "NÚMERO" o números separan escenas.
3. Si un párrafo no tiene separación explícita, divídelo lógicamente en escenas de 1 a 3 oraciones cada una.
4. Para cada escena genera:
   - title: Título corto descriptivo de la escena (ej: "Escena 1: El Dilema").
   - narrationText: Solo el texto que se debe narrar en voz alta, en español fluido, sin anotaciones entre paréntesis ni etiquetas.
   - visualDescription: Qué elementos específicos aparecen en pantalla. Mantén coherencia de personajes y objetos entre escenas consecutivas.
   - visualPrompt: Prompt en inglés detallado combinando el estilo visual del usuario con la escena concreta. Formato optimizado para generación de imagen: "${stylePrompt}". Agrega detalles de composición, iluminación y personajes recurrentes.
   - estimatedDuration: Duración estimada en segundos (aprox 1 segundo por cada 2.5 palabras habladas, mínimo 3s).
   - cameraMotion: Uno de ["zoom_in", "zoom_out", "pan_left", "pan_right", "static"].
   - keywords: Lista de 2 a 4 palabras clave de alto impacto que se deben resaltar en los subtítulos dinámicos de esta escena.
${maxScenes ? `5. Limita la respuesta a un máximo de ${maxScenes} escenas (modo prueba).` : ''}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Guion a procesar:\n\n${script}`,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedTitle: { type: Type.STRING },
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

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      title: parsed.suggestedTitle || 'Mi Nuevo Video',
      scenes: parsed.scenes || [],
      modelUsed: 'gemini-3.8-flash',
    });
  } catch (error: any) {
    console.error('Error al parsear guion:', error);
    const isQuota = error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('quota');
    return res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? 'Se ha alcanzado el límite de cuota de la API de Gemini. Espera unos segundos para continuar.'
        : `Error al procesar el guion: ${error?.message || 'Error desconocido'}`,
      isQuotaError: isQuota,
    });
  }
});

// 2. POST /api/image/generate: Genera una imagen con gemini-3.1-flash-lite-image o fallback vectorial
app.post('/api/image/generate', async (req, res) => {
  const { prompt, aspectRatio = '16:9', title, narrationText, keywords } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'El prompt de imagen es requerido.' });
  }

  try {
    const ai = getGeminiClient();

    // Intentar primero con el modelo de imagen ráster de Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
        },
      },
    });

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
      });
    }
  } catch (error: any) {
    console.warn('Modelo de imagen ráster no disponible o cuota 0 en cuenta gratuita. Activando ilustrador vectorial...', error?.message);
  }

  // Fallback Inteligente: Generador de Ilustración de Escena Vectorial
  // Garantiza que la generación de video NUNCA se bloquee en cuentas gratuitas
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

// 3. POST /api/voice/generate: Genera voz con gemini-3.8-flash-lite-tts
app.post('/api/voice/generate', async (req, res) => {
  try {
    const { text, voiceName = 'Kore', speed = 1.1, tone = 'informativo' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El texto de narración es requerido.' });
    }

    const ai = getGeminiClient();

    // Tone styling guidance for Spanish narration
    let styleGuidance = 'Narración clara en español, ritmo natural.';
    if (tone === 'curioso') styleGuidance = 'Tono curioso, intrigante y dinámico en español.';
    if (tone === 'dramático' || tone === 'dramatico') styleGuidance = 'Tono dramático, emotivo y cinematográfico en español.';
    if (tone === 'entusiasta') styleGuidance = 'Tono entusiasta, enérgico y motivador en español.';

    const validVoice = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'].includes(voiceName) ? voiceName : 'Kore';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.trim(),
              speechMetadata: {
                style: styleGuidance,
              },
            },
          ],
        },
      ],
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

    // Gemini 3.8 Flash Lite TTS unary response returns full WAV file (audio/wav with 44-byte RIFF header)
    const audioUrl = `data:audio/wav;base64,${base64Audio}`;

    return res.json({
      success: true,
      audioUrl,
      voiceName: validVoice,
      modelUsed: 'gemini-3.8-flash-lite-tts',
    });
  } catch (error: any) {
    console.error('Error al generar voz:', error);
    const isQuota = error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('quota');
    return res.status(isQuota ? 429 : 500).json({
      error: isQuota
        ? 'Límite de cuota alcanzado en síntesis de voz. El progreso ha sido guardado.'
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

    const data = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      metadata: data,
    });
  } catch (error: any) {
    console.error('Error al generar metadatos de YouTube:', error);
    return res.status(500).json({ error: 'Error al generar metadatos de YouTube.' });
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
