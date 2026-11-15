// Design tokens — navy page, glacier-blue hero surfaces, white paper cards, one yellow action.
// Flat and data-first: hairline borders, no gradients on surfaces, sentence-case Inter type.
// Yellow (`attention`) is reserved for the few things that need the player right now:
// notification badges, bets about to end, invites waiting, and actions only they can take.
// Every screen uses these; no ad-hoc hex values.
export const colors = {
  // Navy: the page and every dark surface. Clearly blue, never near-black.
  bg: '#0A1B3F',
  bgRaised: '#0D2250',
  surface: '#10285A',
  surfaceHi: '#183673',
  border: '#27498A',
  borderHi: '#3D65AD',
  hairline: '#1F3E7C',
  text: '#FFFFFF',
  textMuted: '#AFC4E6',
  textDim: '#7E98C4',
  // Glacier blue: the hero surfaces, selection, links.
  primary: '#A9DDF7',
  primarySoft: 'rgba(169,221,247,0.14)',
  primaryDeep: '#5BAEE0',
  onPrimary: '#0A1B3F',
  glacierDeep: '#4B9AD3',
  ice: '#E6F6FF',
  // Paper: white-ish cards that sit on the navy page, navy type on them.
  paper: '#F4FAFF',
  paperText: '#0A1B3F',
  paperMuted: '#4A638F',
  paperBorder: '#D2E5F6',
  paperTrack: '#DCEBF8',
  // The one yellow: the main action and anything that needs the player right now.
  attention: '#FFD23F',
  onAttention: '#241A00',
  hot: '#FFD23F',
  violet: '#9DB8FF',
  volt: '#8FE3F0',
  cyan: '#8FE3F0',
  orange: '#FFC48F',
  success: '#3FD4A0',
  successBg: 'rgba(63,212,160,0.12)',
  danger: '#FF7B8A',
  dangerBg: 'rgba(255,123,138,0.12)',
  attentionSoft: 'rgba(255,210,63,0.12)',
  warn: '#CFE2F7',
  ink: '#0A1B3F',
  butter: '#FFF1C7',
  coin: '#CFEAF8',
  scrim: 'rgba(4,12,32,0.78)',
} as const;

/** Two-stop gradients (start → end). */
export const gradients = {
  glacier: ['#EAF8FF', '#9DD3F3'],
  hero: ['#E9F7FF', '#8CC8EE'],
  hype: ['#2F6FC4', '#0D2250'],
  run: ['#BDEFF7', '#5FB9E0'],
  chess: ['#C9D8FF', '#7C9BE8'],
  dare: ['#FFFFFF', '#B6D6F2'],
  custom: ['#E1F4FF', '#7FB0E0'],
  stage: ['#18357A', '#0A1B3F'],
  attention: ['#FFE07A', '#FFC21F'],
} as const satisfies Record<string, readonly [string, string]>;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const icon = { sm: 16, md: 22, lg: 28 } as const;
export const touch = 48;
export const motion = { tap: 100, quick: 180, enter: 320, slow: 900 } as const;
export const TAB_BAR_HEIGHT = 60;

export const fonts = {
  display: 'BarlowCondensed_700Bold', // scoreboard numerals and headlines
  displayHeavy: 'BarlowCondensed_800ExtraBold',
  displaySemi: 'Inter_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const categoryMeta = {
  strava: { label: 'Running', icon: 'run-fast', unit: 'mi', color: '#5BAEE0', gradient: gradients.run },
  chess: { label: 'Chess', icon: 'chess-knight', unit: 'elo', color: '#7C9BE8', gradient: gradients.chess },
  dare: { label: 'Dare', icon: 'drama-masks', unit: '', color: '#4B7FC4', gradient: gradients.dare },
} as const;
