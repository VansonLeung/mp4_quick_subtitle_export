import { useEffect, useState } from 'react';
import type { VideoImportJob } from '../../shared/editor.types';
import { cancelVideoImport, getVideoImport, startVideoImport } from '../lib/api';

export function useVideoImportJob() {
  const [job, setJob] = useState<VideoImportJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = starting || job?.status === 'queued' || job?.status === 'processing';

  useEffect(() => {
    if (!job || !['queued', 'processing'].includes(job.status)) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const latest = await getVideoImport(job!.id);
        if (disposed) return;
        setError(null);
        setJob(latest);
        if (['queued', 'processing'].includes(latest.status)) timeout = setTimeout(poll, 750);
      } catch (failure) {
        if (disposed) return;
        setError(
          failure instanceof Error ? failure.message : 'Could not check import progress. Retrying…',
        );
        timeout = setTimeout(poll, 2500);
      }
    }
    timeout = setTimeout(poll, 350);
    return () => {
      disposed = true;
      clearTimeout(timeout);
    };
  }, [job?.id, job?.status]);

  async function begin(url: string) {
    setError(null);
    setStarting(true);
    try {
      setJob(await startVideoImport(url));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Video import could not start.');
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!job) return;
    try {
      setJob(await cancelVideoImport(job.id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not cancel the video import.');
    }
  }

  return {
    job,
    busy,
    error,
    begin,
    cancel,
    clear: () => {
      setJob(null);
      setError(null);
    },
  };
}
