import { toRgba } from './color.util';

describe('fabric-editor toRgba (react-colorful adapter)', () => {
  it('parses an rgba() string', () => {
    expect(toRgba('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it('parses an rgb() string and defaults alpha to 1', () => {
    expect(toRgba('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('tolerates extra whitespace', () => {
    expect(toRgba('rgba( 1 , 2 , 3 , 1 )')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
  });

  it('treats alpha 0 as transparent (not defaulted to 1)', () => {
    expect(toRgba('rgba(0,0,0,0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('falls back to opaque black for a hex string', () => {
    expect(toRgba('#ff0000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it('falls back to opaque black for empty / undefined input', () => {
    expect(toRgba('')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    // @ts-expect-error — exercising the undefined guard
    expect(toRgba(undefined)).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});
