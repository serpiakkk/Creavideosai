// Generador de ilustraciones vectoriales en estilo Whiteboard / Cómic / Vector
// Utilizado como fallback automático de alta fidelidad cuando la API de Gemini
// tiene cuota 0 para modelos ráster en cuentas gratuitas (free tier).

export interface VisualIllustrationOptions {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  title?: string;
  narrationText?: string;
  keywords?: string[];
}

export function generateSceneSvg(options: VisualIllustrationOptions): string {
  const isVertical = options.aspectRatio === '9:16';
  const width = isVertical ? 720 : 1280;
  const height = isVertical ? 1280 : 720;
  const cx = width / 2;
  const cy = height / 2;

  const promptLower = (options.prompt || '').toLowerCase();
  const textLower = ((options.narrationText || '') + ' ' + (options.title || '')).toLowerCase();
  const fullContext = promptLower + ' ' + textLower;

  // Determine scene theme and icon elements based on semantic keywords
  const isTimeOrClock = fullContext.match(/(tiempo|reloj|minuto|hora|segundo|tarde|prisa|procrastin|espera|esperar)/i);
  const isBrainOrIdea = fullContext.match(/(cerebro|mente|pensar|idea|psicolog|ciencia|conocimiento|aprender|dilema|razon)/i);
  const isGrowthOrSuccess = fullContext.match(/(éxito|exito|crecer|crecimiento|meta|objetivo|ganar|victoria|por ciento|interés|dinero|invers)/i);
  const isWorkOrStudy = fullContext.match(/(trabajo|computadora|ordenador|escribir|estudiar|tarea|papel|oficina|teclear)/i);
  const isQuestionOrChoice = fullContext.match(/(pregunta|duda|camino|eleccion|elegir|decidir|por qué|porque)/i);

  // SVG Elements Generation
  let centralIllustration = '';
  let themeTitle = options.title || 'Escena Ilustrada';

  if (isTimeOrClock) {
    // Stick figure looking at a big clock / hourglass with red accents
    centralIllustration = `
      <!-- Sand Clock / Giant Watch -->
      <g transform="translate(${cx + 80}, ${cy - 40})">
        <!-- Clock Face -->
        <circle cx="0" cy="0" r="100" fill="#ffffff" stroke="#111827" stroke-width="8" />
        <circle cx="0" cy="0" r="6" fill="#111827" />
        <!-- Clock Marks -->
        <line x1="0" y1="-85" x2="0" y2="-70" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="85" y1="0" x2="70" y2="0" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="0" y1="85" x2="0" y2="70" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="-85" y1="0" x2="-70" y2="0" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <!-- Clock Hands in Red Accent -->
        <line x1="0" y1="0" x2="0" y2="-55" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>
        <line x1="0" y1="0" x2="45" y2="15" stroke="#111827" stroke-width="7" stroke-linecap="round"/>
        <!-- Motion lines -->
        <path d="M 115 -40 A 130 130 0 0 1 125 40" fill="none" stroke="#6366f1" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round" />
      </g>

      <!-- Stick Figure on Left, pointing at clock with expression -->
      <g transform="translate(${cx - 140}, ${cy + 60})">
        <!-- Head -->
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Eyes & Surprised Expression -->
        <circle cx="-12" cy="-115" r="4" fill="#111827" />
        <circle cx="12" cy="-115" r="4" fill="#111827" />
        <ellipse cx="0" cy="-98" rx="8" ry="12" fill="#ef4444" stroke="#111827" stroke-width="3" />
        <path d="M -20 -130 Q -10 -138 0 -130" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M 20 -130 Q 10 -138 0 -130" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <!-- Body Spine -->
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Arms pointing at clock -->
        <path d="M 0 -45 Q 60 -50 110 -80" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -40 -20 -60 20" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <!-- Legs -->
        <line x1="0" y1="40" x2="-45" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="45" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isBrainOrIdea) {
    // Brain with lightbulb idea and curious stick figure
    centralIllustration = `
      <!-- Glowing Lightbulb & Brain System -->
      <g transform="translate(${cx + 90}, ${cy - 50})">
        <!-- Lightbulb glow aura -->
        <circle cx="0" cy="0" r="90" fill="#fef08a" opacity="0.4" />
        <!-- Lightbulb contour -->
        <path d="M -45 -20 C -60 -70 60 -70 45 -20 C 35 10 25 25 20 45 L -20 45 C -25 25 -35 10 -45 -20 Z" fill="#ffffff" stroke="#111827" stroke-width="8" stroke-linejoin="round" />
        <!-- Bulb filament inside (Brain shape) in Red/Indigo -->
        <path d="M -15 -25 C -25 -40 -5 -50 0 -35 C 5 -50 25 -40 15 -25 C 20 -10 5 0 0 15 C -5 0 -20 -10 -15 -25 Z" fill="#fee2e2" stroke="#ef4444" stroke-width="5" />
        <!-- Bulb base screw -->
        <rect x="-18" y="45" width="36" height="12" rx="4" fill="#e2e8f0" stroke="#111827" stroke-width="6" />
        <rect x="-14" y="57" width="28" height="10" rx="3" fill="#cbd5e1" stroke="#111827" stroke-width="5" />
        <!-- Sparkle rays -->
        <line x1="0" y1="-85" x2="0" y2="-110" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="-70" y1="-70" x2="-90" y2="-90" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="70" y1="-70" x2="90" y2="-90" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="-85" y1="0" x2="-110" y2="0" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="85" y1="0" x2="110" y2="0" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
      </g>

      <!-- Thinking Stick Figure on Left -->
      <g transform="translate(${cx - 130}, ${cy + 60})">
        <!-- Head -->
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Eyes looking up at idea -->
        <circle cx="-6" cy="-120" r="4" fill="#111827" />
        <circle cx="16" cy="-120" r="4" fill="#111827" />
        <!-- Smile -->
        <path d="M -8 -96 Q 6 -86 20 -98" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <!-- Body Spine -->
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Hand on chin thinking -->
        <path d="M 0 -45 Q 25 -65 18 -90" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -10 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <!-- Legs standing -->
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isGrowthOrSuccess) {
    // Rising exponential curve + Trophy + Celebratory stick figure
    centralIllustration = `
      <!-- Ascending Growth Chart / Mountain -->
      <g transform="translate(${cx - 180}, ${cy + 70})">
        <!-- Grid axes -->
        <line x1="0" y1="40" x2="360" y2="40" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" />
        <line x1="0" y1="40" x2="0" y2="-180" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" />
        <!-- Upward Exponent Curve in Red & Indigo -->
        <path d="M 0 30 Q 150 25 240 -60 T 350 -170" fill="none" stroke="#ef4444" stroke-width="8" stroke-linecap="round" />
        <!-- Arrowhead on graph -->
        <polygon points="350,-170 330,-160 345,-140" fill="#ef4444" />
        <!-- Milestone Stars -->
        <circle cx="100" cy="22" r="8" fill="#6366f1" />
        <circle cx="200" cy="-20" r="10" fill="#6366f1" />
        <circle cx="300" cy="-120" r="12" fill="#ef4444" />
      </g>

      <!-- Celebrating Stick Figure on Right -->
      <g transform="translate(${cx + 170}, ${cy - 50})">
        <!-- Head -->
        <circle cx="0" cy="-90" r="36" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Happy Eyes & Smile -->
        <path d="M -16 -95 Q -10 -105 -4 -95" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M 4 -95 Q 10 -105 16 -95" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M -10 -80 Q 0 -68 10 -80" fill="none" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
        <!-- Body Spine -->
        <line x1="0" y1="-54" x2="0" y2="50" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Raised arms cheering / Victory -->
        <path d="M 0 -30 Q -45 -70 -60 -115" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -30 Q 45 -70 60 -115" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <!-- Flag in hand -->
        <line x1="60" y1="-115" x2="60" y2="-165" stroke="#111827" stroke-width="5" />
        <polygon points="60,-165 110,-150 60,-135" fill="#ef4444" stroke="#111827" stroke-width="3" />
        <!-- Legs in confident stance -->
        <line x1="0" y1="50" x2="-40" y2="130" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="50" x2="40" y2="130" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isWorkOrStudy) {
    // Desk with Laptop, mountain of papers, character working
    centralIllustration = `
      <!-- Desk with Laptop & Papers -->
      <g transform="translate(${cx}, ${cy + 60})">
        <!-- Desk Table -->
        <line x1="-220" y1="0" x2="220" y2="0" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="-180" y1="0" x2="-180" y2="100" stroke="#111827" stroke-width="7" />
        <line x1="180" y1="0" x2="180" y2="100" stroke="#111827" stroke-width="7" />

        <!-- Laptop -->
        <path d="M -30 -40 L 30 -40 L 40 0 L -40 0 Z" fill="#ffffff" stroke="#111827" stroke-width="6" />
        <rect x="-24" y="-35" width="48" height="28" rx="2" fill="#e0e7ff" />
        <!-- Screen details -->
        <line x1="-15" y1="-26" x2="15" y2="-26" stroke="#6366f1" stroke-width="3" />
        <line x1="-15" y1="-18" x2="5" y2="-18" stroke="#6366f1" stroke-width="3" />

        <!-- Pile of Papers with Red Paperclip -->
        <g transform="translate(100, -20)">
          <rect x="-35" y="-10" width="60" height="20" rx="3" fill="#ffffff" stroke="#111827" stroke-width="5" transform="rotate(-6)" />
          <rect x="-35" y="-20" width="60" height="20" rx="3" fill="#ffffff" stroke="#111827" stroke-width="5" transform="rotate(4)" />
          <rect x="-35" y="-30" width="60" height="20" rx="3" fill="#ffffff" stroke="#111827" stroke-width="5" transform="rotate(-2)" />
          <circle cx="-10" cy="-20" r="5" fill="#ef4444" />
        </g>

        <!-- Coffee Mug -->
        <g transform="translate(-110, -15)">
          <rect x="-12" y="-15" width="24" height="26" rx="4" fill="#ffffff" stroke="#111827" stroke-width="5" />
          <path d="M 12 -10 Q 22 -5 12 5" fill="none" stroke="#111827" stroke-width="4" />
          <path d="M -4 -22 Q -8 -28 -4 -34" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />
        </g>
      </g>

      <!-- Stick Figure sitting at desk focused -->
      <g transform="translate(${cx - 20}, ${cy - 10})">
        <!-- Head -->
        <circle cx="0" cy="-80" r="36" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Eyes focused on screen -->
        <circle cx="10" cy="-85" r="4" fill="#111827" />
        <!-- Focused mouth -->
        <line x1="5" y1="-68" x2="18" y2="-68" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <!-- Body Spine curved toward screen -->
        <path d="M 0 -44 Q 10 0 5 45" fill="none" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Arms typing on laptop -->
        <path d="M 5 -15 Q 25 15 20 40" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
      </g>
    `;
  } else {
    // Versatile Dynamic Whiteboard Composition
    centralIllustration = `
      <!-- Speech/Action Bubble in Center -->
      <g transform="translate(${cx}, ${cy - 60})">
        <path d="M -140 -80 C -160 -80 -180 -60 -180 -40 C -180 20 -150 40 -80 40 L -60 75 L -30 40 C 60 40 180 30 180 -40 C 180 -80 140 -80 -140 -80 Z" fill="#ffffff" stroke="#111827" stroke-width="8" stroke-linejoin="round" />
        <text x="0" y="-30" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="28" fill="#111827" text-anchor="middle">
          ${themeTitle.slice(0, 24)}
        </text>
        <circle cx="-130" cy="-30" r="8" fill="#ef4444" />
        <circle cx="130" cy="-30" r="8" fill="#6366f1" />
      </g>

      <!-- Stick Figure Character Presenting -->
      <g transform="translate(${cx}, ${cy + 110})">
        <!-- Head -->
        <circle cx="0" cy="-100" r="36" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Confident Eyes & Smile -->
        <circle cx="-10" cy="-105" r="4" fill="#111827" />
        <circle cx="10" cy="-105" r="4" fill="#111827" />
        <path d="M -10 -90 Q 0 -80 10 -90" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <!-- Body Spine -->
        <line x1="0" y1="-64" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Arms Gesturing Openly -->
        <path d="M 0 -35 Q -50 -55 -90 -40" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -35 Q 50 -55 90 -40" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <!-- Legs in Grounded Stance -->
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  }

  // Full SVG Document
  const svgDoc = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Whiteboard textured gradient -->
    <linearGradient id="whiteboardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
    <filter id="markerShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.08" />
    </filter>
  </defs>

  <!-- Clean Canvas Background -->
  <rect width="${width}" height="${height}" fill="url(#whiteboardBg)" />

  <!-- Subtle Marker Frame Border -->
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="20" fill="none" stroke="#e2e8f0" stroke-width="4" stroke-dasharray="16 12" />

  <!-- Corner Cartoon Accent Marks -->
  <line x1="45" y1="50" x2="70" y2="50" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
  <line x1="50" y1="45" x2="50" y2="70" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
  <line x1="${width - 45}" y1="${height - 50}" x2="${width - 70}" y2="${height - 50}" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />
  <line x1="${width - 50}" y1="${height - 45}" x2="${width - 50}" y2="${height - 70}" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />

  <!-- Scene Illustration Group -->
  <g filter="url(#markerShadow)">
    ${centralIllustration}
  </g>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgDoc)}`;
}
