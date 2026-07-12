// app/theme/designTokens.ts
// Design system "Candy Crush" de FamiLyfe : couleurs vives et saturées,
// dégradés sucrés, coins très arrondis, ombres colorées façon bonbon.
// Source de vérité : SPEC.md section 4.

export const candy = {
  pink: '#FF4E9B',
  pinkDark: '#E23A82',
  purple: '#7B5CFF',
  purpleDark: '#5E3EE0',
  blue: '#3AC8FF',
  blueDark: '#1EA8E8',
  green: '#3FD98B',
  greenDark: '#22B86E',
  yellow: '#FFD23F',
  yellowDark: '#F5B700',
  orange: '#FF8A3D',
  orangeDark: '#F26C1B',
  red: '#FF5B6E',
  cream: '#FFF6E9',
  white: '#FFFFFF',
};

export const text = {
  dark: '#3A2A5B',
  body: '#6B5B8A',
  light: '#FFFFFF',
  muted: '#A99BC4',
};

export const colors = {
  candy,
  text,
  primary: {
    main: candy.pink,
    dark: candy.pinkDark,
    subtle: 'rgba(255,78,155,0.12)',
    border: 'rgba(255,78,155,0.35)',
  },
  secondary: {
    main: candy.purple,
    dark: candy.purpleDark,
    subtle: 'rgba(123,92,255,0.12)',
    border: 'rgba(123,92,255,0.35)',
  },
  background: candy.cream,
  card: candy.white,
  border: 'rgba(58,42,91,0.08)',
  overlay: 'rgba(58,42,91,0.45)',
  statut: {
    a_faire: candy.orange,
    en_cours: candy.blue,
    termine: candy.green,
  },
};

export const gradients = {
  // Fond pastel clair, sucré, utilisé derrière tous les écrans.
  appBackground: ['#FFE9F3', '#F3E8FF', '#E8F6FF'] as const,
  primary: ['#FF6FB1', '#FF4E9B', '#7B5CFF'] as const,
  candyPink: ['#FF8FC4', '#FF4E9B'] as const,
  candyPurple: ['#9B7BFF', '#5E3EE0'] as const,
  candyBlue: ['#7ADBFF', '#1EA8E8'] as const,
  candyGreen: ['#7DEBB2', '#22B86E'] as const,
  candyOrange: ['#FFB36B', '#F26C1B'] as const,
  candyYellow: ['#FFE27A', '#F5B700'] as const,
  progressDone: ['#7DEBB2', '#22B86E'] as const,
  tabBubble: ['#FF6FB1', '#7B5CFF'] as const,
};

// --- Mode sombre --------------------------------------------------------
// Palette bonbon "nuit sucrée" : mêmes couleurs candy/accents vives (elles
// restent lisibles sur fond sombre), mais fond/cartes/texte inversés.
// Consommé par `src/contexts/ThemeContext.tsx` (voir `useTheme()`), qui
// fournit un objet `colors` équivalent à celui-ci mais basé sur ces valeurs
// quand le mode sombre est actif.
export const darkText = {
  dark: '#F5F0FF',
  body: '#CFC3EA',
  light: '#FFFFFF',
  muted: '#8F7FB8',
};

export const darkColors = {
  candy,
  text: darkText,
  primary: {
    main: candy.pink,
    dark: candy.pinkDark,
    subtle: 'rgba(255,78,155,0.22)',
    border: 'rgba(255,78,155,0.4)',
  },
  secondary: {
    main: candy.purple,
    dark: candy.purpleDark,
    subtle: 'rgba(123,92,255,0.22)',
    border: 'rgba(123,92,255,0.4)',
  },
  background: '#1B1330',
  card: '#2A2049',
  border: 'rgba(255,255,255,0.1)',
  overlay: 'rgba(0,0,0,0.6)',
  statut: {
    a_faire: candy.orange,
    en_cours: candy.blue,
    termine: candy.green,
  },
};

export const darkGradients = {
  ...gradients,
  appBackground: ['#1B1330', '#241A3D', '#16233A'] as const,
};

export const typography = {
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },
  letterSpacing: {
    tight: -0.2,
    normal: 0,
    wide: 0.3,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
};

export const borderRadius = {
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  card: 24,
  pill: 999,
};

// Ombres douces / colorées (glow) réutilisables dans toute l'app.
export const shadows = {
  soft: {
    shadowColor: '#3A2A5B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  candyPink: {
    shadowColor: candy.pink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  candyPurple: {
    shadowColor: candy.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  candyBlue: {
    shadowColor: candy.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 8,
  },
  candyGreen: {
    shadowColor: candy.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 8,
  },
  candyOrange: {
    shadowColor: candy.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 8,
  },
  candyYellow: {
    shadowColor: candy.yellowDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
};

export const motion = {
  pressScale: 0.95,
  spring: { friction: 6, tension: 140 },
};

const designTokens = { colors, gradients, typography, spacing, borderRadius, shadows, motion };
export default designTokens;
