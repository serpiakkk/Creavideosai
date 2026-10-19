// Generador de ilustraciones vectoriales avanzadas en estilo Whiteboard / Motion Graphics
// Proporciona visuales dinámicos de alta fidelidad adaptados automáticamente al contexto semántico
// de cada escena y su relación de aspecto (16:9 o 9:16).

export interface VisualIllustrationOptions {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  title?: string;
  narrationText?: string;
  keywords?: string[];
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

  // Semantic Categories with exact word boundaries (\b)
  const isRocketOrLaunch = fullContext.match(/\b(cohete|rocket|despegar|lanzar|arrancar|iniciar|impulso|rápido|rapido|velocidad|acelerar)\b/i);
  const isTargetOrGoal = fullContext.match(/\b(meta|blanco|diana|objetivo|target|apuntar|foco|precisión|precision|enfoque|estrategia)\b/i);
  const isTimeOrClock = fullContext.match(/\b(tiempo|reloj|minuto|minutos|hora|horas|segundo|segundos|clock|tarde|prisa|procrastinación|procrastinacion|procrastinar|espera|hábito|habito)\b/i);
  const isBrainOrIdea = fullContext.match(/\b(cerebro|mente|pensar|idea|ideas|psicología|psicologia|ciencia|conocimiento|aprender|dilema|razón|razon|neuro|brain)\b/i);
  const isGrowthOrSuccess = fullContext.match(/\b(éxito|exito|crecer|crecimiento|ganar|victoria|interés|interes|compuesto|podio|campeón|campeon|growth|triunfo)\b/i);
  const isMoneyOrFinance = fullContext.match(/\b(dinero|moneda|monedas|finanzas|finanza|ahorro|inversión|inversion|invertir|rico|riqueza|precio|costo|money|dólar|dolar|dólares|dolares|economía|economia)\b/i);
  const isWorkOrStudy = fullContext.match(/\b(trabajo|computadora|ordenador|escribir|estudiar|tarea|papel|oficina|teclear|laptop|código|codigo|programar)\b/i);
  const isHealthOrHeart = fullContext.match(/\b(salud|corazón|corazon|cuerpo|vida|ejercicio|energía|energia|fuerza|vitalidad|dieta|dormir|fitness)\b/i);
  const isSocialOrTeam = fullContext.match(/\b(amigo|amigos|gente|equipo|personas|hablar|conversar|redes|comunidad|unión|union|audiencia|seguidores)\b/i);
  const isRobotOrAi = fullContext.match(/\b(ia|inteligencia artificial|robot|robots|automatizar|automatización|algoritmo|futuro|tecnología|tecnologia|chip|bot)\b/i);
  const isBookOrLearning = fullContext.match(/\b(libro|libros|leer|lectura|estudio|educación|educacion|aprende|aprender|escuela|universidad|lección|leccion)\b/i);
  const isObstacleOrWarning = fullContext.match(/\b(error|peligro|problema|muro|obstáculo|obstaculo|barrera|freno|riesgo|cuidado|trampa)\b/i);

  let centralIllustration = '';
  const sceneTitle = escapeXml((options.title || 'Escena Ilustrada').slice(0, 32));

  // Position adjustments based on orientation
  const charX = isVertical ? cx : cx - 180;
  const charY = isVertical ? cy + 180 : cy + 70;
  const propX = isVertical ? cx : cx + 180;
  const propY = isVertical ? cy - 140 : cy - 20;

