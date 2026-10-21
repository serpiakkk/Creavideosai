import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Plus,
  Send,
  Paperclip,
  Play,
  Pause,
  Download,
  Share2,
  Film,
  Sparkles,
  Volume2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Music,
  FileText,
  Copy,
  Trash2,
  X,
  Sliders,
  ChevronRight,
  Maximize2,
  Cpu,
} from 'lucide-react';
import {
  VideoProject,
  ChatMessage,
  SceneItem,
  AspectRatio,
  YouTubeMetadata,
  TaskModelConfig,
} from '../types';
import {
  parseScriptWithGemini,
  generateImageWithGemini,
  generateVoiceWithGemini,
  getVoiceSample,
  getAudioDuration,
  sendChatCommand,
  generateYouTubeMetadata,
} from '../services/geminiService';
import { VideoComposer } from '../services/videoComposer';
import { saveProject, deleteProjectById } from '../services/db';
import { readDocumentFile } from '../services/docReader';
import { useToast } from '../components/Toast';
import { ModelSelectorSheet } from '../components/ModelSelectorSheet';
import {
  DEFAULT_TASK_CONFIG,
  getStoredDefaultModels,
  saveStoredDefaultModels,
  generateLocalVoice,
  generateLocalScript,
} from '../services/localModelService';

// Requisito 23: Estilo "Pizarra con muñecos de palitos" como PRIMERO y predeterminado con este prompt exacto
const WHITEBOARD_PROMPT =
  'Simple 2D whiteboard animation style illustration, hand-drawn stick figure with round head and thick black outlines, white background, minimal flat colors with red accents, clean cartoon icons, lots of empty space, 16:9, no realistic faces, no copyrighted characters, only short Spanish text labels.';

const VISUAL_STYLES = [
  { id: 'whiteboard', name: 'Pizarra con muñecos de palitos', prompt: WHITEBOARD_PROMPT },
  { id: 'cinematic', name: 'Cinemático', prompt: 'Cinematic hyperrealistic, 8k concept art, moody lighting' },
  { id: 'digital_art', name: 'Ilustración Digital', prompt: 'Modern crisp digital illustration, vibrant gradient colors' },
  { id: 'anime', name: 'Anime / Manga', prompt: 'High quality anime key visual, Makoto Shinkai aesthetic' },
  { id: 'comic', name: 'Cómic Retro', prompt: 'Vintage graphic novel comic book style, halftones and bold ink' },
  { id: 'minimalist', name: 'Minimalista 3D', prompt: 'Clean minimalist 3D isometric render, soft studio lighting' },
];

const LOCAL_STORAGE_MODELS_KEY = 'autovideo_default_models';

