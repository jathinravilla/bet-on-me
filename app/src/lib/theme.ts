// Design tokens — "Glacier": deep navy surfaces, glacier-blue accents, crisp white type.
// Flat and data-first: hairline borders, no gradients on surfaces, sentence-case Inter type.
// Yellow (`attention`) is reserved for the few things that need the player right now:
// notification badges, bets about to end, invites waiting, and actions only they can take.
// Every screen uses these; no ad-hoc hex values.
export const colors = {
  bg: '#06101F',
  bgRaised: '#0A1730',
  surface: '#0C1B36',
  surfaceHi: '#132647',
  border: '#1B2F52',
  borderHi: '#2A4572',
  hairline: '#152846',
  text: '#F7FBFF',
  textMuted: '#93A9C6',
  textDim: '#5F7697',
  primary: '#9AD7F5', // glacier blue — main actions, selection, links
  primarySoft: 'rgba(154,215,245,0.12)',
  primaryDeep: '#4E98C4', // the "block" edge under primary buttons
  onPrimary: '#071A36', // navy text on glacier
  glacierDeep: '#3D7FB8',
  attention: '#FFD24D', // the only yellow: needs the player's attention
  onAttention: '#2A1F00',
  hot: '#FFD24D', // "ending soon" / live urgency (same as attention, kept for readability)
  violet: '#8FB2FF', // periwinkle — social accents
  volt: '#7FE6EE', // ice aqua
  cyan: '#7FE6EE',
  orange: '#FFB98A',
  success: '#4FD1A1',
  successBg: 'rgba(79,209,161,0.10)',
  danger: '#FF7B8A',
  dangerBg: 'rgba(255,123,138,0.10)',
  attentionSoft: 'rgba(255,210,77,0.10)',
  warn: '#C9DDF2', // informational (settling, demo tools) — not yellow
  ink: '#071A36', // mascot outline
  butter: '#FFF1C7', // mascot body: pale cream, reads almost white
  coin: '#CFEAF8', // coin face
  scrim: 'rgba(3,8,20,0.75)',
} as const;

/** Two-stop gradients (start → end). */
export const gradients = {
  glacier: ['#CDEFFF', '#7FC0E8'],
  hype: ['#2F74BD', '#0F2C60'],
  run: ['#A6F0F5', '#4FB6DA'],
  chess: ['#BCD0FF', '#6C8FE6'],
  dare: ['#FFFFFF', '#A9CCF0'],
  custom: ['#E1F4FF', '#7FB0E0'],
  stage: ['#15315F', '#071229'],
  attention: ['#FFE07A', '#FFC21F'],
} as const satisfies Record<string, readonly [string, string]>;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 18, pill: 999 } as const;
export const icon = { sm: 16, md: 22, lg: 28 } as const;
export const touch = 48;
export const motion = { tap: 100, quick: 180, enter: 320, slow: 900 } as const;
export const TAB_BAR_HEIGHT = 60;

export const fonts = {
  display: 'Inter_700Bold',
  displaySemi: 'Inter_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const categoryMeta = {
  strava: { label: 'Running', icon: 'run-fast', unit: 'mi', color: '#7FE6EE', gradient: gradients.run },
  chess: { label: 'Chess', icon: 'chess-knight', unit: 'elo', color: '#9FBBFF', gradient: gradients.chess },
  dare: { label: 'Dare', icon: 'drama-masks', unit: '', color: '#E6F2FF', gradient: gradients.dare },
} as const;
