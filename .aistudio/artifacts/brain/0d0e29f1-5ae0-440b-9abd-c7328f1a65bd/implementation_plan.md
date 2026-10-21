# Plan de Implementación: Selector de Modelos Híbrido (Nube / Local) y Estabilización de AutoVideo IA

Plan de arquitectura y ejecución para dotar a AutoVideo IA de control total sobre el motor de ejecución de cada tarea (Guion, Imágenes, Voz), combinando la API de Gemini en la nube, modelos locales en el navegador (WebGPU / WASM) que funcionan sin cuota ni conexión, e ilustrador/sintetizador interno sin IA, corrigiendo de forma estricta los 34 requisitos técnicos y de estabilidad.

> [!IMPORTANT] Decisiones Críticas y Preferencias Confirmadas
> - **Descarga de Modelos Locales**: Se descargará 1 modelo potente y 3 modelos ligeros preconfigurados de inicio, con descarga bajo demanda y confirmación de tamaño para modelos adicionales pesados.
> - **Fallback de Aceleración Gráfica**: Si el dispositivo o navegador no soporta WebGPU para modelos pesados, el sistema cambia automáticamente al motor WASM en CPU y muestra un aviso informativo no bloqueante en pantalla.
> - **Política de No Regresión**: No se reescribirá la aplicación desde cero. Se preservará la arquitectura y base de datos existente, extendiendo la interfaz común `ModelProvider` de forma modular y actualizando archivo por archivo.

---

## 1. Visión General y Experiencia de Usuario

AutoVideo IA permitirá al usuario seleccionar con un solo toque desde el chat cómo se procesa cada una de las tres etapas de creación de video:
1. **Guion**: Gemini en nube (con modelos detectados en tiempo real o ID manual), modelos locales en Web Worker (Qwen / Llama / Gemma de 0.5B a 7B) o analizador local determinista.
2. **Imágenes**: Ilustrador interno vectorial SVG (sin IA y sin cuota), modelo de difusión rápida en WebGPU (SD-Turbo), o Gemini en la nube.
3. **Voz**: Gemini TTS en la nube, síntesis local multimodelo en español (Piper TTS ligero, Kokoro TTS medio y modelo neuronal de alta calidad), o audio nativo Web Audio.

El usuario dispondrá de un botón dinámico **"Modelos"** junto a la barra de entrada del chat que resumirá en tiempo real la configuración activa (`Guion: X · Imagen: Y · Voz: Z`), abriendo una hoja inferior deslizable adaptada a pantallas móviles (iPhone) y escritorio.

---

## 2. Arquitectura del Sistema y Flujo de Datos

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INTERFAZ DE CHAT (ChatView)                     │
│  Barra de entrada con Botón "+" (Adjuntos) y Botón "Modelos"           │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
      ┌─────────────────────────┐       ┌────────────────────────┐
      │   Selector de Modelos   │       │   Gestor de Ejecución  │
      │   (Hoja Inferior Modal) │       │   (runId + Lock Ref)   │
      │  Guion · Imagen · Voz   │       └───────────┬────────────┘
      └────────────┬────────────┘                   │
                   │                                │
     ┌─────────────┴───────────────┐                │
     ▼                             ▼                ▼
┌─────────────────────────┐   ┌──────────────────────────────────────────┐
│   PROVEEDOR NUBE        │   │          PROVEEDOR LOCAL                 │
│   (Gemini Cloud API)    │   │      (En el navegador vía Worker)        │
│                         │   │                                          │
│ • Detectar modelos API  │   │ • WebLLM / Transformers.js               │
│ • Timeout por tarea:    │   │ • WebGPU con fallback transparente WASM  │
│   - Guion: 60s          │   │ • Voz: Piper TTS & Kokoro TTS (ES)       │
│   - Voz / Imagen: 90s   │   │ • Difusión: SD-Turbo WebGPU              │
│ • Detección de Cuota:   │   │ • Caché persistente (navigator.storage)  │
│   Máx 2 reintentos      │   │ • Gestión de memoria (1 modelo activo)   │
│   (20s, 40s) -> Opciones│   │ • Ilustrador Vectorial Interno (sin IA)  │
└─────────────────────────┘   └──────────────────────────────────────────┘
                   │                                │
                   └───────────────┬────────────────┘
                                   ▼
                      ┌──────────────────────────┐
                      │ VideoComposer & Export   │
                      │ (Web Audio + Canvas +    │
                      │  AnalyserNode fft: 2048) │
                      └──────────────────────────┘
