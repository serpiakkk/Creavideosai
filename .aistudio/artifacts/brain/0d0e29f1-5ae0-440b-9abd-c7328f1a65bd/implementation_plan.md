# AutoVideo IA — Aplicación PWA de Generación Automatizada de Videos

AutoVideo IA es una aplicación web progresiva (PWA) instalable para iPhone y Android que transforma guiones de texto en español en videos completos listos para YouTube, TikTok y Reels. La app orquesta el análisis de guiones, generación de imágenes coherentes, narración por voz con Gemini TTS, montaje en Canvas a 30 FPS con movimiento Ken Burns, subtítulos dinámicos sincronizados, mezcla de audio con ducking inteligente y exportación a video (MP4/WebM).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Decisiones confirmadas en la fase de clarificación interactiva y configuración del sistema:

- **Estrategia de Voz**: Se utilizará **Gemini TTS** (`gemini-3.8-flash-lite-tts`) con las voces oficiales de Gemini (`Kore`, `Puck`, `Charon`, `Fenrir`, `Zephyr`). En caso de corte de conexión o límite de cuota agotada, se activará un fallback opcional transparente mediante síntesis local del navegador o pausa con guardado de progreso.
- **Música de Fondo**: Se incluirá un catálogo de pistas instrumentales libres de derechos integradas en la app (Lo-Fi Chill, Upbeat Tech, Cinematic Drama, Corporate Minimal) junto con la opción de subir pistas de audio personalizadas (`.mp3`, `.wav`).
- **Subtítulos en Video**: Estilo dinámico moderno inspirado en clips virales de TikTok/Shorts (texto en negrita con borde de alto contraste y resaltado activo palabra por palabra con color acento).
- **Control de Cuota Gratuita**: Cola de peticiones con pausas de 3.5 segundos entre llamadas, reintentos automáticos con retroceso exponencial (*exponential backoff*), persistencia en IndexedDB de cada asset individual (para no volver a gastar cuota en escenas ya generadas) y opción rápida de "Probar con 2 escenas".

---

### 1. Overview & Core Concept

- **Qué hace**: Recibe un guion de texto estructurado o en prosa, lo segmenta automáticamente en escenas cronológicas, genera las ilustraciones visuales según el estilo elegido y la narración en audio con duración exacta, compone el video con animaciones de cámara y subtítulos animados, y permite editar o exportar el video final junto a sus archivos individuales (MP4/WebM, audio WAV, imágenes PNG y archivo `.srt`).
- **Público Objetivo**: Creadores de contenido, educadores, divulgadores, agencias y emprendedores que necesitan producir videos virales y explicativos de alta calidad de forma ágil desde su celular o computadora.
- **Valor Principal**: Cero fricción de edición técnica; conversión de texto a video autónoma en menos de 2 minutos, con capacidad de ejecutarse en segundo plano y reanudarse ante cualquier interrupción de red.

---

### 2. User Experience & Visual Design

#### Flujo de Pantallas
1. **Inicio (Biblioteca de Proyectos)**:
   - Encabezado con estado de conexión PWA, botón de instalación en la pantalla de inicio ("Instalar en Celular") y selector de modo oscuro.
   - Botón destacado y ergonómico para el pulgar: `+ Nuevo Video`.
   - Grid de tarjetas de proyectos guardados en IndexedDB con miniatura, título, formato (16:9 / 9:16), fecha y estado (*Borrador*, *Generando*, *Completado*).
   - Acceso a proyectos de ejemplo precargados para probar al instante sin necesidad de escribir un guion desde cero.

2. **Nuevo Proyecto & Asistente de Guion**:
   - Título del video y área de texto para el guion en español con soporte de etiquetas (`IMAGEN:`, `##`, `NÚMERO`).
   - Selector de plantillas de estilo visual (Pizarra / Dibujo a mano, Cómic / Novela gráfica, Vectorial minimalista, Acuarela, Synthwave, Claymation 3D) con prompt editable.
   - Selector de voz de Gemini con botón de prueba para escuchar una muestra de audio inmediata.
   - Configuración de velocidad (0.9x a 1.3x) y tono emocional (Informativo, Curioso, Dramático, Entusiasta).
   - Selector de formato: **16:9 (YouTube)** vs **9:16 (Shorts / TikTok / Reels)**.
   - Selector de música de fondo (catálogo preinstalado o subida de archivo) con control de volumen relativo.
   - Acciones principales: **"Probar con 2 escenas"** (ideal para validar estilo y ahorrar cuota) y **"Generar video completo"**.