  if (isRocketOrLaunch) {
    centralIllustration = `
      <!-- Rocket in Flight -->
      <g transform="translate(${propX}, ${propY})">
        <!-- Exhaust Clouds -->
        <circle cx="-50" cy="120" r="45" fill="#f1f5f9" stroke="#111827" stroke-width="7" />
        <circle cx="50" cy="120" r="45" fill="#f1f5f9" stroke="#111827" stroke-width="7" />
        <circle cx="0" cy="135" r="55" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <!-- Fire Jet in Vibrant Red & Yellow -->
        <polygon points="-25,70 25,70 0,135" fill="#ef4444" stroke="#111827" stroke-width="6" />
        <polygon points="-12,70 12,70 0,110" fill="#facc15" />
        <!-- Rocket Body -->
        <path d="M 0 -130 C -45 -60 -45 65 -45 70 L 45 70 C 45 65 45 -60 0 -130 Z" fill="#ffffff" stroke="#111827" stroke-width="8" />
        <!-- Fins -->
        <polygon points="-45,20 -85,65 -45,65" fill="#ef4444" stroke="#111827" stroke-width="6" />
        <polygon points="45,20 85,65 45,65" fill="#ef4444" stroke="#111827" stroke-width="6" />
        <!-- Porthole Window with Indigo Ring -->
        <circle cx="0" cy="-25" r="24" fill="#e0e7ff" stroke="#6366f1" stroke-width="7" />
        <circle cx="-6" cy="-30" r="5" fill="#ffffff" />
        <!-- Speed Streaks -->
        <line x1="-100" y1="-70" x2="-100" y2="40" stroke="#6366f1" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round" />
        <line x1="100" y1="-70" x2="100" y2="40" stroke="#6366f1" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round" />
      </g>

      <!-- Enthusiastic Character Pointing to Rocket -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="8" cy="-115" r="4" fill="#111827" />
        <path d="M -2 -94 Q 10 -84 20 -94" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <!-- Arms pointing enthusiastically -->
        <path d="M 0 -45 Q 45 -60 85 -95" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -10 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isTargetOrGoal) {
    centralIllustration = `
      <!-- Bullseye Target with Arrow -->
      <g transform="translate(${propX}, ${propY})">
        <circle cx="0" cy="0" r="110" fill="#ffffff" stroke="#111827" stroke-width="8" />
        <circle cx="0" cy="0" r="82" fill="#fee2e2" stroke="#111827" stroke-width="7" />
        <circle cx="0" cy="0" r="54" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="0" cy="0" r="26" fill="#ef4444" stroke="#111827" stroke-width="6" />
        <line x1="-120" y1="-80" x2="0" y2="0" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="-120" y1="-80" x2="-145" y2="-75" stroke="#6366f1" stroke-width="6" />
        <line x1="-120" y1="-80" x2="-125" y2="-105" stroke="#6366f1" stroke-width="6" />
        <circle cx="15" cy="-15" r="5" fill="#facc15" />
        <circle cx="-15" cy="15" r="4" fill="#facc15" />
      </g>

      <!-- Focused Archer Character -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="10" cy="-115" r="4" fill="#111827" />
        <path d="M 0 -96 Q 10 -88 20 -96" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 40 -40 85 -55" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -20 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isTimeOrClock) {
    centralIllustration = `
      <!-- Clock Face & Hourglass -->
      <g transform="translate(${propX}, ${propY})">
        <circle cx="0" cy="0" r="105" fill="#ffffff" stroke="#111827" stroke-width="8" />
        <circle cx="0" cy="0" r="6" fill="#111827" />
        <line x1="0" y1="-88" x2="0" y2="-72" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="88" y1="0" x2="72" y2="0" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="0" y1="88" x2="0" y2="72" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="-88" y1="0" x2="-72" y2="0" stroke="#111827" stroke-width="6" stroke-linecap="round"/>
        <line x1="0" y1="0" x2="0" y2="-60" stroke="#ef4444" stroke-width="8" stroke-linecap="round"/>
        <line x1="0" y1="0" x2="50" y2="15" stroke="#111827" stroke-width="7" stroke-linecap="round"/>
        <path d="M 120 -40 A 135 135 0 0 1 130 40" fill="none" stroke="#6366f1" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round" />
      </g>

      <!-- Surprised Stick Figure Running Out of Time -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="-10" cy="-115" r="4" fill="#111827" />
        <circle cx="10" cy="-115" r="4" fill="#111827" />
        <ellipse cx="0" cy="-96" rx="8" ry="12" fill="#ef4444" stroke="#111827" stroke-width="3" />
        <path d="M -18 -130 Q -10 -138 0 -130" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M 18 -130 Q 10 -138 0 -130" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 60 -50 110 -80" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -40 -20 -60 20" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-45" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="45" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isBrainOrIdea) {
    centralIllustration = `
      <!-- Glowing Lightbulb & Brain System -->
      <g transform="translate(${propX}, ${propY})">
        <circle cx="0" cy="0" r="95" fill="#fef08a" opacity="0.45" />
        <path d="M -45 -20 C -60 -70 60 -70 45 -20 C 35 10 25 25 20 45 L -20 45 C -25 25 -35 10 -45 -20 Z" fill="#ffffff" stroke="#111827" stroke-width="8" stroke-linejoin="round" />
        <path d="M -15 -25 C -25 -40 -5 -50 0 -35 C 5 -50 25 -40 15 -25 C 20 -10 5 0 0 15 C -5 0 -20 -10 -15 -25 Z" fill="#fee2e2" stroke="#ef4444" stroke-width="5" />
        <rect x="-18" y="45" width="36" height="12" rx="4" fill="#e2e8f0" stroke="#111827" stroke-width="6" />
        <rect x="-14" y="57" width="28" height="10" rx="3" fill="#cbd5e1" stroke="#111827" stroke-width="5" />
        <line x1="0" y1="-85" x2="0" y2="-115" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="-70" y1="-70" x2="-95" y2="-95" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
        <line x1="70" y1="-70" x2="95" y2="-95" stroke="#f59e0b" stroke-width="6" stroke-linecap="round" />
      </g>

      <!-- Eureka Pondering Stickman -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="-6" cy="-120" r="4" fill="#111827" />
        <circle cx="16" cy="-120" r="4" fill="#111827" />
        <path d="M -8 -96 Q 6 -86 20 -98" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 35 -65 25 -95" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -10 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isMoneyOrFinance) {
    centralIllustration = `
      <!-- Stacks of Gold Coins with Sparkles -->
      <g transform="translate(${propX}, ${propY + 20})">
        <ellipse cx="0" cy="50" rx="65" ry="24" fill="#fde047" stroke="#111827" stroke-width="6" />
        <rect x="-65" y="30" width="130" height="20" fill="#eab308" stroke="#111827" stroke-width="6" />
        <ellipse cx="0" cy="30" rx="65" ry="24" fill="#facc15" stroke="#111827" stroke-width="6" />
        <rect x="-65" y="0" width="130" height="20" fill="#eab308" stroke="#111827" stroke-width="6" />
        <ellipse cx="0" cy="0" rx="65" ry="24" fill="#fde047" stroke="#111827" stroke-width="6" />
        <rect x="-65" y="-30" width="130" height="20" fill="#eab308" stroke="#111827" stroke-width="6" />
        <ellipse cx="0" cy="-30" rx="65" ry="24" fill="#facc15" stroke="#111827" stroke-width="6" />
        <text x="0" y="-22" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="30" fill="#111827" text-anchor="middle">$</text>
        <circle cx="75" cy="-65" r="14" fill="#ef4444" />
      </g>

      <!-- Wealth Stick Figure -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="-10" cy="-115" r="4" fill="#111827" />
        <circle cx="10" cy="-115" r="4" fill="#111827" />
        <path d="M -10 -92 Q 0 -80 10 -92" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 45 -35 90 -10" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -10 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isGrowthOrSuccess) {
    centralIllustration = `
      <!-- Exponential Growth Chart -->
      <g transform="translate(${propX - 80}, ${propY + 50})">
        <line x1="0" y1="40" x2="280" y2="40" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" />
        <line x1="0" y1="40" x2="0" y2="-180" stroke="#94a3b8" stroke-width="5" stroke-linecap="round" />
        <path d="M 0 30 Q 120 25 190 -50 T 270 -160" fill="none" stroke="#ef4444" stroke-width="8" stroke-linecap="round" />
        <polygon points="270,-160 250,-150 265,-130" fill="#ef4444" />
        <circle cx="80" cy="22" r="8" fill="#6366f1" />
        <circle cx="160" cy="-15" r="10" fill="#6366f1" />
        <circle cx="230" cy="-105" r="12" fill="#ef4444" />
      </g>

      <!-- Celebrating Champion Character with Flag -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-90" r="36" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <path d="M -14 -95 Q -8 -105 -2 -95" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M 2 -95 Q 8 -105 14 -95" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <path d="M -10 -78 Q 0 -66 10 -78" fill="none" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
        <line x1="0" y1="-54" x2="0" y2="50" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -30 Q -45 -70 -60 -115" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -30 Q 45 -70 60 -115" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="60" y1="-115" x2="60" y2="-165" stroke="#111827" stroke-width="5" />
        <polygon points="60,-165 110,-150 60,-135" fill="#ef4444" stroke="#111827" stroke-width="3" />
        <line x1="0" y1="50" x2="-40" y2="130" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="50" x2="40" y2="130" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isRobotOrAi) {
    centralIllustration = `
      <!-- AI / Robot Mascot -->
      <g transform="translate(${propX}, ${propY})">
        <!-- Robot Head -->
        <rect x="-60" y="-70" width="120" height="100" rx="20" fill="#ffffff" stroke="#111827" stroke-width="8" />
        <rect x="-42" y="-45" width="30" height="20" rx="6" fill="#38bdf8" />
        <rect x="12" y="-45" width="30" height="20" rx="6" fill="#38bdf8" />
        <line x1="-30" y1="-5" x2="30" y2="-5" stroke="#111827" stroke-width="5" stroke-linecap="round" />
        <!-- Antenna -->
        <line x1="0" y1="-70" x2="0" y2="-105" stroke="#111827" stroke-width="6" />
        <circle cx="0" cy="-105" r="12" fill="#ef4444" stroke="#111827" stroke-width="5" />
        <!-- Ears -->
        <rect x="-75" y="-35" width="15" height="30" rx="4" fill="#cbd5e1" stroke="#111827" stroke-width="5" />
        <rect x="60" y="-35" width="15" height="30" rx="4" fill="#cbd5e1" stroke="#111827" stroke-width="5" />
        <!-- Chip Circuit Accents -->
        <line x1="75" y1="10" x2="120" y2="10" stroke="#6366f1" stroke-width="4" stroke-dasharray="6 6" />
        <circle cx="125" cy="10" r="5" fill="#6366f1" />
      </g>

      <!-- Human interacting with AI -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="8" cy="-115" r="4" fill="#111827" />
        <path d="M 0 -96 Q 10 -88 20 -96" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 40 -35 85 -50" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -30 -10 -40 25" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else if (isObstacleOrWarning) {
    centralIllustration = `
      <!-- Warning / Obstacle Sign -->
      <g transform="translate(${propX}, ${propY})">
        <polygon points="0,-100 -90,70 90,70" fill="#fef08a" stroke="#111827" stroke-width="8" stroke-linejoin="round" />
        <line x1="0" y1="-40" x2="0" y2="15" stroke="#ef4444" stroke-width="9" stroke-linecap="round" />
        <circle cx="0" cy="42" r="6" fill="#ef4444" />
      </g>

      <!-- Cautious Stick Figure -->
      <g transform="translate(${charX}, ${charY})">
        <circle cx="0" cy="-110" r="38" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="-12" cy="-115" r="4" fill="#111827" />
        <circle cx="12" cy="-115" r="4" fill="#111827" />
        <line x1="-15" y1="-92" x2="15" y2="-92" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-72" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -45 Q 40 -20 70 -10" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -45 Q -40 -20 -70 -10" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  } else {
    // Dynamic Speech & Keynote Presenter
    centralIllustration = `
      <!-- Speech Bubble with Scene Topic -->
      <g transform="translate(${cx}, ${isVertical ? cy - 160 : cy - 70})">
        <path d="M -160 -80 C -180 -80 -200 -60 -200 -40 C -200 20 -170 40 -90 40 L -60 80 L -30 40 C 70 40 200 30 200 -40 C 200 -80 160 -80 -160 -80 Z" fill="#ffffff" stroke="#111827" stroke-width="8" stroke-linejoin="round" />
        <text x="0" y="-30" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="28" fill="#111827" text-anchor="middle">
          ${sceneTitle}
        </text>
        <circle cx="-145" cy="-30" r="9" fill="#ef4444" />
        <circle cx="145" cy="-30" r="9" fill="#6366f1" />
      </g>

      <!-- Charismatic Presenter Stick Figure -->
      <g transform="translate(${cx}, ${isVertical ? cy + 140 : cy + 110})">
        <circle cx="0" cy="-100" r="36" fill="#ffffff" stroke="#111827" stroke-width="7" />
        <circle cx="-10" cy="-105" r="4" fill="#111827" />
        <circle cx="10" cy="-105" r="4" fill="#111827" />
        <path d="M -10 -90 Q 0 -80 10 -90" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round" />
        <line x1="0" y1="-64" x2="0" y2="40" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <path d="M 0 -35 Q -55 -55 -95 -35" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <path d="M 0 -35 Q 55 -55 95 -35" fill="none" stroke="#111827" stroke-width="7" stroke-linecap="round" />
        <line x1="0" y1="40" x2="-35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
        <line x1="0" y1="40" x2="35" y2="120" stroke="#111827" stroke-width="8" stroke-linecap="round" />
      </g>
    `;
  }

  // Full Whiteboard Canvas Document
  const svgDoc = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="whiteboardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>
    <filter id="markerShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity="0.09" />
    </filter>
  </defs>

  <!-- Clean Canvas Background -->
  <rect width="${width}" height="${height}" fill="url(#whiteboardBg)" />
  
  <!-- Dashed Framing Border -->
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="22" fill="none" stroke="#e2e8f0" stroke-width="4" stroke-dasharray="16 12" />

  <!-- Corner Guide Accents -->
  <line x1="45" y1="50" x2="75" y2="50" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
  <line x1="50" y1="45" x2="50" y2="75" stroke="#ef4444" stroke-width="5" stroke-linecap="round" />
  <line x1="${width - 45}" y1="${height - 50}" x2="${width - 75}" y2="${height - 50}" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />
  <line x1="${width - 50}" y1="${height - 45}" x2="${width - 50}" y2="${height - 75}" stroke="#6366f1" stroke-width="5" stroke-linecap="round" />

  <!-- Scene Illustration with Shadow -->
  <g filter="url(#markerShadow)">
    ${centralIllustration}
  </g>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgDoc)}`;
}
