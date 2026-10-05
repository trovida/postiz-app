import { RgbaColorPicker } from 'react-colorful';

import { colors } from '../types';
import { rgbaObjectToString } from '../utils';
import { toRgba } from '../color.util';

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

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