3. **Generador & Monitor de Progreso en Tiempo Real**:
   - Barra de progreso general con porcentaje y contador de llamadas realizadas/estimadas.
   - Mensajes transparentes y comprensibles ("Segmentando guion en 6 escenas...", "Dibujando escena 3 de 6...", "Generando voz de escena 3...").
   - Lista visual de escenas: cada tarjeta muestra su miniatura en cuanto está lista, badge de estado, duración detectada del audio y botón individual de reintento si ocurre algún error.
   - Detección de suspensión: el estado se persiste en IndexedDB en cada paso. Si el usuario bloquea el celular o recarga, la app detecta el progreso y muestra el botón "Continuar donde me quedé".

4. **Editor de Escenas & Línea de Tiempo**:
   - Línea de tiempo visual horizontal e interactiva que muestra las escenas con duración real.
   - Panel de edición por escena:
     - Regenerar imagen individual (con opción de ajustar el prompt visual).
     - Regenerar solo la voz o escucharla por separado.
     - Editar texto de narración y líneas de subtítulos.
     - Ajustar duración manual y efecto de cámara: Zoom Lento Adelante (*Ken Burns In*), Zoom Atrás (*Ken Burns Out*), Paneo Izquierda/Derecha o Estático.
     - Reordenar (subir/bajar), duplicar o eliminar escena.
     - Añadir nueva escena intermedia.

5. **Vista Previa & Exportación Multimedia**:
   - Reproductor de video interactivo con pantalla completa y controles táctiles.
   - Generador en Canvas + Web Audio + MediaRecorder con exportación a `.mp4` / `.webm`.
   - Botones directos de descarga:
     - `Descargar Video` (calidad alta).
     - `Descargar Audio Completo` (WAV/MP3).
     - `Descargar Subtítulos (.srt)`.
     - `Descargar Paquete de Imágenes (ZIP / Individual)`.
   - Botón de compartir nativo móvil (`navigator.share`) para enviar directamente a WhatsApp, Telegram o redes sociales.
   - Herramientas extras: "Generar título, descripción y etiquetas para YouTube" y "Generar miniatura 16:9 de alto impacto".

#### Identidad Visual & Ergonomía
- **Tema**: Modo oscuro nativo elegante (`bg-slate-950` con tarjetas `bg-slate-900/90` y bordes finos `border-slate-800`).
- **Acento**: Índigo vibrante / Violeta eléctrico (`#6366f1` / `#4f46e5`) con alto contraste para botones primarios táctiles.
- **Tipografía**: *Plus Jakarta Sans* para títulos y textos de interfaz, con fuentes monoespaciadas para duraciones numéricas (*tabular-nums*).
- **Zonas Táctiles (Thumb Zone)**: Barra de navegación inferior móvil (`fixed bottom-0 pb-safe`) y botones de acción primaria con al menos 48px de altura y feedback táctil inmediato (`active:scale-[0.98]`).
- **Soporte Notch & Safe Areas**: Uso de variables CSS `env(safe-area-inset-top)` y `env(safe-area-inset-bottom)`.

---

### 3. Key Product Decisions & Trade-Offs

- **Compositor de Video en Dispositivo (Client-Side Canvas & Web Audio API)**:
  - *Decisión*: Renderizar el video en el cliente combinando Canvas 2D acelerado por hardware para efectos Ken Burns y subtítulos, junto a un grafo de Web Audio con nodos de ganancia dinámica para el audio ducking de la música de fondo.
  - *Por qué*: Cero costo de procesamiento en servidor, exportación instantánea sin colas de renderizado externas, total privacidad del usuario y compatibilidad offline.
  - *Alternativa descartada*: Enviar frames a un servidor FFmpeg remoto, lo cual requeriría infraestructura costosa y fallaría sin internet.

