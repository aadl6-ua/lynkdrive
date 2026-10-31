import { Platform } from 'react-native';

/**
 * Tokens de diseño de LynkDrive (guía visual Demo 1).
 * Paleta base intacta; se añaden tintes suaves derivados para estados y fondos.
 */
export const colorTokens = {
  primary: '#0D1B2A',
  primaryPressed: '#1F3247',
  secondary: '#1B263B',
  accent1: '#F4D35E',
  accent2: '#E36414',
  accent2Pressed: '#C9550F',
  bgLight: '#F7F7F9',
  bgDark: '#0B0F14',
  surfaceMuted: '#F1F3F6',
  textMain: '#121212',
  textMuted: '#5C5C5C',
  textSubtle: '#6B7079',
  border: '#E2E4E8',
  borderStrong: '#C9CED6',
  success: '#2ECC71',
  successText: '#1E8449',
  successSoft: '#E8F8EF',
  alert: '#E74C3C',
  alertText: '#B03A2E',
  alertSoft: '#FDECEA',
  warningText: '#8A6A00',
  warningSoft: '#FEF8E1',
  accentSoft: '#FDEFE6',
  infoSoft: '#E9EEF6',
  overlay: 'rgba(11,15,20,0.55)',
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
  sm: 8,
  input: 10,
  card: 12,
  lg: 16,
  nav: 14,
  pill: 999
} as const;

/** Familias cargadas en App.tsx (Space Grotesk titulares, Manrope cuerpo/UI). */
export const fontFamilies = {
  heading: 'SpaceGrotesk_700Bold',
  headingMedium: 'SpaceGrotesk_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemibold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold'
} as const;

export const typographyTokens = {
  title: {
    fontFamily: fontFamilies.heading,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700' as const,
    letterSpacing: 0.25
  },
  h2: {
    fontFamily: fontFamilies.heading,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
    letterSpacing: 0.2
  },
  h3: {
    fontFamily: fontFamilies.headingMedium,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: 0.15
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0.1
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700' as const,
    letterSpacing: 0.2
  },
  bodyL: {
    fontFamily: fontFamilies.body,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: '400' as const,
    letterSpacing: 0.1
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0.1
  },
  bodyStrong: {
    fontFamily: fontFamilies.bodySemibold,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: 0.1
  },
  caption: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.15
  },
  captionStrong: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
    letterSpacing: 0.15
  },
  overline: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.8
  }
} as const;

export const motionTokens = {
  durationShortMs: 180,
  durationMediumMs: 240
} as const;

export const shadowTokens = {
  card: {
    shadowColor: '#0B0F14',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 2
  },
  raised: {
    shadowColor: '#0B0F14',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 6
  },
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: {
      width: 0,
      height: 0
    },
    elevation: 0
  }
} as const;

/** Altura mínima táctil recomendada (iOS HIG 44pt / Material 48dp). */
export const HIT_SIZE = 44;

export const layoutTokens = {
  contentMaxWidth: 1100,
  formMaxWidth: 860,
  /** Altura reservada para la barra de pestañas inferior flotante (sin safe area). */
  bottomTabHeight: 78,
  /** Altura reservada para la barra superior en escritorio/web. */
  topNavHeight: 92,
  webCursor: Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null
} as const;
