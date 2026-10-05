/**
 * Parse a CSS rgb/rgba() string into react-colorful's {r,g,b,a}.
 * Falls back to opaque black for anything unparseable.
 * Pure — no fabric/react deps, so it is cheap to unit-test.
 */
export const toRgba = (
  value: string
): { r: number; g: number; b: number; a: number } => {
  const match = value?.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const [r, g, b, a] = match[1].split(',').map((n) => parseFloat(n.trim()));
    return {
      r: r || 0,
      g: g || 0,
      b: b || 0,
      a: a === undefined || Number.isNaN(a) ? 1 : a,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
};
