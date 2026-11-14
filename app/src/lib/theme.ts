// Design tokens — "Vibrant & Block-based", dark. Every screen uses these; no ad-hoc hex values.
export const colors = {
  bg: '#0B0B0D',
  surface: '#17171B',
  surfaceHi: '#212127',
  border: '#33333C',
  text: '#F8FAFC',
  textMuted: '#B4BAC6',
  primary: '#FFD84D', // butter
  primaryDeep: '#C79B12', // the "block" edge under primary buttons
  onPrimary: '#151203',
  success: '#34D399',
  successBg: '#0E2A20',
  danger: '#F87171',
  dangerBg: '#2E1414',
  warn: '#FDBA74',
  ink: '#1A1605', // mascot outline
  scrim: 'rgba(0,0,0,0.72)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const icon = { sm: 16, md: 22, lg: 28 } as const;
export const touch = 48;
export const motion = { tap: 100, quick: 180, enter: 320, slow: 900 } as const;

export const fonts = {
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
} as const;

export const categoryMeta = {
  strava: { label: 'Running', icon: 'run-fast', unit: 'mi' },
  chess: { label: 'Chess', icon: 'chess-knight', unit: 'elo' },
  dare: { label: 'Dare', icon: 'drama-masks', unit: '' },
} as const;
