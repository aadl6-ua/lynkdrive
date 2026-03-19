export const colorTokens = {
  primary: '#0D1B2A',
  secondary: '#1B263B',
  accent1: '#F4D35E',
  accent2: '#E36414',
  bgLight: '#F7F7F9',
  bgDark: '#0B0F14',
  textMain: '#121212',
  textMuted: '#5C5C5C',
  border: '#E2E4E8',
  success: '#2ECC71',
  alert: '#E74C3C',
  white: '#FFFFFF'
} as const;

export const spacingTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 56
} as const;

export const radiusTokens = {
  input: 10,
  card: 12,
  nav: 14,
  pill: 999
} as const;

export const typographyTokens = {
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as const,
    letterSpacing: 0.25
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0.1
  },
  sectionLabel: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700' as const,
    letterSpacing: 0.2
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0.1
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.15
  }
} as const;

export const motionTokens = {
  durationShortMs: 180,
  durationMediumMs: 240
} as const;

export const shadowTokens = {
  card: {
    shadowColor: '#0B0F14',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 2
  }
} as const;
