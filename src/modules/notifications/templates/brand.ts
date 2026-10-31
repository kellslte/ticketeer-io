export const BRAND = {
  name: 'Ticketeer',
  legalName: 'Ticketeer, Inc.',
  domain: 'ticketeer.io',
  supportEmail: 'support@ticketeer.io',
  tagline: 'Modern, reliable issue resolution & support ticketing',
  colors: {
    primary: '#4F46E5', // Indigo 600
    primaryDark: '#4338CA', // Indigo 700
    primaryLight: '#EEF2FF', // Indigo 50
    secondary: '#7C3AED', // Violet 600
    gradientStart: '#4F46E5',
    gradientEnd: '#7C3AED',
    textMain: '#0F172A', // Slate 900
    textMuted: '#475569', // Slate 600
    textLight: '#94A3B8', // Slate 400
    background: '#F8FAFC', // Slate 50
    cardBackground: '#FFFFFF',
    border: '#E2E8F0', // Slate 200
    codeBackground: '#F1F5F9', // Slate 100
    // Status color mapping
    status: {
      open: {
        label: 'Open',
        color: '#3730A3', // Indigo 800
        background: '#EEF2FF', // Indigo 50
        border: '#C7D2FE', // Indigo 200
      },
      in_progress: {
        label: 'In Progress',
        color: '#92400E', // Amber 800
        background: '#FEF3C7', // Amber 100
        border: '#FDE68A', // Amber 200
      },
      resolved: {
        label: 'Resolved',
        color: '#065F46', // Emerald 800
        background: '#D1FAE5', // Emerald 100
        border: '#A7F3D0', // Emerald 200
      },
      closed: {
        label: 'Closed',
        color: '#334155', // Slate 700
        background: '#F1F5F9', // Slate 100
        border: '#CBD5E1', // Slate 300
      },
    },
  },
  typography: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    codeFontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
} as const;

export type TicketStatusKey = keyof typeof BRAND.colors.status;