- **Persistencia Completa en IndexedDB**:
  - *Decisión*: Almacenar en IndexedDB no solo los metadatos de los proyectos, sino también los Blobs de audio y las imágenes en Base64/Blob.
  - *Por qué*: Si se agota la cuota de la API o se cierra la pestaña, ningún asset generado se pierde. El usuario puede retomar en cualquier instante sin consumir llamadas redundantes a la API.

- **Mitigación de Límites de Cuota (Free Tier Throttling & Safety Guard)**:
  - *Decisión*: Cola asíncrona secuencial con delay programado (mínimo 3.5 segundos entre peticiones de imágenes y voz), contador visual de operaciones y reintentos exponenciales con suavizado automático de prompts si saltan filtros de seguridad.
  - *Por qué*: La API de Gemini en nivel gratuito impone límites estrictos de peticiones por minuto (RPM). La cola garantiza que la generación no sufra errores de rate limit (429).

- **Estructura PWA Completa**:
  - *Decisión*: Configuración con `vite-plugin-pwa`, manifest manifest.webmanifest con display `standalone`, service worker con caché Workbox y banner de instalación adaptativo (Chromium `beforeinstallprompt` + guía visual para iOS Safari).

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AutoVideo IA PWA (React + Vite)                 │
├────────────────────────────────────────────────────────────────────────┤
│  Vistas:                                                               │
│   [Inicio] ──> [Nuevo Proyecto] ──> [Generación] ──> [Editor / Export] │
├────────────────────────────────────────────────────────────────────────┤
│  Servicios Frontend:                                                   │
│   • VideoComposer: Canvas 2D + Ken Burns + Subtitle Engine             │
│   • AudioEngine: Web Audio API (Ducking dinámico de música)            │
│   • MediaExporter: MediaRecorder (Canvas Stream + Audio Stream)        │
│   • ProjectStore: IndexedDB (Proyectos, Escenas, Blobs de Audio/Img)   │
│   • PWAEngine: Service Worker, Manifest, Install Prompt                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Peticiones /api/*
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Backend Proxy Express (server.ts / Vite)               │
├────────────────────────────────────────────────────────────────────────┤
│   • POST /api/script/parse       -> Gemini 3.8 Flash (guion a escenas) │
│   • POST /api/image/generate     -> Gemini 3.1 Flash Lite Image        │
│   • POST /api/voice/generate     -> Gemini 3.8 Flash Lite TTS (WAV)    │
│   • POST /api/youtube/metadata   -> Gemini 3.8 Flash (SEO YouTube)     │
└────────────────────────────────────────────────────────────────────────┘
```

#### Modelo de Datos Principal (IndexedDB)
- **`VideoProject`**:
  - `id`: string (UUID)
  - `title`: string
  - `createdAt`: number
  - `aspectRatio`: "16:9" | "9:16"
  - `visualStyle`: string
  - `voiceName`: string ("Kore" | "Puck" | "Charon" | "Fenrir" | "Zephyr")
  - `voiceSpeed`: number (0.9 a 1.3)
  - `voiceTone`: string
  - `backgroundMusic`: { id: string; name: string; volume: number; customAudioBlob?: Blob }
  - `status`: "draft" | "generating" | "ready" | "error"
  - `scenes`: `SceneItem[]`
- **`SceneItem`**:
  - `id`: string
  - `order`: number
  - `title`: string
  - `narrationText`: string
  - `visualPrompt`: string
  - `imageUrl`: string (base64 o Blob URL)
  - `audioBlob`: Blob (audio WAV de la narración)
  - `duration`: number (segundos reales calculados a partir del audio)
  - `cameraMotion`: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static"
  - `transition`: "fade" | "cut" | "crossfade"
  - `status`: "pending" | "generating_image" | "generating_voice" | "ready" | "error"
  - `errorMessage`?: string

---

### Verificación y Entregables
1. Verificación de compilación limpia de la app y del backend (`npm run build` / `compile_applet`).
2. Comprobación de instalación PWA: archivo manifest, service worker activo, íconos y banner de instalación.
3. Pruebas del flujo de "Probar con 2 escenas" para validar el montaje completo con consumo mínimo de cuota.
4. Generación de video con Canvas, audio ducking, subtítulos dinámicos y descarga funcional en formato MP4/WebM y `.srt`.
