import { useEffect, useRef } from 'react';

/**
 * Minimal local replacement for react-use's `useEvent` (React-19-safe, zero deps).
 * Attaches a listener to a target (default: window) for the lifetime of the component.
 */
export const useEvent = (
  name: string,
  handler: (event: any) => void,
  target: any = typeof window !== 'undefined' ? window : null,
) => {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!target?.addEventListener) return;
    const listener = (event: any) => saved.current(event);
    target.addEventListener(name, listener);
    return () => target.removeEventListener(name, listener);
  }, [name, target]);
};
