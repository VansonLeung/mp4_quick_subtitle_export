import { useEffect, useState } from 'react';
import type { ExportJob, ExportRequest } from '../../shared/editor.types';
import { requestJson, startExport } from '../lib/api';

export function useExportJob() {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = starting || job?.status === 'queued' || job?.status === 'processing';

  useEffect(() => {
    if (!job || !['queued', 'processing'].includes(job.status)) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const latest = await requestJson<ExportJob>(`/api/exports/${job!.id}`);
        if (disposed) return;
        setError(null);
        setJob(latest);
        if (['queued', 'processing'].includes(latest.status)) timeout = setTimeout(poll, 750);
      } catch (failure) {
        if (disposed) return;
        setError(
          failure instanceof Error ? failure.message : 'Could not check export progress. Retrying…',
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

  async function begin(request: ExportRequest) {
    setError(null);
    setStarting(true);
    try {
      setJob(await startExport(request));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Export could not start.');
    } finally {
      setStarting(false);
    }
  }
  async function cancel() {
    if (!job) return;
    try {
      await fetch(`/api/exports/${job.id}`, { method: 'DELETE' });
      setJob({ ...job, status: 'cancelled' });
    } catch {
      setError('Could not cancel the export. Try again.');
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