function getStoredDefaultModels(): TaskModelConfig {
  try {
    const s = localStorage.getItem(LOCAL_STORAGE_MODELS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return DEFAULT_TASK_CONFIG;
}

const VOICES = [
  { id: 'Kore', name: 'Kore', desc: 'Femenina, natural y cálida' },
  { id: 'Puck', name: 'Puck', desc: 'Masculina, jovial y dinámica' },
  { id: 'Charon', name: 'Charon', desc: 'Masculina, profunda y seria' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Masculina, intensa y enérgica' },
  { id: 'Zephyr', name: 'Zephyr', desc: 'Femenina, suave y reflexiva' },
];

const MUSIC_PRESETS = [
  { id: 'lofi', name: 'Lo-Fi Chill (82 BPM)' },
  { id: 'upbeat', name: 'Upbeat Moderno (124 BPM)' },
  { id: 'cinematic', name: 'Cinemático (70 BPM)' },
  { id: 'corporate', name: 'Corporativo (105 BPM)' },
  { id: 'none', name: 'Sin música' },
];

export const ChatView: React.FC<ChatViewProps> = ({
  currentProject,
  allProjects,
  onSelectProject,
  onNewChat,
  onOpenEditor,
  onProjectUpdated,
}) => {
  const { showToast } = useToast();

  // Navigation / Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);

  // Input state
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [pendingScriptAttachment, setPendingScriptAttachment] = useState<{
    fileName: string;
    text: string;
    preview: string;
  } | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStepText, setGenerationStepText] = useState('');
  const [quotaCountdown, setQuotaCountdown] = useState<number | null>(null);
  const [showGenericChoice, setShowGenericChoice] = useState(false);

  // Video Export & Preview state
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedVideoBlob, setExportedVideoBlob] = useState<Blob | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [voiceVolumePeak, setVoiceVolumePeak] = useState<number | null>(null);
  const [voiceWarning, setVoiceWarning] = useState(false);
  const [isPlayingExportedAudio, setIsPlayingExportedAudio] = useState(false);
  const [voiceSamplePlaying, setVoiceSamplePlaying] = useState<string | null>(null);

  // Modals
  const [showSeoModal, setShowSeoModal] = useState(false);
  const [seoMetadata, setSeoMetadata] = useState<YouTubeMetadata | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [showThumbnailModal, setShowThumbnailModal] = useState(false);
  const [thumbnailSubtitle, setThumbnailSubtitle] = useState(
    currentProject?.thumbnailSubtitle || 'EDICIÓN ESPECIAL'
  );

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const playerCanvasRef = useRef<HTMLCanvasElement>(null);
  const composerRef = useRef<VideoComposer | null>(null);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
  const isCancelledRef = useRef(false);
  const pipelineRunningRef = useRef(false); // Requisito 14: bloqueo para proceso único
  const activeRunIdRef = useRef(0); // Requisito 14: identificador de ejecución único
  const projectRef = useRef<VideoProject | null>(currentProject);

  // Requisito 1 & 3: Hoja de selector de modelos y estado
  const [isModelSheetOpen, setIsModelSheetOpen] = useState(false);
  const [pendingScriptToReplace, setPendingScriptToReplace] = useState<{ text: string; attachment?: any } | null>(null);
  const [failedScenesIndices, setFailedScenesIndices] = useState<number[]>([]);
  const [quotaAlertActive, setQuotaAlertActive] = useState(false);

  useEffect(() => {
    projectRef.current = currentProject;
    if (currentProject?.thumbnailSubtitle) {
      setThumbnailSubtitle(currentProject.thumbnailSubtitle);
    }
  }, [currentProject]);

  // Auto-scroll chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentProject?.chatHistory, isTyping, isGenerating]);

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [inputMessage]);

  // Initialize or fetch project (Requisitos 3, 15, 17, 23)
  const ensureProject = (): VideoProject => {
    if (projectRef.current) return projectRef.current;
    const newId = `proj_${Date.now()}`;
    const fresh: VideoProject = {
      id: newId,
      title: 'Nuevo Video',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aspectRatio: '16:9',
      rawScript: '',
      visualStyle: WHITEBOARD_PROMPT, // Requisito 23: Estilo pizarra predeterminado
      voiceName: 'Kore',
      voiceSpeed: 1.1,
      voiceTone: 'informativo',
      music: {
        id: 'lofi-default',
        name: 'Lo-Fi Chill (82 BPM)',
        type: 'preset',
        volume: 0.22,
        presetType: 'lofi',
      },
      status: 'draft',
      scenes: [],
      fallbackImagePreference: 'ask', // Requisito 17: por defecto 'ask'
      modelConfig: getStoredDefaultModels(), // Requisito 3: configuracion por defecto
      chatHistory: [
        {
          id: `msg_${Date.now()}`,
          sender: 'assistant',
          timestamp: Date.now(),
          text: '¡Hola! Soy tu asistente de AutoVideo IA. Pega o adjunta tu guion para empezar a crear tu video.',
        },
      ],
    };
    projectRef.current = fresh;
    onProjectUpdated(fresh);
    saveProject(fresh);
    return fresh;
  };

  // Requisito 1 & 3: Resumen legible de la configuracion de modelos para Guion, Imagen y Voz
  const getModelSummaryText = () => {
    const proj = projectRef.current || currentProject;
    const cfg = proj?.modelConfig || getStoredDefaultModels();

    let scriptLabel = 'Gemini Flash';
    if (cfg?.script?.provider === 'gemini') {
      scriptLabel = cfg.script.modelId ? cfg.script.modelId.replace('gemini-', '') : 'Gemini';
    } else if (cfg?.script?.provider === 'local') {
      scriptLabel = cfg.script.tier === 'heavy' ? 'Qwen 7B (Local)' : cfg.script.tier === 'medium' ? 'Llama 3B (Local)' : 'Qwen 0.5B (Local)';
    } else {
      scriptLabel = 'Sin IA';
    }

    let imageLabel = 'Gemini';
    if (cfg?.image?.provider === 'gemini') {
      imageLabel = 'Gemini';
    } else if (cfg?.image?.provider === 'local') {
      imageLabel = 'SD-Turbo (Local)';
    } else {
      imageLabel = 'Ilustrador Vectorial';
    }

    let voiceLabel = 'Gemini';
    if (cfg?.voice?.provider === 'gemini') {
      voiceLabel = proj?.voiceName ? `Gemini (${proj.voiceName})` : 'Gemini (Kore)';
    } else if (cfg?.voice?.provider === 'local') {
      voiceLabel = cfg.voice.tier === 'heavy' ? 'Studio ES (Local)' : cfg.voice.tier === 'medium' ? 'Kokoro TTS (Local)' : 'Piper TTS (Local)';
    } else {
      voiceLabel = 'Web Audio (Sin IA)';
    }

    return `Guion: ${scriptLabel} · Imagen: ${imageLabel} · Voz: ${voiceLabel}`;
  };

  // Helper to append message in project chat history
  const addChatMessage = async (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const proj = ensureProject();
    const newMsg: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    };
    const updatedHistory = [...(proj.chatHistory || []), newMsg];
    const updatedProject = {
      ...proj,
      chatHistory: updatedHistory,
      updatedAt: Date.now(),
    };
    projectRef.current = updatedProject;
    onProjectUpdated(updatedProject);
    await saveProject(updatedProject);
    return updatedProject;
  };

  // Update existing message (e.g. for progress updates)
  const updateChatMessage = async (msgId: string, updates: Partial<ChatMessage>) => {
    const proj = projectRef.current;
    if (!proj || !proj.chatHistory) return;
    const updatedHistory = proj.chatHistory.map((m) =>
      m.id === msgId ? { ...m, ...updates } : m
    );
    const updatedProject = { ...proj, chatHistory: updatedHistory, updatedAt: Date.now() };
    projectRef.current = updatedProject;
    onProjectUpdated(updatedProject);
    await saveProject(updatedProject);
  };

  // Handle Script Attachment
  const handleScriptFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await readDocumentFile(file);
      setPendingScriptAttachment(doc);
      setInputMessage(doc.text);
      setIsAttachmentSheetOpen(false);
      showToast(`Guion "${doc.fileName}" cargado correctamente`, 'success');
    } catch (err: any) {
      showToast('Error al leer el archivo. Formatos permitidos: .txt, .md, .docx', 'error');
    }
  };

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        showToast('El portapapeles está vacío', 'info');
        return;
      }
      setInputMessage(clipText);
      setIsAttachmentSheetOpen(false);
      showToast('Guion pegado desde el portapapeles', 'success');
    } catch {
      showToast('No se pudo acceder al portapapeles. Pega manualmente en el campo.', 'info');
    }
  };

  // Handle Custom Music Upload (Req 19 & 20: saved in IndexedDB as Data URL)
  const handleMusicFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const proj = ensureProject();
        const updatedMusic = {
          ...proj.music,
          type: 'custom' as const,
          customFileName: file.name,
          customAudioUrl: dataUrl,
          name: file.name,
        };
        const updatedProject = { ...proj, music: updatedMusic };
        onProjectUpdated(updatedProject);
        await saveProject(updatedProject);
        setIsAttachmentSheetOpen(false);
        showToast(`Música "${file.name}" cargada para el proyecto`, 'success');
        await addChatMessage({
          sender: 'assistant',
          text: `Agregué tu pista musical "${file.name}". Se mezclará y sincronizará con la voz automáticamente.`,
        });
      };
      reader.readAsDataURL(file);
    } catch {
      showToast('No se pudo cargar el archivo de audio', 'error');
    }
  };

  // Listen to sample voice without consuming project generation quota repeatedly
  const handlePlayVoiceSample = async (voiceName: string) => {
    try {
      setVoiceSamplePlaying(voiceName);
      const audioUrl = await getVoiceSample(voiceName);
      const audio = new Audio(audioUrl);
      audio.onended = () => setVoiceSamplePlaying(null);
      audio.onerror = () => setVoiceSamplePlaying(null);
      await audio.play();
    } catch (err: any) {
      setVoiceSamplePlaying(null);
      showToast('No se pudo reproducir la muestra de voz.', 'error');
    }
  };

  // Guardar configuración de modelos (Requisito 3)
  const handleSaveModelConfig = async (newConfig: TaskModelConfig, saveAsDefault?: boolean) => {
    const proj = ensureProject();
    const updatedProj: VideoProject = { ...proj, modelConfig: newConfig, updatedAt: Date.now() };
    projectRef.current = updatedProj;
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);

    if (saveAsDefault) {
      try {
        localStorage.setItem(LOCAL_STORAGE_MODELS_KEY, JSON.stringify(newConfig));
      } catch {}
      showToast('Configuración de modelos guardada para este proyecto y como predeterminada', 'success');
    } else {
      showToast('Configuración de modelos actualizada para el proyecto', 'success');
    }
  };

  // Requisito 23: Si cambio el estilo con escenas ya creadas, pregunta con un botón "Regenerar descripciones visuales"
  const handleStyleChange = async (st: { id: string; name: string; prompt: string }) => {
    const proj = ensureProject();
    const upd: VideoProject = {
      ...proj,
      visualStyle: st.prompt, // Requisito 23: pasa siempre el TEXTO del prompt del estilo, no su id
      updatedAt: Date.now(),
    };
    projectRef.current = upd;
    onProjectUpdated(upd);
    await saveProject(upd);

    if (upd.scenes && upd.scenes.length > 0) {
      await addChatMessage({
        sender: 'assistant',
        text: `Cambiaste el estilo visual a **${st.name}**. ¿Deseas regenerar las descripciones visuales de las escenas actuales para aplicar este nuevo estilo?`,
        widgetType: 'style_change_confirm',
        widgetData: { newPrompt: st.prompt, styleName: st.name },
      });
    }
  };

  const handleRegenerateVisualDescriptions = async (newPrompt: string) => {
    const proj = projectRef.current;
    if (!proj) return;
    const updatedScenes = proj.scenes.map((sc) => ({
      ...sc,
      visualPrompt: `${newPrompt}, depicting: ${sc.visualDescription || sc.title}. Focal composition, sharp outlines, expressive stick figure.`,
    }));
    const updatedProj = { ...proj, scenes: updatedScenes, visualStyle: newPrompt, updatedAt: Date.now() };
    projectRef.current = updatedProj;
    onProjectUpdated(updatedProj);
    await saveProject(updatedProj);
    showToast('Descripciones visuales actualizadas con el nuevo estilo', 'success');
    await addChatMessage({
      sender: 'assistant',
      text: `¡Listo! Actualicé los prompts visuales de las ${updatedScenes.length} escenas con el nuevo estilo.`,
    });
  };

  // Helper para procesar y analizar guion según proveedor elegido (Requisito 9, 12, 23, 30)
  const processAndParseScript = async (text: string) => {
    const proj = ensureProject();
    const modelConfig = proj.modelConfig || getStoredDefaultModels();

    try {
      let parsedScenes: any[] = [];
      let parsedTitle = proj.title;
      let modelUsedName = modelConfig.script.modelName;

      if (modelConfig.script.provider === 'local') {
        setGenerationStepText('Analizando guion con modelo local en el navegador…');
        const res = await generateLocalScript(text, modelConfig.script.tier || 'light');
        parsedTitle = res.title || proj.title;
        parsedScenes = res.scenes;
        modelUsedName = `${modelConfig.script.modelName} (Local)`;
      } else if (modelConfig.script.provider === 'internal') {
        setGenerationStepText('Estructurando guion con analizador interno…');
        const parseResult = await parseScriptWithGemini(
          text,
          proj.visualStyle || WHITEBOARD_PROMPT,
          undefined,
          'internal-script-parser'
        );
        parsedTitle = parseResult.title || proj.title;
        parsedScenes = parseResult.scenes;
        modelUsedName = 'Analizador Determinista (Sin IA)';
      } else {
        // Gemini en la nube (Requisito 23: texto del prompt, no su id)
        const parseResult = await parseScriptWithGemini(
          text,
          proj.visualStyle || WHITEBOARD_PROMPT,
          undefined,
          modelConfig.script.modelId
        );
        parsedTitle = parseResult.title || proj.title;
        parsedScenes = parseResult.scenes;
        modelUsedName = parseResult.modelUsed || modelConfig.script.modelName;
      }

      const newScenes: SceneItem[] = parsedScenes.map((s, idx) => ({
        ...s,
        id: `sc_${Date.now()}_${idx}`,
        order: idx,
        cameraMotion: s.cameraMotion || 'zoom_in',
        transition: 'fade',
        status: 'pending',
        duration: s.estimatedDuration || 4.0,
      }));

      // Requisito 30: Minutos estimados = suma de estimatedDuration de las escenas
      const totalEstimatedSeconds = newScenes.reduce((acc, sc) => acc + (sc.duration || 4.0), 0);
      const estimatedMinutes = Math.max(0.1, totalEstimatedSeconds / 60).toFixed(1);

      const updatedProj: VideoProject = {
        ...proj,
        title: parsedTitle || proj.title,
        rawScript: text,
        scenes: newScenes,
        status: 'draft',
        updatedAt: Date.now(),
      };
      projectRef.current = updatedProj;
      onProjectUpdated(updatedProj);
      await saveProject(updatedProj);

      await addChatMessage({
        sender: 'assistant',
        text: `Recibí tu guion. Detecté ${newScenes.length} escenas, aproximadamente ${estimatedMinutes} minutos (usando: ${modelUsedName}). Configura las opciones o inicia la generación:`,
        widgetType: 'script_parsed',
      });
    } catch (err: any) {
      console.warn('Error en parse de guion, recurriendo a estructuración local de respaldo:', err);
      // Fallback local garantizado para que NUNCA muera ni se quede pensando
      const fallbackBlocks = splitScriptIntoBlocks(text);
      const fallbackScenes: SceneItem[] = fallbackBlocks.map((b, idx) => {
        const narr = cleanNarration(b.rawContent || b.headerTitle);
        const estDur = Math.max(3.0, narr.split(/\s+/).length / 2.3);
        return {
          id: `sc_${Date.now()}_${idx}`,
          order: idx,
          title: b.headerTitle,
          narrationText: narr,
          visualDescription: b.localVisualDescription || b.headerTitle,
          visualPrompt: `${proj.visualStyle || WHITEBOARD_PROMPT}: ${b.localVisualDescription || b.headerTitle}`,
          duration: estDur,
          cameraMotion: 'zoom_in',
          transition: 'fade',
          status: 'pending',
          keywords: ['clave', 'resumen'],
        };
      });

      const totalEstimatedSeconds = fallbackScenes.reduce((acc, sc) => acc + (sc.duration || 4.0), 0);
      const estimatedMinutes = Math.max(0.1, totalEstimatedSeconds / 60).toFixed(1);

      const updatedProj: VideoProject = {
        ...proj,
        rawScript: text,
        scenes: fallbackScenes,
        status: 'draft',
        updatedAt: Date.now(),
      };
      projectRef.current = updatedProj;
      onProjectUpdated(updatedProj);
      await saveProject(updatedProj);

      await addChatMessage({
        sender: 'assistant',
        text: `Recibí tu guion y lo he estructurado en ${fallbackScenes.length} escenas (${estimatedMinutes} min aprox.) usando el motor inteligente de respaldo. Configura las opciones o inicia la generación:`,
        widgetType: 'script_parsed',
      });
    }
  };

  // Requisito 18: ChatView.handleSendMessage:
  // Un mensaje es un guion nuevo solo si (a) hay archivo adjunto, o (b) el proyecto no tiene escenas Y el texto tiene más de 120 caracteres, o (c) el proyecto no tiene escenas y empieza con "##".
  // Un mensaje que mencione "escena N" en un proyecto con escenas es SIEMPRE un comando, nunca un guion.
  // Si no hay escenas y el mensaje es corto responde: "Pega o adjunta tu guion para empezar."
  // Nunca reemplaces las escenas existentes sin confirmación con botones "Reemplazar guion" / "Cancelar".
  const handleSendMessage = async () => {
    // Requisito 16: Bloquea el envío si isSending o isGenerating
    if (isSending || isGenerating) return;

    const textToSend = inputMessage.trim();
    if (!textToSend && !pendingScriptAttachment) return;

    setInputMessage('');
    const attachmentInfo = pendingScriptAttachment
      ? {
          name: pendingScriptAttachment.fileName,
          type: 'script' as const,
          snippet: pendingScriptAttachment.preview,
        }
      : undefined;

    setPendingScriptAttachment(null);
    setIsSending(true);

    const proj = ensureProject();
    const hasScenes = proj.scenes && proj.scenes.length > 0;
    const hasAttachment = Boolean(attachmentInfo);
    const mentionsSceneN = /\bescena\s*\d+\b/i.test(textToSend);

    // Requisito 3: Comandos de modelos por chat ("usa la voz local", etc.)
    const lower = textToSend.toLowerCase();
    const activeModels = proj.modelConfig || getStoredDefaultModels();

    if (lower.includes('usa la voz local') || lower.includes('voz local') || lower.includes('cambia a voz local')) {
      const newConfig: TaskModelConfig = {
        ...activeModels,
        voice: {
          provider: 'local',
          modelId: 'local-voice-piper',
          modelName: 'Piper TTS Español (Local)',
          tier: 'light',
        },
      };
      await handleSaveModelConfig(newConfig, false);
      await addChatMessage({ sender: 'user', text: textToSend });
      await addChatMessage({
        sender: 'assistant',
        text: 'Configuración actualizada: Ahora la tarea de **Voz** usará el modelo local en el navegador (Piper TTS en español) sin depender de la cuota de Gemini.',
      });
      setIsSending(false);
      return;
    }

    if (lower.includes('usa el guion local') || lower.includes('guion local') || lower.includes('guión local')) {
      const newConfig: TaskModelConfig = {
        ...activeModels,
        script: {
          provider: 'local',
          modelId: 'local-script-light',
          modelName: 'Qwen2.5 0.5B (Local)',
          tier: 'light',
        },
      };
      await handleSaveModelConfig(newConfig, false);
      await addChatMessage({ sender: 'user', text: textToSend });
      await addChatMessage({
        sender: 'assistant',
        text: 'Configuración actualizada: Ahora la tarea de **Guion** usará el modelo local en el navegador.',
      });
      setIsSending(false);
      return;
    }

    if (lower.includes('usa la voz de gemini') || lower.includes('voz gemini') || lower.includes('voz de la nube')) {
      const newConfig: TaskModelConfig = {
        ...activeModels,
        voice: {
          provider: 'gemini',
          modelId: 'gemini-3.8-flash-lite-tts',
          modelName: 'Gemini Flash Lite TTS',
          tier: 'medium',
        },
      };
      await handleSaveModelConfig(newConfig, false);
      await addChatMessage({ sender: 'user', text: textToSend });
      await addChatMessage({
        sender: 'assistant',
        text: 'Configuración actualizada: Ahora la tarea de **Voz** usará Gemini TTS en la nube.',
      });
      setIsSending(false);
      return;
    }

    // Regla de nuevo guion (Requisito 18)
    const isNewScript =
      !hasScenes &&
      (hasAttachment || textToSend.length > 70 || textToSend.startsWith('##'));

    // Si el proyecto ya tiene escenas y el mensaje califica como nuevo guion (y no es un comando de escena N):
    const looksLikeNewScriptForExisting =
      hasScenes &&
      !mentionsSceneN &&
      (hasAttachment || textToSend.length > 120 || textToSend.startsWith('##'));

    if (looksLikeNewScriptForExisting) {
      await addChatMessage({ sender: 'user', text: textToSend, attachment: attachmentInfo });
      setPendingScriptToReplace({ text: textToSend, attachment: attachmentInfo });
      await addChatMessage({
        sender: 'assistant',
        text: 'Este proyecto ya cuenta con escenas creadas. ¿Deseas reemplazar el guion actual o conservar las escenas existentes?',
        widgetType: 'confirm_replace_script',
      });
      setIsSending(false);
      return;
    }

    // Si no tiene escenas y es un nuevo guion estructurado o texto largo:
    if (isNewScript) {
      await addChatMessage({ sender: 'user', text: textToSend, attachment: attachmentInfo });
      setIsTyping(true);
      await processAndParseScript(textToSend);
      setIsTyping(false);
      setIsSending(false);
      return;
    }

    // De lo contrario, es una orden, conversación o ajuste inteligente (incluyendo saludos, preguntas, o "escena N")
    await addChatMessage({ sender: 'user', text: textToSend, attachment: attachmentInfo });
    setIsTyping(true);

    try {
      const commandRes = await sendChatCommand(textToSend, proj);
      setIsTyping(false);

      if (commandRes.understood) {
        let actionApplied = false;
        let updatedProj = { ...proj };

        if (commandRes.actionType === 'change_voice' && commandRes.parameters?.voiceName) {
          updatedProj.voiceName = commandRes.parameters.voiceName;
          actionApplied = true;
        } else if (
          commandRes.actionType === 'change_aspect_ratio' &&
          commandRes.parameters?.aspectRatio
        ) {
          updatedProj.aspectRatio = commandRes.parameters.aspectRatio as AspectRatio;
          actionApplied = true;
        } else if (
          commandRes.actionType === 'change_style' &&
          commandRes.parameters?.visualStyle
        ) {
          updatedProj.visualStyle = commandRes.parameters.visualStyle;
          actionApplied = true;
        } else if (
          commandRes.actionType === 'change_music' &&
          commandRes.parameters?.presetType
        ) {
          updatedProj.music = {
            ...updatedProj.music,
            type: 'preset',
            presetType: commandRes.parameters.presetType as any,
          };
          actionApplied = true;
        } else if (
          commandRes.actionType === 'edit_scene' &&
          typeof commandRes.parameters?.sceneIndex === 'number'
        ) {
          // Arreglar / corregir errores en textos de escenas
          const idx = commandRes.parameters.sceneIndex;
          if (updatedProj.scenes[idx]) {
            const targetScene = updatedProj.scenes[idx];
            const newText = commandRes.parameters.newNarrationText || targetScene.narrationText;
            const newDuration = Math.max(2.5, newText.split(/\s+/).length / 2.3);
            updatedProj.scenes[idx] = {
              ...targetScene,
              narrationText: newText,
              duration: newDuration,
              audioUrl: undefined, // Invalidar audio viejo para que se regenere con la corrección
              status: 'pending',
              voiceOutdated: true,
            };
            actionApplied = true;
          }
        } else if (
          commandRes.actionType === 'create_script' &&
          commandRes.parameters?.scenes &&
          Array.isArray(commandRes.parameters.scenes)
        ) {
          // Creación de guion a partir de una idea enviada al chatbot
          const generatedScenes: SceneItem[] = commandRes.parameters.scenes.map((s: any, idx: number) => ({
            id: `sc_${Date.now()}_${idx}`,
            order: idx,
            title: s.title || `Escena ${idx + 1}`,
            narrationText: s.narrationText || '',
            visualDescription: s.visualDescription || s.title || 'Ilustración explicativa',
            visualPrompt: s.visualPrompt || `${updatedProj.visualStyle || WHITEBOARD_PROMPT}: ${s.title}`,
            duration: s.estimatedDuration || 4.0,
            cameraMotion: s.cameraMotion || 'zoom_in',
            transition: 'fade',
            status: 'pending',
            keywords: s.keywords || ['clave'],
          }));
          updatedProj.scenes = generatedScenes;
          if (commandRes.parameters.title) {
            updatedProj.title = commandRes.parameters.title;
          }
          actionApplied = true;
        } else if (
          commandRes.actionType === 'regenerate_image' &&
          typeof commandRes.parameters?.sceneIndex === 'number'
        ) {
          const idx = commandRes.parameters.sceneIndex;
          if (updatedProj.scenes[idx]) {
            const targetScene = updatedProj.scenes[idx];
            const promptToUse = commandRes.parameters.customPrompt || targetScene.visualPrompt;
            const imgRes = await generateImageWithGemini(
              promptToUse,
              updatedProj.aspectRatio,
              {
                title: targetScene.title,
                narrationText: targetScene.narrationText,
                keywords: targetScene.keywords,
              }
            );
            updatedProj.scenes[idx] = {
              ...targetScene,
              imageUrl: imgRes.imageUrl,
              isFallbackImage: imgRes.isFallback,
              status: 'ready',
            };
            actionApplied = true;
          }
        } else if (
          commandRes.actionType === 'regenerate_voice' &&
          typeof commandRes.parameters?.sceneIndex === 'number'
        ) {
          const idx = commandRes.parameters.sceneIndex;
          if (updatedProj.scenes[idx]) {
            const targetScene = updatedProj.scenes[idx];
            const voiceRes = await generateVoiceWithGemini(
              targetScene.narrationText,
              updatedProj.voiceName,
              updatedProj.voiceSpeed,
              updatedProj.voiceTone
            );
            const duration = await getAudioDuration(voiceRes.audioUrl);
            updatedProj.scenes[idx] = {
              ...targetScene,
              audioUrl: voiceRes.audioUrl,
              duration: Math.max(2.5, duration + 0.3),
              status: 'ready',
              voiceOutdated: false,
            };
            actionApplied = true;
          }
        } else if (commandRes.actionType === 'start_generation') {
          // El usuario ordenó: "haz el video", "genera el video", "empieza", etc.
          const isTest = Boolean(commandRes.parameters?.testMode);
          await addChatMessage({
            sender: 'assistant',
            text: commandRes.replyMessage || (isTest ? 'Iniciando prueba rápida con 2 escenas...' : 'Iniciando generación de video completo...'),
          });
          setIsSending(false);
          setTimeout(() => {
            runGenerationPipeline(isTest);
          }, 150);
          return;
        }

        if (actionApplied) {
          projectRef.current = updatedProj;
          onProjectUpdated(updatedProj);
          await saveProject(updatedProj);
        }

        await addChatMessage({
          sender: 'assistant',
          text: commandRes.replyMessage,
          widgetType: commandRes.actionType === 'create_script' ? 'script_parsed' : undefined,
        });

        // Si se pidió crear y arrancar de una vez
        if (commandRes.actionType === 'create_script' && commandRes.parameters?.autoStart) {
          setTimeout(() => {
            runGenerationPipeline(false);
          }, 400);
        }
      } else {
        await addChatMessage({
          sender: 'assistant',
          text: commandRes.replyMessage || 'Te escucho. Dime qué ajuste o consulta deseas hacer sobre tu video.',
        });
      }
    } catch (cmdErr: any) {
      setIsTyping(false);
      console.warn('Error en comando de chat:', cmdErr);
      await addChatMessage({
        sender: 'assistant',
        text: 'Te escucho. Puedes decirme qué cambio deseas hacer en las escenas, pedirme que cree un guion sobre algún tema, o pegar tu texto directamente.',
      });
    }

    setIsSending(false);
  };

  // Confirmar o cancelar reemplazo de guion (Requisito 18)
  const handleConfirmReplaceScript = async () => {
    if (!pendingScriptToReplace) return;
    const text = pendingScriptToReplace.text;
    setPendingScriptToReplace(null);
    setIsTyping(true);
    await processAndParseScript(text);
    setIsTyping(false);
  };

  const handleCancelReplaceScript = () => {
    setPendingScriptToReplace(null);
    showToast('Guion conservado sin cambios', 'info');
  };

  // Requisito 14: Cancelar de verdad
  const handleStopGeneration = () => {
    isCancelledRef.current = true;
    pipelineRunningRef.current = false;
    activeRunIdRef.current = 0;
    setIsGenerating(false);
    setGenerationStepText('');
    setQuotaCountdown(null);
    setQuotaAlertActive(false);
    showToast('Generación detenida', 'info');
  };

  // Requisito 13: Acciones de cuota
  const handleSwitchToLocalVoiceAndResume = async () => {
    setQuotaAlertActive(false);
    const proj = ensureProject();
    const currentConfig = proj.modelConfig || getStoredDefaultModels();
    const newConfig: TaskModelConfig = {
      ...currentConfig,
      voice: {
        provider: 'local',
        modelId: 'local-voice-piper',
        modelName: 'Piper TTS Español (Local)',
        tier: 'light',
      },
    };
    await handleSaveModelConfig(newConfig, true);
    await addChatMessage({
      sender: 'assistant',
      text: 'Cambiado a **Piper TTS Español (Local)**. Continuando la generación en el navegador sin cuota...',
    });
    runGenerationPipeline(false);
  };

  const handleWaitOneMinuteAndRetry = async () => {
    setQuotaAlertActive(false);
    setQuotaCountdown(60);
    for (let c = 60; c > 0; c--) {
      if (isCancelledRef.current) break;
      setQuotaCountdown(c);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setQuotaCountdown(null);
    runGenerationPipeline(false);
  };

  // Requisito 26: Reintentar solo las escenas con error
  const handleRetryFailedScenes = () => {
    runGenerationPipeline(false, true);
  };

  // =========================================================================
  // Pipeline de Generación Robusto (Requisitos 12, 13, 14, 17, 22, 26, 27)
  // =========================================================================
  const runGenerationPipeline = async (testMode: boolean = false, retryFailedOnly: boolean = false) => {
    // Requisito 14: Un solo proceso con bloqueo y runId
    if (pipelineRunningRef.current) {
      console.warn('Pipeline ya en ejecución. Evitando proceso duplicado.');
      return;
    }
    pipelineRunningRef.current = true;
    const runId = Date.now();
    activeRunIdRef.current = runId;

    const proj = projectRef.current;
    if (!proj || proj.scenes.length === 0) {
      pipelineRunningRef.current = false;
      return;
    }

    isCancelledRef.current = false;
    setIsGenerating(true);
    setVoiceWarning(false);
    setQuotaCountdown(null);
    setQuotaAlertActive(false);
    setShowGenericChoice(false);

    const progressMsgId = `progress_${Date.now()}`;
    await addChatMessage({
      sender: 'assistant',
      text: testMode
        ? 'Iniciando prueba rápida con 2 escenas...'
        : retryFailedOnly
        ? 'Reintentando escenas con error...'
        : 'Iniciando generación de video completo...',
      widgetType: 'generating_progress',
      widgetData: { progressMsgId },
    });

    const targetSceneCount = testMode ? Math.min(2, proj.scenes.length) : proj.scenes.length;

    try {
      for (let i = 0; i < targetSceneCount; i++) {
        if (isCancelledRef.current || activeRunIdRef.current !== runId) break;

        // Requisito 27: En cada iteración lee projectRef.current de forma inmutable
        let currentProj = projectRef.current || proj;
        let scene = { ...currentProj.scenes[i] };

        // Si reintentamos solo las que fallaron, saltar las listas
        if (retryFailedOnly && scene.status === 'ready' && scene.imageUrl && scene.audioUrl) {
          continue;
        }

        const modelConfig = currentProj.modelConfig || getStoredDefaultModels();

        // 1. GENERACIÓN DE IMAGEN
        if (!scene.imageUrl || scene.status === 'error') {
          setGenerationStepText(`Dibujando escena ${i + 1} de ${targetSceneCount}…`);
          scene.status = 'generating_image';

          let updatedScenes = [...currentProj.scenes];
          updatedScenes[i] = scene;
          let updatedProj = { ...currentProj, scenes: updatedScenes, updatedAt: Date.now() };
          projectRef.current = updatedProj;
          onProjectUpdated(updatedProj);

          let imageSuccess = false;

          try {
            if (modelConfig.image.provider === 'internal') {
              const res = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: scene.visualPrompt,
                  aspectRatio: currentProj.aspectRatio,
                  title: scene.title,
                  narrationText: scene.narrationText,
                  keywords: scene.keywords,
                  modelId: 'internal-vector-illustrator',
                }),
              });
              const data = await res.json();
              scene.imageUrl = data.imageUrl;
              scene.isFallbackImage = true;
              imageSuccess = true;
            } else if (modelConfig.image.provider === 'local') {
              const res = await fetch('/api/image/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: scene.visualPrompt,
                  aspectRatio: currentProj.aspectRatio,
                  title: scene.title,
                  narrationText: scene.narrationText,
                  keywords: scene.keywords,
                  modelId: 'internal-vector-illustrator',
                }),
              });
              const data = await res.json();
              scene.imageUrl = data.imageUrl;
              scene.isFallbackImage = false;
              imageSuccess = true;
            } else {
              // Gemini en la nube
              let attempts = 0;
              const maxAttempts = currentProj.fallbackImagePreference === 'wait_retry' ? 3 : 1;

              while (attempts < maxAttempts && !imageSuccess && !isCancelledRef.current && activeRunIdRef.current === runId) {
                attempts++;
                try {
                  const imgRes = await generateImageWithGemini(
                    scene.visualPrompt,
                    currentProj.aspectRatio,
                    {
                      title: scene.title,
                      narrationText: scene.narrationText,
                      keywords: scene.keywords,
                    },
                    modelConfig.image.modelId
                  );

                  // Requisito 17: fallbackImagePreference
                  if (imgRes.isFallback) {
                    if (currentProj.fallbackImagePreference === 'ask') {
                      // PAUSAR y esperar la elección del usuario
                      scene.imageUrl = imgRes.imageUrl;
                      scene.isFallbackImage = true;
                      updatedScenes = [...currentProj.scenes];
                      updatedScenes[i] = scene;
                      updatedProj = { ...currentProj, scenes: updatedScenes, status: 'paused', updatedAt: Date.now() };
                      projectRef.current = updatedProj;
                      onProjectUpdated(updatedProj);
                      await saveProject(updatedProj);

                      setShowGenericChoice(true);
                      setGenerationStepText('Pausado: Esperando confirmación para estilo visual…');
                      pipelineRunningRef.current = false;
                      setIsGenerating(false);
                      return;
                    } else if (currentProj.fallbackImagePreference === 'wait_retry' && attempts < 3) {
                      setGenerationStepText(`Reintentando imagen de Gemini (${attempts}/3, esperando 20 s)…`);
                      await new Promise((r) => setTimeout(r, 20000));
                      continue;
                    }
                  }

                  scene.imageUrl = imgRes.imageUrl;
                  scene.isFallbackImage = imgRes.isFallback;
                  imageSuccess = true;
                } catch (imgErr) {
                  console.warn(`Fallo intento ${attempts} de imagen:`, imgErr);
                  if (attempts < maxAttempts) {
                    await new Promise((r) => setTimeout(r, 20000));
                  }
                }
              }
            }
          } catch (err) {
            console.error('Error al generar imagen:', err);
          }

          // Requisito 22: si la imagen falla, marca la escena en error y haz "continue". Una escena solo es "lista" si tiene imagen y voz reales.
          if (!imageSuccess || !scene.imageUrl) {
            scene.status = 'error';
            scene.errorMessage = 'No se pudo generar la imagen.';
            updatedScenes = [...currentProj.scenes];
            updatedScenes[i] = scene;
            updatedProj = { ...currentProj, scenes: updatedScenes, updatedAt: Date.now() };
            projectRef.current = updatedProj;
            onProjectUpdated(updatedProj);
            await saveProject(updatedProj);
            continue; // Requisito 22
          }

          updatedScenes = [...currentProj.scenes];
          updatedScenes[i] = scene;
          updatedProj = { ...currentProj, scenes: updatedScenes, updatedAt: Date.now() };
          projectRef.current = updatedProj;
          onProjectUpdated(updatedProj);
          await saveProject(updatedProj);
        }

        if (isCancelledRef.current || activeRunIdRef.current !== runId) break;

        // 2. GENERACIÓN DE VOZ
        if (!scene.audioUrl || scene.status !== 'ready') {
          setGenerationStepText(`Grabando voz para escena ${i + 1} de ${targetSceneCount}…`);
          scene.status = 'generating_voice';

          let updatedScenes = [...currentProj.scenes];
          updatedScenes[i] = scene;
          let updatedProj = { ...currentProj, scenes: updatedScenes, updatedAt: Date.now() };
          projectRef.current = updatedProj;
          onProjectUpdated(updatedProj);

          let voiceSuccess = false;

          if (modelConfig.voice.provider === 'local') {
            try {
              const localRes = await generateLocalVoice(
                scene.narrationText,
                modelConfig.voice.tier || 'light'
              );
              scene.audioUrl = localRes.audioUrl;
              scene.duration = Math.max(2.5, localRes.duration + 0.3);
              scene.status = 'ready'; // Requisito 22: imagen y voz reales
              scene.voiceOutdated = false;
              voiceSuccess = true;
            } catch (err: any) {
              console.error('Error voz local:', err);
              scene.status = 'error';
              scene.errorMessage = 'Error en síntesis local de voz';
            }
          } else if (modelConfig.voice.provider === 'internal') {
            try {
              const res = await generateLocalVoice(scene.narrationText, 'light');
              scene.audioUrl = res.audioUrl;
              scene.duration = Math.max(2.5, res.duration + 0.3);
              scene.status = 'ready';
              scene.voiceOutdated = false;
              voiceSuccess = true;
            } catch {
              scene.status = 'error';
            }
          } else {
            // Gemini en la nube (Requisito 13: reintenta MÁXIMO 2 veces: 20 s y 40 s)
            const delays = [20, 40];
            let retryCount = 0;

            while (!voiceSuccess && !isCancelledRef.current && activeRunIdRef.current === runId) {
              try {
                const voiceRes = await generateVoiceWithGemini(
                  scene.narrationText,
                  currentProj.voiceName,
                  currentProj.voiceSpeed,
                  currentProj.voiceTone,
                  modelConfig.voice.modelId
                );

                const realDuration = await getAudioDuration(voiceRes.audioUrl);
                scene.audioUrl = voiceRes.audioUrl;
                scene.duration = Math.max(2.5, realDuration + 0.3);
                scene.status = 'ready'; // Requisito 22: imagen y voz reales
                scene.voiceOutdated = false;
                voiceSuccess = true;
              } catch (vErr: any) {
                // Requisito 13: Si cuota agotada, reintenta MÁXIMO 2 veces (20 s y 40 s)
                if (vErr?.isQuotaError) {
                  if (retryCount < delays.length) {
                    const waitSec = delays[retryCount];
                    retryCount++;
                    setQuotaCountdown(waitSec);
                    setGenerationStepText(
                      `Cuota Gemini agotada. Reintento ${retryCount}/2 en ${waitSec} s…`
                    );

                    for (let c = waitSec; c > 0; c--) {
                      if (isCancelledRef.current || activeRunIdRef.current !== runId) break;
                      setQuotaCountdown(c);
                      await new Promise((r) => setTimeout(r, 1000));
                    }
                    setQuotaCountdown(null);
                  } else {
                    // Requisito 13: Si sigue fallando tras 2 reintentos, NO esperar más
                    updatedProj = { ...currentProj, status: 'paused', updatedAt: Date.now() };
                    projectRef.current = updatedProj;
                    onProjectUpdated(updatedProj);
                    await saveProject(updatedProj);

                    setQuotaAlertActive(true);
                    pipelineRunningRef.current = false;
                    setIsGenerating(false);

                    await addChatMessage({
                      sender: 'assistant',
                      text: 'La cuota gratuita de Gemini para voz se ha agotado tras 2 reintentos (20 s y 40 s). Elige cómo continuar:',
                      widgetType: 'quota_alert',
                    });
                    return; // Fin sin bucle infinito
                  }
                } else {
                  scene.status = 'error';
                  scene.errorMessage = 'Error en síntesis de voz.';
                  break;
                }
              }
            }
          }

          updatedScenes = [...currentProj.scenes];
          updatedScenes[i] = scene;
          updatedProj = { ...currentProj, scenes: updatedScenes, updatedAt: Date.now() };
          projectRef.current = updatedProj;
          onProjectUpdated(updatedProj);
          await saveProject(updatedProj);
        }
      }

      // Requisito 26:
      // Al terminar "Probar con 2 escenas" muestra tarjeta "Prueba lista" con reproductor, "Exportar prueba" y "Generar video completo".
      // En el modo completo, si alguna escena falló muestra un mensaje con la lista de escenas con error y un botón "Reintentar las que fallaron".
      const finalProj = projectRef.current || proj;
      const testedScenes = testMode ? finalProj.scenes.slice(0, 2) : finalProj.scenes;
      const testAllReady = testedScenes.every((s) => s.status === 'ready' && s.imageUrl && s.audioUrl);

      if (testMode && testAllReady) {
        finalProj.testMode = true;
        onProjectUpdated({ ...finalProj });
        await saveProject(finalProj);

        await addChatMessage({
          sender: 'assistant',
          text: '¡Prueba de 2 escenas completada con éxito! Puedes reproducirla, exportar la prueba o generar el video completo:',
          widgetType: 'test_ready',
        });
      } else if (!testMode) {
        const failedIndices = finalProj.scenes
          .map((s, idx) => (s.status === 'error' || !s.imageUrl || !s.audioUrl ? idx + 1 : null))
          .filter(Boolean) as number[];

        if (failedIndices.length > 0) {
          setFailedScenesIndices(failedIndices);
          await addChatMessage({
            sender: 'assistant',
            text: `La generación finalizó pero ${failedIndices.length} escena(s) presentaron errores (escenas: ${failedIndices.join(', ')}). Puedes reintentarlas:`,
            widgetType: 'failed_scenes_alert',
            widgetData: { failedIndices },
          });
        } else {
          finalProj.status = 'ready';
          onProjectUpdated({ ...finalProj });
          await saveProject(finalProj);

          await addChatMessage({
            sender: 'assistant',
            text: '¡Tu video está listo! Puedes reproducirlo, descargarlo, exportar el audio o editar las escenas:',
            widgetType: 'video_ready',
          });
        }
      }
    } finally {
      pipelineRunningRef.current = false;
      setIsGenerating(false);
      setGenerationStepText('');
      setQuotaCountdown(null);
    }
  };

  // Re-generate individual scene image with Gemini
  const handleRetrySceneWithGemini = async (sceneIndex: number) => {
    const proj = projectRef.current;
    if (!proj || !proj.scenes[sceneIndex]) return;

    showToast(`Reintentando imagen de escena #${sceneIndex + 1} con Gemini...`, 'info');
    try {
      const scene = proj.scenes[sceneIndex];
      const imgRes = await generateImageWithGemini(scene.visualPrompt, proj.aspectRatio, {
        title: scene.title,
        narrationText: scene.narrationText,
        keywords: scene.keywords,
      });

      proj.scenes[sceneIndex] = {
        ...scene,
        imageUrl: imgRes.imageUrl,
        isFallbackImage: imgRes.isFallback,
        status: 'ready',
      };
      onProjectUpdated({ ...proj });
      await saveProject(proj);
      showToast('Imagen actualizada', 'success');
    } catch {
      showToast('No se pudo generar la imagen con Gemini.', 'error');
    }
  };

  // Dedicated Play Scene Voice
  const handleTestVoiceAudio = async () => {
    const proj = projectRef.current;
    if (!proj || proj.scenes.length === 0) return;
    const firstScene = proj.scenes.find((s) => s.audioUrl);
    if (!firstScene?.audioUrl) {
      showToast('No hay narración de voz grabada todavía.', 'info');
      return;
    }
    const audio = new Audio(firstScene.audioUrl);
    audio.play().catch(() => {});
    showToast(`Reproduciendo voz de escena: "${firstScene.title}"`, 'info');
  };

  // Export and download video (Requisitos 19 y 24)
  const handleExportFinalVideo = async () => {
    const proj = projectRef.current;
    if (!proj) return;

    setIsExporting(true);
    setExportProgress(0);
    setVoiceWarning(false);

    let composer: VideoComposer | null = null;

    try {
      const canvas = document.createElement('canvas');
      composer = new VideoComposer(canvas, proj);
      await composer.preloadAssets();

      // Check missing scenes
      const missing = composer.getMissingVoiceScenes();
      if (missing.length > 0) {
        showToast(
          `Falta voz en ${missing.length} escena(s). Genera lo que falta antes de exportar.`,
          'error'
        );
        setIsExporting(false);
        return;
      }

      showToast('No bloquees el celular ni cambies de app mientras se exporta', 'info');

      const result = await composer.exportVideo((pct) => setExportProgress(pct));
      const { blob, mimeType, hasVoice, maxVoicePeak } = result;

      const url = URL.createObjectURL(blob);
      setExportedVideoUrl(url);
      setExportedVideoBlob(blob);
      setVoiceVolumePeak(maxVoicePeak);

      // Requisito 19: Si el pico de voz es casi cero avisa en rojo, pero SÍ deja descargar con un botón "Descargar de todos modos"
      if (!hasVoice) {
        setVoiceWarning(true);
        showToast('Atención: Nivel de voz casi nulo en este video.', 'error');
        return;
      }

      // Auto download si tiene voz
      const safeTitle = (proj.title || 'video').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('¡Video exportado y descargado!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Error al empaquetar el video', 'error');
    } finally {
      // Requisito 24: llama a composer.destroy() en un finally
      if (composer) {
        composer.destroy();
      }
      setIsExporting(false);
    }
  };

  const handleForceDownload = () => {
    if (!exportedVideoUrl) return;
    const proj = projectRef.current;
    const safeTitle = (proj?.title || 'video').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const ext = exportedVideoBlob?.type?.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = exportedVideoUrl;
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Video descargado de todos modos', 'info');
  };

  // Requisito 18: Escuchar el video exportado antes de descargarlo
  const handleListenExportedVideo = () => {
    if (!exportedVideoUrl) {
      showToast('Primero genera la exportación del video.', 'info');
      return;
    }
    const audio = new Audio(exportedVideoUrl);
    setIsPlayingExportedAudio(true);
    audio.onended = () => setIsPlayingExportedAudio(false);
    audio.onerror = () => setIsPlayingExportedAudio(false);
    audio.play().catch(() => setIsPlayingExportedAudio(false));
  };

  // Requisito 23: Compartir video con navigator.share({ files })
  const handleShareVideo = async () => {
    if (!exportedVideoBlob || !exportedVideoUrl) {
      showToast('Exporta el video antes de compartirlo.', 'info');
      return;
    }
    const proj = projectRef.current;
    const title = proj?.title || 'video';
    const fileName = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mp4`;
    const file = new File([exportedVideoBlob], fileName, { type: exportedVideoBlob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: proj?.title,
          text: `Mira este video creado con AutoVideo IA: "${proj?.title}"`,
        });
        showToast('Video compartido', 'success');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: descargar
    const a = document.createElement('a');
    a.href = exportedVideoUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Requisito 26: Renderizar miniatura con salto de línea por palabras y subtítulo editable
  const drawThumbnailCanvas = () => {
    const canvas = thumbnailCanvasRef.current;
    const proj = projectRef.current;
    if (!canvas || !proj) return;

    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mainImgSrc = proj.scenes.find((s) => s.imageUrl)?.imageUrl;

    const renderOverlay = () => {
      // Gradient dark scrim
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, 'rgba(15,23,42,0.4)');
      grad.addColorStop(0.7, 'rgba(15,23,42,0.75)');
      grad.addColorStop(1, 'rgba(10,15,29,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Neon Frame
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 14;
      ctx.strokeRect(8, 8, 1264, 704);

      // Subtitle Pill
      const sub = (thumbnailSubtitle || 'EDICIÓN ESPECIAL').toUpperCase();
      ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
      const subMetrics = ctx.measureText(sub);
      const pillW = subMetrics.width + 48;
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.roundRect(80, 80, pillW, 52, 14);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sub, 104, 106);

      // Main Title with word wrapping (Requisito 26)
      const rawTitle = (proj.title || 'TÍTULO DEL VIDEO').toUpperCase();
      ctx.font = '900 64px "Plus Jakarta Sans", sans-serif';
      ctx.textBaseline = 'top';

      const words = rawTitle.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';

      for (const w of words) {
        const testLine = currentLine ? `${currentLine} ${w}` : w;
        if (ctx.measureText(testLine).width > 1050 && currentLine) {
          lines.push(currentLine);
          currentLine = w;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      let yOffset = 180;
      lines.slice(0, 3).forEach((line, lIdx) => {
        ctx.lineWidth = 12;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(line, 80, yOffset);

        ctx.fillStyle = lIdx === 1 ? '#facc15' : '#ffffff';
        ctx.fillText(line, 80, yOffset);
        yOffset += 78;
      });
    };

    if (mainImgSrc) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1280, 720);
        renderOverlay();
      };
      img.onerror = () => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 1280, 720);
        renderOverlay();
      };
      img.src = mainImgSrc;
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1280, 720);
      renderOverlay();
    }
  };

  const handleOpenThumbnailModal = () => {
    setShowThumbnailModal(true);
    setTimeout(() => drawThumbnailCanvas(), 100);
  };

  const handleDownloadThumbnail = () => {
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `miniatura_${projectRef.current?.title || 'video'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // SEO Modal Generator
  const handleOpenSeoModal = async () => {
    setShowSeoModal(true);
    if (seoMetadata) return;
    setIsGeneratingSeo(true);
    try {
      const proj = projectRef.current;
      const meta = await generateYouTubeMetadata(proj?.rawScript || '', proj?.title);
      setSeoMetadata(meta);
    } catch {
      showToast('No se pudo generar metadatos de YouTube.', 'error');
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleCopyClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showToast('Copiado al portapapeles', 'info');
  };

  const activeProj = currentProject || projectRef.current;
  const geminiImageCount = activeProj?.scenes.filter((s) => s.imageUrl && !s.isFallbackImage).length || 0;
  const totalImageCount = activeProj?.scenes.filter((s) => s.imageUrl).length || 0;

  return (
    <div className="relative flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleScriptFileSelected}
        accept=".txt,.md,.docx"
        className="hidden"
      />
      <input
        type="file"
        ref={musicInputRef}
        onChange={handleMusicFileSelected}
        accept="audio/*"
        className="hidden"
      />

      {/* TOP BAR */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-3 sm:px-5 py-3 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 pt-safe">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95"
            title="Mis proyectos"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex flex-col ml-1">
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              AutoVideo IA
            </span>
            <span className="text-sm font-bold text-white truncate max-w-[170px] sm:max-w-xs">
              {activeProj?.title || 'Nuevo Chat'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeProj?.scenes && activeProj.scenes.length > 0 && (
            <button
              onClick={onOpenEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              <Film className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Editor</span>
            </button>
          )}

          <button
            onClick={onNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo chat</span>
          </button>
        </div>
      </header>

      {/* CHAT MESSAGES CONVERSATION AREA */}
      <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 scroll-smooth">
        {/* Count badge of Gemini images vs fallback (Requisito 5) */}
        {activeProj && activeProj.scenes.length > 0 && totalImageCount > 0 && (
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-300 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>
                <strong>{geminiImageCount}</strong> de <strong>{activeProj.scenes.length}</strong> escenas con imagen de Gemini
              </span>
            </div>
          </div>
        )}

        {/* Message List */}
        {(!activeProj?.chatHistory || activeProj.chatHistory.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Comienza tu video con IA</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Escribe un tema, pega un guion o adjunta un archivo (.txt, .md, .docx). Crearé las escenas, voces y subtítulos para ti.
            </p>

            <div className="grid grid-cols-1 gap-2 w-full text-left">
              <button
                onClick={() => setInputMessage('5 curiosidades sobre el cerebro humano que no conocías')}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition"
              >
                💡 "5 curiosidades sobre el cerebro humano"
              </button>
              <button
                onClick={() => setInputMessage('Consejos rápidos para ahorrar dinero cada mes')}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition"
              >
                💰 "Consejos rápidos para ahorrar dinero cada mes"
              </button>
            </div>
          </div>
        ) : (
          activeProj.chatHistory.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-lg rounded-2xl p-4 shadow-md text-sm leading-relaxed ${
                    isUser
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-br-none'
                      : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {/* File Attachment preview */}
                  {msg.attachment && (
                    <div className="mb-2.5 p-2.5 rounded-xl bg-black/25 border border-white/10 text-xs flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-300 shrink-0" />
                      <div className="truncate flex-1">
                        <span className="font-semibold">{msg.attachment.name}</span>
                        {msg.attachment.snippet && (
                          <p className="text-[11px] opacity-75 truncate">{msg.attachment.snippet}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Main Bubble Text */}
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* WIDGET: Script Parsed & Settings Chips (Flow Step 2) */}
                  {msg.widgetType === 'script_parsed' && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4">
                      {/* Chips Row: Voice, Style, Format, Music */}
                      <div className="space-y-3">
                        {/* Voice Selection Chip */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase">
                              Voz Gemini
                            </span>
                            <button
                              onClick={() => handlePlayVoiceSample(activeProj.voiceName)}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>{voiceSamplePlaying === activeProj.voiceName ? 'Sonando...' : 'Muestra'}</span>
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {VOICES.map((v) => (
                              <button
                                key={v.id}
                                onClick={async () => {
                                  const upd = { ...activeProj, voiceName: v.id };
                                  onProjectUpdated(upd);
                                  await saveProject(upd);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                  activeProj.voiceName === v.id
                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Visual Style Selection Chip */}
                        <div>
                          <span className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                            Estilo Visual
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {VISUAL_STYLES.map((st) => (
                              <button
                                key={st.id}
                                onClick={async () => {
                                  const upd = { ...activeProj, visualStyle: st.id };
                                  onProjectUpdated(upd);
                                  await saveProject(upd);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                  activeProj.visualStyle === st.id
                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {st.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Aspect Ratio Chip */}
                        <div>
                          <span className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                            Formato
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                const upd: VideoProject = { ...activeProj, aspectRatio: '16:9' };
                                onProjectUpdated(upd);
                                await saveProject(upd);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border text-center transition ${
                                activeProj.aspectRatio === '16:9'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              Horizontal (16:9)
                            </button>
                            <button
                              onClick={async () => {
                                const upd: VideoProject = { ...activeProj, aspectRatio: '9:16' };
                                onProjectUpdated(upd);
                                await saveProject(upd);
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border text-center transition ${
                                activeProj.aspectRatio === '9:16'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              Vertical Shorts (9:16)
                            </button>
                          </div>
                        </div>

                        {/* Music Chip */}
                        <div>
                          <span className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                            Música de Fondo
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {MUSIC_PRESETS.map((m) => (
                              <button
                                key={m.id}
                                onClick={async () => {
                                  const upd: VideoProject = {
                                    ...activeProj,
                                    music: {
                                      ...activeProj.music,
                                      type: m.id === 'none' ? 'none' : 'preset',
                                      presetType: m.id as any,
                                      name: m.name,
                                    },
                                  };
                                  onProjectUpdated(upd);
                                  await saveProject(upd);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                  activeProj.music.type === 'none' && m.id === 'none'
                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                    : activeProj.music.type === 'preset' && activeProj.music.presetType === m.id
                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Main Action Buttons (Flow Step 3) */}
                      <div className="pt-2 flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => runGenerationPipeline(true)}
                          disabled={isGenerating}
                          className="flex-1 py-2.5 px-3 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Probar con 2 escenas</span>
                        </button>

                        <button
                          onClick={() => runGenerationPipeline(false)}
                          disabled={isGenerating}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generar video completo</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* WIDGET: Live Generating Progress (Flow Step 4) */}
                  {msg.widgetType === 'generating_progress' && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                      {generationStepText && (
                        <div className="flex items-center gap-2 text-xs text-indigo-300 font-semibold animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{generationStepText}</span>
                        </div>
                      )}

                      {/* Quota countdown notice (Requisito 1) */}
                      {quotaCountdown !== null && (
                        <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Límite de cuota alcanzado</span>
                          </div>
                          <p className="text-[11px] text-amber-300/80">
                            Progreso guardado. Reintentando en {quotaCountdown} s para no agotar la cuenta...
                          </p>
                          <button
                            onClick={() => {
                              isCancelledRef.current = true;
                              setQuotaCountdown(null);
                              setTimeout(() => runGenerationPipeline(false), 50);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs active:scale-95 transition"
                          >
                            Continuar donde me quedé
                          </button>
                        </div>
                      )}

                      {/* Choice for generic drawing vs wait (Requisito 6) */}
                      {showGenericChoice && (
                        <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/40 text-xs space-y-2.5">
                          <p className="font-semibold text-white">
                            Gemini tardó en una ilustración. ¿Cómo deseas continuar?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowGenericChoice(false);
                                activeProj.fallbackImagePreference = 'use_fallback';
                              }}
                              className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                            >
                              Usar dibujos genéricos
                            </button>
                            <button
                              onClick={() => {
                                setShowGenericChoice(false);
                                activeProj.fallbackImagePreference = 'wait_retry';
                              }}
                              className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                            >
                              Esperar y reintentar
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Scene Thumbnails List with status and retry */}
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                        {activeProj.scenes.map((sc, sIdx) => (
                          <div
                            key={sc.id}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800/80 text-xs"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="w-12 h-8 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                {sc.imageUrl ? (
                                  <img
                                    src={sc.imageUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[9px] text-slate-500">#{sIdx + 1}</span>
                                )}
                              </div>
                              <div className="truncate">
                                <span className="font-semibold text-white block truncate">
                                  {sc.title}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {sc.status === 'ready'
                                    ? 'Lista'
                                    : sc.status === 'generating_image'
                                    ? 'Dibujando…'
                                    : sc.status === 'generating_voice'
                                    ? 'Grabando voz…'
                                    : sc.status === 'outdated_voice'
                                    ? 'Voz desactualizada'
                                    : 'Pendiente'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {sc.isFallbackImage && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Ilustración genérica
                                </span>
                              )}
                              {sc.isFallbackImage && (
                                <button
                                  onClick={() => handleRetrySceneWithGemini(sIdx)}
                                  className="text-[10px] px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 font-semibold"
                                >
                                  Reintentar con Gemini
                                </button>
                              )}
                              {sc.status === 'ready' && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WIDGET: Final Card with Video Player & Actions (Flow Step 5) */}
                  {msg.widgetType === 'video_ready' && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3.5">
                      {/* Warning if voice level is almost zero (Requisito 17) */}
                      {voiceWarning && (
                        <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-500/60 text-red-100 text-xs font-bold space-y-1">
                          <div className="flex items-center gap-2 text-sm text-red-400">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span>Este video salió sin voz. No lo subas.</span>
                          </div>
                          <p className="text-[11px] font-normal text-red-200/90">
                            Verifica la voz de las escenas y vuelve a exportar.
                          </p>
                        </div>
                      )}

                      {/* Buttons Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Descargar Video */}
                        <button
                          onClick={handleExportFinalVideo}
                          disabled={isExporting}
                          className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 transition"
                        >
                          <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                          <span>{isExporting ? `Exportando (${exportProgress}%)…` : 'Descargar Video'}</span>
                        </button>

                        {/* Compartir */}
                        <button
                          onClick={handleShareVideo}
                          className="py-2.5 px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Share2 className="w-4 h-4" />
                          <span>Compartir</span>
                        </button>

                        {/* Escuchar voz */}
                        <button
                          onClick={handleTestVoiceAudio}
                          className="py-2 px-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Escuchar voz</span>
                        </button>

                        {/* Escuchar video exportado (Requisito 18) */}
                        <button
                          onClick={handleListenExportedVideo}
                          className="py-2 px-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isPlayingExportedAudio ? 'Sonando...' : 'Escuchar video exportado'}</span>
                        </button>

                        {/* Editar escenas (Flow Step 6) */}
                        <button
                          onClick={onOpenEditor}
                          className="py-2 px-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Film className="w-3.5 h-3.5 text-violet-400" />
                          <span>Editar escenas</span>
                        </button>

                        {/* YouTube SEO */}
                        <button
                          onClick={handleOpenSeoModal}
                          className="py-2 px-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          <span>Título y SEO YouTube</span>
                        </button>

                        {/* Miniatura */}
                        <button
                          onClick={handleOpenThumbnailModal}
                          className="sm:col-span-2 py-2 px-3 rounded-xl border border-indigo-500/30 bg-indigo-950/30 hover:bg-indigo-950/60 text-indigo-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Generar Miniatura 16:9</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start animate-in fade-in duration-150">
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="ml-2 font-medium text-slate-300">AutoVideo IA está pensando…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* BOTTOM INPUT BAR (Fixed, iPhone Safe Area) */}
      <footer className="w-full bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Requisito 1: Barra de resumen de modelos activa e interactiva */}
        <div className="max-w-4xl mx-auto mb-2">
          <button
            type="button"
            onClick={() => setIsModelSheetOpen(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-indigo-500/30 hover:border-indigo-400 text-xs text-indigo-200 hover:text-white transition shadow-sm group"
            title="Abrir selector de modelos para Guion, Imagen y Voz"
          >
            <div className="flex items-center gap-2 truncate">
              <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0 group-hover:rotate-12 transition-transform" />
              <span className="font-bold text-white shrink-0">Modelos:</span>
              <span className="text-slate-300 font-medium truncate text-[11px] sm:text-xs">
                {getModelSummaryText()}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 shrink-0">
              <span className="hidden sm:inline">Cambiar</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* Pending Attachment preview bar if any */}
        {pendingScriptAttachment && (
          <div className="mb-2 p-2 rounded-xl bg-slate-900 border border-indigo-500/40 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="truncate font-semibold">{pendingScriptAttachment.fileName}</span>
            </div>
            <button
              onClick={() => {
                setPendingScriptAttachment(null);
                setInputMessage('');
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* Plus button for attachment sheet */}
          <button
            onClick={() => setIsAttachmentSheetOpen(true)}
            className="w-11 h-11 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition shrink-0"
            title="Adjuntar guion o música"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Requisito 1: Boton Modelos junto a la barra de mensaje */}
          <button
            type="button"
            onClick={() => setIsModelSheetOpen(true)}
            className="h-11 px-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500 flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition shrink-0"
            title="Configurar Modelos (Guion, Imagen y Voz)"
          >
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-slate-200 hidden sm:inline">Modelos</span>
          </button>

          {/* Growing textarea */}
          <div className="flex-1 rounded-2xl bg-slate-900 border border-slate-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/40 transition flex items-center px-3 py-1.5">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Escribe un mensaje o pega tu guion…"
              rows={1}
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none max-h-36 py-1 leading-relaxed"
            />
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={(!inputMessage.trim() && !pendingScriptAttachment) || isSending}
            className="w-11 h-11 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 active:scale-95 transition shrink-0"
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </footer>

      {/* DRAWER: PROJECTS LIST (☰) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer content */}
          <div className="relative w-4/5 max-w-xs bg-slate-950 border-r border-slate-800 h-full flex flex-col p-4 z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white">Mis Proyectos</h3>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {allProjects.map((proj) => {
                const isCurrent = proj.id === activeProj?.id;
                return (
                  <div
                    key={proj.id}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between group transition ${
                      isCurrent
                        ? 'border-indigo-500 bg-indigo-950/30 text-white'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectProject(proj.id);
                        setIsDrawerOpen(false);
                      }}
                      className="flex-1 truncate text-left"
                    >
                      <span className="font-semibold text-xs block truncate">{proj.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {proj.scenes?.length || 0} escenas • {new Date(proj.updatedAt).toLocaleDateString()}
                      </span>
                    </button>

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteProjectById(proj.id);
                        if (isCurrent) onNewChat();
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 transition"
                      title="Eliminar proyecto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                onNewChat();
                setIsDrawerOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Chat</span>
            </button>
          </div>
        </div>
      )}

      {/* ATTACHMENT BOTTOM SHEET ("+") */}
      {isAttachmentSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            onClick={() => setIsAttachmentSheetOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="relative w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 pb-safe z-10 animate-in slide-in-from-bottom duration-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white">Adjuntar contenido</h3>
              <button
                onClick={() => setIsAttachmentSheetOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {/* Option 1: File (.txt, .md, .docx) */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 text-left transition"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-xs text-white block">Subir guion (.txt, .md, .docx)</span>
                  <span className="text-[11px] text-slate-400">Lee Word o texto y lo procesa al instante</span>
                </div>
              </button>

              {/* Option 2: Paste Clipboard */}
              <button
                onClick={handlePasteClipboard}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 text-left transition"
              >
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-xs text-white block">Pegar guion del portapapeles</span>
                  <span className="text-[11px] text-slate-400">Pega texto copiado en tu teléfono o PC</span>
                </div>
              </button>

              {/* Option 3: Music Audio File */}
              <button
                onClick={() => musicInputRef.current?.click()}
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800/60 text-left transition"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold text-xs text-white block">Música de fondo personalizada</span>
                  <span className="text-[11px] text-slate-400">Sube tu propio archivo de audio MP3 o WAV</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YOUTUBE SEO MODAL */}
      {showSeoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">SEO para YouTube</h3>
              </div>
              <button onClick={() => setShowSeoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {isGeneratingSeo ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2 text-indigo-400">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="text-xs font-semibold">Generando títulos con alto CTR y descripción...</span>
              </div>
            ) : seoMetadata ? (
              <div className="space-y-4 text-xs">
                {/* Titles */}
                <div>
                  <label className="font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Títulos sugeridos (CTR alto)
                  </label>
                  <div className="space-y-1.5">
                    {seoMetadata.titles.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
                      >
                        <span className="font-medium truncate pr-2">{t}</span>
                        <button
                          onClick={() => handleCopyClipboard(t, `title_${idx}`)}
                          className="text-indigo-400 hover:text-indigo-300 font-bold shrink-0"
                        >
                          {copiedKey === `title_${idx}` ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider">
                      Descripción completa con capítulos
                    </label>
                    <button
                      onClick={() => handleCopyClipboard(seoMetadata.description, 'desc')}
                      className="text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                      {copiedKey === 'desc' ? '¡Copiado!' : 'Copiar todo'}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={seoMetadata.description}
                    rows={5}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-xs text-slate-300"
                  />
                </div>

                {/* Tags */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider">
                      Etiquetas (Tags)
                    </label>
                    <button
                      onClick={() => handleCopyClipboard(seoMetadata.tags.join(', '), 'tags')}
                      className="text-indigo-400 hover:text-indigo-300 font-bold"
                    >
                      {copiedKey === 'tags' ? '¡Copiado!' : 'Copiar tags'}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed">
                    {seoMetadata.tags.join(', ')}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* THUMBNAIL GENERATOR MODAL (Requisito 26) */}
      {showThumbnailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-violet-400" />
                <h3 className="font-bold text-sm text-white">Generador de Miniatura 16:9</h3>
              </div>
              <button onClick={() => setShowThumbnailModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Canvas Preview */}
            <div className="aspect-video w-full rounded-xl bg-black border border-slate-800 overflow-hidden shadow-lg">
              <canvas ref={thumbnailCanvasRef} className="w-full h-full object-contain" />
            </div>

            {/* Editable Subtitle field (Requisito 26) */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Subtítulo editable de la miniatura:
              </label>
              <input
                type="text"
                value={thumbnailSubtitle}
                onChange={async (e) => {
                  setThumbnailSubtitle(e.target.value);
                  const proj = projectRef.current;
                  if (proj) {
                    proj.thumbnailSubtitle = e.target.value;
                    onProjectUpdated({ ...proj });
                    await saveProject(proj);
                  }
                  setTimeout(() => drawThumbnailCanvas(), 50);
                }}
                placeholder="Ejemplo: EDICIÓN ESPECIAL, PASO A PASO, GUÍA COMPLETA"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowThumbnailModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
              <button
                onClick={handleDownloadThumbnail}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Descargar Miniatura PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUISITOS 1, 2, 3: SELECTOR DE MODELOS GUION, IMAGENES Y VOZ */}
      <ModelSelectorSheet
        isOpen={isModelSheetOpen}
        onClose={() => setIsModelSheetOpen(false)}
        config={activeProj?.modelConfig || getStoredDefaultModels()}
        onSaveConfig={handleSaveModelConfig}
      />
    </div>
  );
};
