/**
 * Proven Brand Colors & Theme Constants
 * Supports both Light and Dark modes
 */

// Theme colors interface
export interface ThemeColors {
  // Primary Brand Colors
  provenDark: string;
  provenGreen: string;
  softPurple: string;
  warmGray: string;

  // Accent Gradient Colors
  coral: string;
  coralMid: string;
  coralOrange: string;
  orange: string;

  // Background Colors
  background: string;
  cardBackground: string;

  // Text Colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accent Colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // UI Elements
  border: string;
  shadow: string;
  tabBarBackground: string;
  tabBarInactive: string;

  // Status Pills
  statusFree: string;
  statusActive: string;
  statusCompleted: string;
}

// Light Mode Colors
export const lightColors: ThemeColors = {
  // Primary Brand Colors
  provenDark: '#2D1810',
  provenGreen: '#923534',  // Brand color (burgundy/maroon)
  softPurple: '#C9AABA',
  warmGray: '#EFE6DD',

  // Accent Gradient Colors (coral to orange)
  coral: '#FF5757',
  coralMid: '#FF6056',
  coralOrange: '#FF7053',
  orange: '#FF7E50',

  // Background Colors
  background: '#FDFBF8',
  cardBackground: '#FFFFFF',

  // Text Colors
  textPrimary: '#2D1810',
  textSecondary: '#6B5750',
  textMuted: '#9A8A85',

  // Accent Colors
  success: '#4CAF50',
  warning: '#FF7E50',
  error: '#E53935',
  info: '#2196F3',

  // UI Elements
  border: '#E8E0D8',
  shadow: 'rgba(45, 24, 16, 0.12)',
  tabBarBackground: '#FFFFFF',
  tabBarInactive: '#9A8A85',

  // Status Pills
  statusFree: '#FF5757',
  statusActive: '#FF7053',
  statusCompleted: '#C9AABA',
};

// Dark Mode Colors
export const darkColors: ThemeColors = {
  // Primary Brand Colors (adjusted for dark mode)
  provenDark: '#FDFBF8',  // Inverted for dark backgrounds
  provenGreen: '#C96B6A',  // Lighter version of brand color
  softPurple: '#C9AABA',
  warmGray: '#3A3A3A',

  // Accent Gradient Colors (same, they work on dark)
  coral: '#FF5757',
  coralMid: '#FF6056',
  coralOrange: '#FF7053',
  orange: '#FF7E50',

  // Background Colors
  background: '#121212',
  cardBackground: '#1E1E1E',

  // Text Colors
  textPrimary: '#FDFBF8',
  textSecondary: '#B0A8A4',
  textMuted: '#7A7270',

  // Accent Colors (same, vibrant colors work on dark)
  success: '#66BB6A',
  warning: '#FF9E70',
  error: '#EF5350',
  info: '#42A5F5',

  // UI Elements
  border: '#2E2E2E',
  shadow: 'rgba(0, 0, 0, 0.3)',
  tabBarBackground: '#1E1E1E',
  tabBarInactive: '#7A7270',

  // Status Pills
  statusFree: '#FF5757',
  statusActive: '#FF7053',
  statusCompleted: '#C9AABA',
};

// Default export for backward compatibility
// Components should migrate to using useTheme().colors
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const typography = {
  heading1: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  heading2: {
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  heading3: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
} as const;

// Shadow styles - need to be functions to use dynamic colors
export const createShadows = (themeColors: ThemeColors) => ({
  sm: {
    shadowColor: themeColors.provenDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: themeColors.provenDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: themeColors.provenDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
});

// Default shadows for backward compatibility
export const shadows = createShadows(lightColors);
