// app/theme/designTokens.ts
// Design system "Chaleureux & maison" de FamiLyfe : une couleur héros (corail),
// de la profondeur (prune), des accents chauds harmonieux (terracotta, ocre,
// sauge, teal doux) sur fond crème. Coins arrondis, ombres douces et chaudes,
// hiérarchie claire (règle 60-30-10). Ambiance foyer premium et accueillante.
//
// NB : les clés du palette gardent leurs noms historiques ("pink", "purple",
// "blue"...) pour rester compatibles avec tout le code existant qui les
// consomme — seules les VALEURS changent. Ainsi la nouvelle DA se propage
// automatiquement à tous les écrans et composants.

export const candy = {
  // "pink" = couleur héros : corail chaleureux
  pink: '#EC5F4E',
  pinkDark: '#CB4230',
  // "purple" = profondeur : prune
  purple: '#6B4460',
  purpleDark: '#4A2C42',
  // "blue" = accent calme (info / en cours / agenda) : teal doux
  blue: '#3E9A9E',
  blueDark: '#2C7B7F',
  // "green" = succès / terminé : sauge
  green: '#6FA36A',
  greenDark: '#4F8A55',
  // "yellow" = mise en avant douce : ocre doré
  yellow: '#DDA24C',
  yellowDark: '#C4842E',
  // "orange" = à faire / chaleur : terracotta
  orange: '#DB8A57',
  orangeDark: '#C06A3C',
  // "red" = danger / pénalité : brique
  red: '#D6402C',
  // fond clair crème chaud
  cream: '#FFF8F0',
  white: '#FFFFFF',
};

export const text = {
  dark: '#3A2833',
  body: '#7A6470',
  light: '#FFFFFF',
  muted: '#B4A2AC',
};

export const colors = {
  candy,
  text,
  primary: {
    main: candy.pink,
    dark: candy.pinkDark,
    subtle: 'rgba(236,95,78,0.12)',
    border: 'rgba(236,95,78,0.35)',
  },
  secondary: {
    main: candy.purple,
    dark: candy.purpleDark,
    subtle: 'rgba(107,68,96,0.12)',
    border: 'rgba(107,68,96,0.35)',
  },
  background: candy.cream,
  card: candy.white,
  // Surface secondaire (chips, inputs, segmented, steppers, sections légères).
  // Crème légèrement plus soutenue que le fond pour se détacher en mode clair —
  // remplacée par un ton foncé chaud en mode sombre.
  surface: '#FCF1E6',
  border: 'rgba(58,40,51,0.08)',
  overlay: 'rgba(58,40,51,0.45)',
  statut: {
    a_faire: candy.orange,
    en_cours: candy.blue,
    termine: candy.green,
  },
};

export const gradients = {
  // Fond crème chaud, doux, utilisé derrière tous les écrans.
  appBackground: ['#FFF8F0', '#FDEFE2', '#FBE7D6'] as const,
  // Dégradé héros corail (CTA principaux, icône d'app, bulle d'onglet active).
  primary: ['#F5836B', '#EC5F4E', '#D9432E'] as const,
  candyPink: ['#FF9A82', '#EC5F4E'] as const,
  candyPurple: ['#8A6180', '#5E3A55'] as const,
  candyBlue: ['#6FC3C6', '#2C7B7F'] as const,
  candyGreen: ['#9CC596', '#4F8A55'] as const,
  candyOrange: ['#EDB185', '#C06A3C'] as const,
  candyYellow: ['#F0CE8A', '#C4842E'] as const,
  progressDone: ['#9CC596', '#4F8A55'] as const,
  tabBubble: ['#F5836B', '#6B4460'] as const,
};

// --- Mode sombre --------------------------------------------------------
// Palette "foyer, le soir" : mêmes accents chauds (corail, terracotta, ocre,
// sauge, teal — ils restent lisibles sur fond sombre), mais fond/cartes/texte
// inversés vers des bruns-prune chauds. Consommé par
// `src/contexts/ThemeContext.tsx` (voir `useTheme()`), qui fournit un objet
// `colors` équivalent à celui-ci mais basé sur ces valeurs quand le mode
// sombre est actif.
export const darkText = {
  dark: '#F7EFEA',
  body: '#E0CFC6',
  light: '#FFFFFF',
  muted: '#B49E96',
};

export const darkColors = {
  candy,
  text: darkText,
  primary: {
    main: candy.pink,
    dark: candy.pinkDark,
    subtle: 'rgba(236,95,78,0.22)',
    border: 'rgba(236,95,78,0.4)',
  },
  secondary: {
    main: '#B87FA6',
    dark: candy.purple,
    subtle: 'rgba(184,127,166,0.22)',
    border: 'rgba(184,127,166,0.4)',
  },
  background: '#221820',
  card: '#322530',
  // Surface secondaire foncée chaude (équivalent sombre de `candy.cream`) :
  // plus claire que la carte pour rester lisible en tant que chip/input.
  surface: '#43333E',
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
  appBackground: ['#221820', '#2C1F28', '#1E1519'] as const,
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

// Ombres douces / chaudes réutilisables dans toute l'app.
export const shadows = {
  soft: {
    shadowColor: '#402637',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  candyPink: {
    shadowColor: candy.pink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 8,
  },
  candyPurple: {
    shadowColor: candy.purple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  candyBlue: {
    shadowColor: candy.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  },
  candyGreen: {
    shadowColor: candy.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  },
  candyOrange: {
    shadowColor: candy.orange,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
    elevation: 8,
  },
  candyYellow: {
    shadowColor: candy.yellowDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
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
