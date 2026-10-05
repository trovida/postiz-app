import React from 'react';
import { render } from '@testing-library/react';

// Capture the props the editor canvas is given, so we can drive onUse/uploadImage.
let captured: any = {};
jest.mock('./components/editor', () => ({
  EditorCanvas: (props: any) => {
    captured = props;
    return null;
  },
}));

// Postiz seams — mock the two platform hooks the editor touches.
const mockFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({
    set: (p: string) => `https://cdn.example/uploads/${p}`,
  }),
}));

// eslint-disable-next-line import/first
import DesignEditor from './index';

describe('fabric-editor DesignEditor (Postiz seam)', () => {
  beforeEach(() => {
    captured = {};
    mockFetch.mockReset();
  });

  it('wires width/height/onUse/uploadImage through to the editor canvas', () => {
    render(
      <DesignEditor
        setMedia={jest.fn()}
        closeModal={jest.fn()}
        width={300}
        height={400}
      />
    );
    expect(captured.width).toBe(300);
    expect(captured.height).toBe(400);
    expect(typeof captured.onUse).toBe('function');
    expect(typeof captured.uploadImage).toBe('function');
  });

  it('defaults width/height when the modal omits them', () => {
    render(<DesignEditor setMedia={jest.fn()} closeModal={jest.fn()} />);
    expect(captured.width).toBe(540);
    expect(captured.height).toBe(675);
  });

  it('uploadImage POSTs the file to /media/upload-simple and returns a servable URL', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ id: 'm1', path: '2026/img.png' }),
    });
    render(<DesignEditor setMedia={jest.fn()} closeModal={jest.fn()} />);

    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const url = await captured.uploadImage(file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = mockFetch.mock.calls[0];
    expect(endpoint).toBe('/media/upload-simple');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get('file')).toBe(file);
    // routed through useMediaDirectory.set → same-origin URL
    expect(url).toBe('https://cdn.example/uploads/2026/img.png');
  });

  it('onUse exports the artboard, uploads it, hands {id,path} to setMedia, then closes', async () => {
    const setMedia = jest.fn();
    const closeModal = jest.fn();
    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    const editor = { exportToBlob: jest.fn().mockResolvedValue(blob) };
    mockFetch.mockResolvedValue({
      json: async () => ({ id: 'd1', path: '2026/design.png' }),
    });

    render(<DesignEditor setMedia={setMedia} closeModal={closeModal} />);
    await captured.onUse(editor as any);

    expect(editor.exportToBlob).toHaveBeenCalledTimes(1);
    const [endpoint, opts] = mockFetch.mock.calls[0];
    expect(endpoint).toBe('/media/upload-simple');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(setMedia).toHaveBeenCalledWith([{ id: 'd1', path: '2026/design.png' }]);
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
