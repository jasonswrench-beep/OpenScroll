/** Colour contrast for course themes (WCAG 2 relative luminance and contrast ratio). */
const channel = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hexOf = ([r, g, b]: number[]) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v!))).toString(16).padStart(2, '0')).join('')}`;
export function luminance(hex: string) { const [r, g, b] = rgb(hex); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); }
export function contrast(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]; return (x + 0.05) / (y + 0.05); }
export const DARK_INK = '#1b1a1f';
/** The text colour for buttons and bands filled with the accent: white or near-black, whichever reads better. */
export function accentInk(accent: string) { return contrast(accent, '#ffffff') >= contrast(accent, DARK_INK) ? '#ffffff' : DARK_INK; }
/** The accent as a text colour on white: the accent itself, or a darker shade of it that reaches 4.5:1. */
export function textAccent(accent: string) {
  let color = rgb(accent);
  for (let i = 0; i < 40 && contrast(hexOf(color), '#ffffff') < 4.5; i++) color = color.map(v => v * 0.9) as [number, number, number];
  return hexOf(color);
}
export const formatRatio = (ratio: number) => `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