```

---

## 3. Plan de Implementación por Fases

### Fase 1: Arquitectura de Modelos y Tipos (`src/types/index.ts`, `src/services/modelProvider.ts`)
- Extender `VideoProject` y el estado global para almacenar:
  - `modelConfig`: `{ script: ModelChoice, image: ModelChoice, voice: ModelChoice }`.
  - `fallbackImagePreference`: `'ask' | 'use_fallback' | 'wait_retry'`.
- Crear el contrato común `ModelProvider`:
  - `parseScript(text, style, characterDesc, maxTokens)`
  - `generateImage(prompt, aspectRatio, context)`
  - `generateVoice(text, voiceId, speed, tone)`
- Implementar la detección de capacidades de hardware del cliente:
  - Comprobación de `navigator.gpu` (límites de memoria de buffer y adaptadores).
  - Detección de `navigator.deviceMemory`, núcleos de CPU y detección de dispositivo iOS (iPhone/iPad).
  - Clasificación de modelos: *Recomendado*, *Funciona pero lento*, o *Puede cerrar la app*.
- Manejo de persistencia de almacenamiento con `navigator.storage.persist()` e inspección de cuota usada (`navigator.storage.estimate()`).

### Fase 2: Motor Local en Web Worker (`src/workers/modelWorker.ts`, `src/services/localModelService.ts`)
- Configurar un Web Worker aislado para evitar bloquear el hilo de renderizado de la UI.
- Integración de Transformers.js (`@huggingface/transformers`) y WebLLM:
  - Carga y liberación estricta de memoria (solo un modelo cargado a la vez, con método `dispose()`).
  - Reporte de progreso de descarga porcentaje a porcentaje con cancelación limpia.
  - Implementación de los 3 niveles de voz local en español (Piper TTS ligero, Kokoro TTS medio y modelo neuronal) con conversión directa a WAV PCM.
  - Implementación de los 3 niveles de guion local (<1B, 3-4B, 7-8B) con validación de JSON y fallback directo al analizador determinista.
  - Soporte para SD-Turbo en WebGPU para imágenes locales estilo pizarra con prompt negativo.

### Fase 3: Endpoints del Servidor y Detección de Gemini (`server.ts`)
- Nuevo endpoint `GET /api/models/available`: Llama a `ai.models.list()` para devolver los modelos reales activos para la clave de API del usuario.
- Nuevo endpoint `POST /api/models/test`: Prueba de latencia mínima para verificar cuota de un modelo concreto.
- Actualización de timeouts en `server.ts`: 60 s para análisis de guion, 90 s para voz e imágenes (retirando el timeout global corto de 15 s).
- En `/api/voice/generate`: Detección de `inlineData.mimeType`. Si devuelve audio crudo PCM/L16, agregar dinámicamente la cabecera WAV estándar (44 bytes, 24000 Hz, 16 bits, mono).
- En `/api/chat/command`: Procesamiento de orden de comandos priorizando "regenerar imagen/voz de escena N", y delimitando comandos de formato a frases explícitas con "formato" o "cambia a/hazlo en".

### Fase 4: Experiencia en el Chat (`src/views/ChatView.tsx`)
- Botón **"Modelos"** fijo junto a la barra de entrada con etiqueta de estado (`Guion: X · Imagen: Y · Voz: Z`).
- Hoja inferior deslizante (`ModelSelectorSheet`) con las tres pestañas (Guion, Imagen, Voz) y categorías *Nube*, *Local* e *Interno*.
- Control de cuota en generación: Máximo 2 reintentos (20 s y 40 s). Si persiste, mostrar mensaje interactivo con botones: *"Cambiar a modelo local"*, *"Esperar 1 minuto"* y *"Detener"*.
- Manejo de concurrencia: Bloqueo de proceso con `runId` y referencia `pipelineRunning` para impedir dobles ejecuciones.
- Botón "Detener" siempre visible durante la generación.
- Validación estricta de nuevo guion en `handleSendMessage`: Solo se considera guion si hay adjunto, si no hay escenas y tiene >120 caracteres, o si empieza con `##`. Si ya hay escenas, pedir confirmación interactiva (*"Reemplazar guion"* / *"Cancelar"*).
- Estilo predeterminado: *"Pizarra con muñecos de palitos"* como primero y predeterminado con su prompt completo.
- Tarjeta *"Prueba lista"* tras probar con 2 escenas, con reproductor, *"Exportar prueba"* y *"Generar video completo"*.

### Fase 5: Estabilidad del Compositor de Video (`src/services/videoComposer.ts`, `src/views/PreviewExportView.tsx`)
- En `videoComposer.ts`:
  - `AnalyserNode` con `fftSize = 2048` inicializado en `initAudioGraph` conectado como derivación limpia de la salida del compresor de voz.
  - Generación de música de fondo sintetizada en búfer en bucle de 30 segundos (con caché), evitando la creación de búferes masivos de toda la duración.
  - Medición del pico de voz durante la exportación. Si es cero o casi inaudible, mostrar advertencia en rojo pero habilitar el botón *"Descargar de todos modos"*.
  - Llamada a `composer.destroy()` en el bloque `finally` de la exportación.
- En `PreviewExportView.tsx`:
  - Deshabilitar el botón de exportación hasta que `preloadAssets` haya completado.
  - Sincronizar *"Descargar audio"* con `exportFullNarrationWav` y compartir mediante `navigator.share({ files })`.

### Fase 6: Correcciones Puntuales de Soporte (`src/services/docReader.ts`, `src/App.tsx`)
- En `docReader.ts`: Detección case-insensitive para `.txt`, `.md`, `.docx`, emitiendo *"Formato no soportado"* en otros casos.
- En `App.tsx`: En `handleProjectUpdated`, si el proyecto no existe en la lista, insertarlo. Cuando `ChatView` cree un proyecto nuevo, seleccionarlo como proyecto activo inmediatamente.
- Limpieza de narración (`cleanNarration`): Conservar paréntesis informativos y retirar únicamente acotaciones escénicas y marcas visuales.

---

## 4. Estrategia de Prueba y Verificación

1. **Compilación y Linteo**: Ejecutar `compile_applet` y `lint_applet` para garantizar cero errores de TypeScript y empaquetado Vite.
2. **Prueba 100% Local sin Cuota**:
   - Activar: Guion Local Ligero + Ilustrador Interno Vectorial + Voz Local Ligera (Piper).
   - Crear un proyecto con 2 escenas mediante el comando o los chips del selector.
   - Verificar que no se realice ninguna llamada a los endpoints de Gemini.
   - Observar la generación de las ilustraciones vectoriales dinámicas y la reproducción del audio WAV sintetizado por el motor local.
   - Comprobar que el medidor de voz del AnalyserNode reaccione durante la exportación y que el video resultante se reproduzca con audio claro.
