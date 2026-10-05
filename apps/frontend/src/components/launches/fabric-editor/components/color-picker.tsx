import { RgbaColorPicker } from 'react-colorful';

import { colors } from '../types';
import { rgbaObjectToString } from '../utils';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

// Parse a CSS rgb/rgba string into react-colorful's {r,g,b,a}; falls back to black.
const toRgba = (value: string) => {
  const match = value?.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const [r, g, b, a] = match[1].split(',').map((n) => parseFloat(n.trim()));
    return {
      r: r || 0,
      g: g || 0,
      b: b || 0,
      a: a === undefined ? 1 : a,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
};

export const ColorPicker = ({ value, onChange }: ColorPickerProps) => {
  return (
    <div className="w-full space-y-4">
      <RgbaColorPicker
        className="!w-full border rounded-lg"
        color={toRgba(value)}
        onChange={(rgba) => onChange(rgbaObjectToString(rgba))}
      />
      <div className="grid grid-cols-6 gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onClick={() =>
              onChange(color === 'transparent' ? 'rgba(0,0,0,0)' : color)
            }
            className="size-7 rounded-full border transition hover:opacity-75"
            style={{
              background:
                color === 'transparent'
                  ? 'conic-gradient(#ccc 25%, #fff 0 50%, #ccc 0 75%, #fff 0)'
                  : color,
            }}
          />
        ))}
      </div>
    </div>
  );
};
