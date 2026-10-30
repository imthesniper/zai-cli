// ZC semantic design tokens. Not copied from any other coding assistant.
// Explicit palettes own the canvas. Auto owns neither the background nor the
// foreground: it honors the user's terminal colors and uses dim/bold semantics.
export const THEME_COLORS = Object.freeze({
  dark: Object.freeze({
    background: '#13151A', // graphite
    text: '#EDF0F5',       // primary
    muted: '#B4BEC9',      // secondary text
    faint: '#96A1AD',      // help and tertiary metadata, still readable
    border: '#8392A3',     // intentional structure, not the brand accent
    accent: '#A0C4FF',     // action/focus
    user: '#DBE6F6',       // user text
    code: '#DEE6F0',       // code without a distracting unrelated hue
    success: '#89D8B3',    // affirmative/guarded
    warn: '#F0C985',       // attention, not decoration
    error: '#F0ACAC',      // error
  }),
  light: Object.freeze({
    background: '#FAFAF7', // warm paper, not harsh white
    text: '#1B2533',
    muted: '#586475',
    faint: '#647387',
    border: '#627183',
    accent: '#185EA4',
    user: '#294A6A',
    code: '#384E64',
    success: '#18704A',
    warn: '#875700',
    error: '#A52C3E',
  }),
});

export function hexToRgb(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new TypeError('Color must be a 6-digit hex value.');
  }
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
}
const foreground = hex => '38;2;' + hexToRgb(hex).join(';');
const background = hex => '48;2;' + hexToRgb(hex).join(';');

export const THEMES = Object.freeze({
  dark: Object.freeze(Object.fromEntries(Object.entries(THEME_COLORS.dark).map(([role,hex]) =>
    [role, role === 'background' ? background(hex) : foreground(hex)]))),
  light: Object.freeze(Object.fromEntries(Object.entries(THEME_COLORS.light).map(([role,hex]) =>
    [role, role === 'background' ? background(hex) : foreground(hex)]))),
  auto: Object.freeze({
    background: '', text: '39', user: '39', code: '39',
    muted: '2;39', faint: '2;39', border: '2;39',
    accent: '1;39', success: '32', warn: '33', error: '31',
  }),
});

export function contrastRatio(foregroundHex, backgroundHex) {
  const luminance = hex => {
    const [r, g, b] = hexToRgb(hex).map(x => {
      const v = x / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const a = luminance(foregroundHex), b = luminance(backgroundHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
