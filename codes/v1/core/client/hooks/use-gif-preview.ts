import { useEffect, useState } from 'react';
import type { ExportRequest } from '../../shared/editor.types';

export function useGifPreview(request: ExportRequest | null, previewTime: number | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payload =
    request && previewTime !== null ? JSON.stringify({ ...request, previewTime }) : null;
  useEffect(() => {
    if (!payload) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let createdUrl: string | null = null;
    setUrl(null);
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/exports/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error || 'Could not render preview.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
        setError(null);
      } catch (failure) {
        if (!controller.signal.aborted) {
          setUrl(null);
          setError(failure instanceof Error ? failure.message : 'Could not render preview.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [payload]);
  return { url, loading, error };
}
