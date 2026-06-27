/**
 * Owo design tokens. Mobile-first, built for low-end Android + patchy data
 * (Section 1): high contrast, generous tap targets, system fonts (no heavy
 * web-font payload).
 */
export const colors = {
  brand: '#1B7F4B', // Owo green — circulation/growth
  brandDark: '#125C36',
  accent: '#F4A300', // Naira-gold accent
  bg: '#0E1512',
  surface: '#16201B',
  text: '#F5F7F6',
  textMuted: '#9DB0A6',
  success: '#3FB46B',
  danger: '#E5484D',
  warning: '#F4A300',
} as const;

export const space = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
} as const;

export const radius = {
  sm: '6px',
  md: '12px',
  lg: '20px',
  pill: '999px',
} as const;

export const font = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  /** Minimum 44px tap target for retail thumbs on cheap phones. */
  minTapTarget: '44px',
} as const;

export const tokens = { colors, space, radius, font } as const;
export type Tokens = typeof tokens;
