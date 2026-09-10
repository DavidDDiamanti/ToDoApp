export const COLOR_NAMES = ['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export const PALETTE: Record<ColorName, { label: string; hex: string }> = {
  slate: { label: 'Slate', hex: '#64748B' },
  red: { label: 'Red', hex: '#DC2626' },
  orange: { label: 'Orange', hex: '#EA580C' },
  yellow: { label: 'Yellow', hex: '#CA8A04' },
  green: { label: 'Green', hex: '#16A34A' },
  teal: { label: 'Teal', hex: '#0D9488' },
  blue: { label: 'Blue', hex: '#2563EB' },
  purple: { label: 'Purple', hex: '#7C3AED' },
};

export function isColorName(x: string): x is ColorName {
  return (COLOR_NAMES as readonly string[]).includes(x);
}
