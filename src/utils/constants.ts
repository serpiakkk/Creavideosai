import { VisualPreset, VoiceOption } from '../types';

export const VISUAL_PRESETS: VisualPreset[] = [
  {
    id: 'whiteboard',
    name: 'Pizarra con muñecos de palitos',
    badge: 'Por Defecto',
    description: 'Estilo dibujo animado en pizarra blanca con trazos gruesos en tinta negra y acentos rojos.',
    prompt:
      'Simple 2D whiteboard animation style illustration, hand-drawn stick figure with round head and thick black outlines, white background, minimal flat colors with red accents, clean cartoon icons, lots of empty space, 16:9, no realistic faces, no copyrighted characters, only short Spanish text labels.',
  },
  {
    id: 'comic',
    name: 'Cómic / Novela Gráfica',
    badge: 'Estilo Manga/Novela',
    description: 'Viñetas estilizadas con tinta entintada, texturas de semitonos y sombreado cel.',
    prompt:
      'Dynamic graphic novel comic book illustration, crisp ink outlines, pop art halftone dot shading, high contrast, vibrant saturated color accents on deep dark ink, clean storyboard composition, no photographic realism.',
  },
  {
    id: 'minimal-vector',
    name: 'Vectorial Minimalista',
    badge: 'Estilo Tech/Startup',
    description: 'Diseño limpio y moderno estilo infografía corporativa con paleta cuidada y formas geométricas.',
    prompt:
      'Modern flat vector illustration, elegant tech startup visual style, clean geometric shapes, soft pastel and deep indigo palette, isometric elements, plenty of negative space, polished digital artwork.',
  },
  {
    id: 'watercolor',
    name: 'Acuarela Cuento',
    badge: 'Artístico',
    description: 'Ilustración suave con manchas de acuarela sobre papel texturizado y bordes difusos.',
    prompt:
      'Gentle storybook watercolor illustration, organic fluid paint bleeding, visible cotton paper texture, warm earthy and pastel tones, hand-painted aesthetic, poetic and atmospheric framing.',
  },
  {
    id: 'synthwave',
    name: 'Synthwave Neón 80s',
    badge: 'Retro Futurista',
    description: 'Estética ochentera con rejillas de perspectiva, cielo degradado y líneas de neón magenta y cian.',
    prompt:
      'Stylized 80s retro synthwave illustration, glowing neon wireframes, electric violet and turquoise gradients, grid horizon, cybernetic minimalism, clean vector lines, retro arcade vibe.',
  },
  {
    id: 'claymation',
    name: 'Plastilina 3D',
    badge: 'Animación Stop-Motion',
    description: 'Figuras modeladas en plastilina con huellas dactilares sutiles e iluminación de estudio cálida.',
    prompt:
      'Charming 3D claymation stop-motion style, handcrafted plasticine figures with tactile clay textures and thumbprints, soft studio miniature lighting, miniature set background, whimsical cartoon aesthetic.',
  },
];

export const GEMINI_VOICES: VoiceOption[] = [
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'Femenino',
    description: 'Voz equilibrada, cálida y natural para narraciones y tutoriales.',
    style: 'Informativo y amigable',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'Masculino',
    description: 'Voz juvenil, entusiasta y con buen ritmo para videos virales.',
    style: 'Dinámico y juvenil',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'Masculino',
    description: 'Voz profunda, seria y cinematográfica para historias de impacto.',
    style: 'Dramático y profundo',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'Masculino',
    description: 'Voz firme, clara y con autoridad para documentales y negocios.',
    style: 'Enérgico y confiable',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'Femenino',
    description: 'Voz clara, articulada y profesional para contenido educativo.',
    style: 'Profesional y divulgativo',
  },
];

export const DEMO_SCRIPTS = [
  {
    title: 'Por qué procrastinamos y cómo vencerlo',
    script: `## Escena 1: El dilema cotidiano
IMAGEN: Un muñeco de palitos sentado frente a su computadora mirando una montaña gigante de papeles, con cara de preocupación.
Todos conocemos esa sensación: tienes una tarea importante que hacer, pero de repente limpiar tu habitación parece la idea más urgente del mundo.

## Escena 2: La batalla del cerebro
IMAGEN: Dos mitades de un cerebro ilustrado, un mono sonriente tirando de una palanca y un científico con anteojos tratando de detenerlo.
No es pereza, es una batalla biológica entre tu sistema límbico que busca placer inmediato y tu corteza prefrontal que planea el futuro.

## Escena 3: La regla de los 5 minutos
IMAGEN: Un reloj de arena con solo 5 minutos marcados en rojo brillante, y el personaje empezando a teclear con energía.
El truco definitivo es la regla de los cinco minutos: dile a tu mente que solo trabajarás 300 segundos. Una vez que rompes la inercia, la fricción desaparece.

## Escena 4: La victoria diaria
IMAGEN: El personaje celebrando en la cima de la montaña de papeles con una bandera roja en la mano.
Empieza hoy mismo con tu próximo gran objetivo. Lo difícil no es terminar, es dar el primer paso.`,
  },
  {
    title: 'La regla del 1%: El poder del interés compuesto',
    script: `## 1. El gran mito del éxito
IMAGEN: Una flecha que intenta saltar un acantilado enorme de un solo salto y tropieza.
Creemos que para transformar nuestra vida necesitamos un cambio gigantesco de la noche a la mañana. Pero la ciencia demuestra lo contrario.

## 2. El 1% diario
IMAGEN: Un gráfico con una curva exponencial suave que sube hacia las nubes, con pequeños escalones verdes.
Si mejoras tan solo un uno por ciento cada día durante un año entero, terminarás siendo treinta y siete veces mejor al final del camino.

## 3. Pequeños hábitos, gigantes resultados
IMAGEN: Una pequeña bola de nieve rodando colina abajo y convirtiéndose en una avalancha imparable.
No busques atajos mágicos. Domina la constancia diaria y deja que el interés compuesto trabaje para ti.`,
  },
];
