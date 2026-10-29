import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ExportJob, ExportRequest } from '../../shared/editor.types';
import { cropSubtitles, serializeSrt } from '../../shared/subtitles.utils';
import { exportDirectory, ffmpegPath } from '../config';
import { buildExportArguments } from './ffmpeg-export.service';
import type { StoredMedia } from './media.service';
import { gifOutputSize, resolveGifSubtitleSettings } from '../../shared/gif-subtitle.utils';
import { resolveComposition } from '../../shared/composition.utils';
import { serializeGifSubtitles } from './gif-subtitles.service';

type InternalJob = ExportJob & {
  request: ExportRequest;
  media: StoredMedia;
  directory: string;
  process?: ChildProcess;
};
const jobs = new Map<string, InternalJob>();
let activeJob: string | undefined;

export function publicJob(job: InternalJob): ExportJob {
  const { id, status, progress, error, downloadUrl, filename } = job;
  return { id, status, progress, error, downloadUrl, filename };
}

export function getExportJob(id: string) {
  return jobs.get(id);
}

export function createExportJob(request: ExportRequest, media: StoredMedia): ExportJob {
  if (
    [...jobs.values()].filter((job) => ['queued', 'processing'].includes(job.status)).length >= 10
  )
    throw new Error('The export queue is full. Wait for an export to finish.');
  const id = randomUUID();
  const stem =
    media.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .slice(0, 100) || 'video';
  const job: InternalJob = {
    id,
    status: 'queued',
    progress: 0,
    request,
    media,
    directory: path.join(exportDirectory, id),
    filename: `${stem}-edited.${request.format}`,
  };
  jobs.set(id, job);
  void processNextExport();
  return publicJob(job);
}

export function cancelExportJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  if (job.status === 'queued' || job.status === 'processing') {
    job.status = 'cancelled';
    job.process?.kill('SIGTERM');
  }
}

async function processNextExport() {
  if (activeJob) return;
  const job = [...jobs.values()].find((item) => item.status === 'queued');
  if (!job) return;
  activeJob = job.id;
  job.status = 'processing';
  try {
    await mkdir(job.directory, { recursive: true });
    const croppedCues = cropSubtitles(job.request.cues, job.request.range);
    await writeFile(path.join(job.directory, 'captions.srt'), serializeSrt(croppedCues));
    if (job.request.format === 'gif' && job.request.burnSubtitles && croppedCues.length) {
      const { canvas } = resolveComposition(job.request, job.media);
      await writeFile(
        path.join(job.directory, 'captions.ass'),
        serializeGifSubtitles(
          croppedCues,
          gifOutputSize(canvas, job.request.gifWidth),
          resolveGifSubtitleSettings(job.request),
        ),
      );
    }
    if ((job as InternalJob).status === 'cancelled') return;
    await runExportProcess(job);
    if ((job as InternalJob).status !== 'cancelled') {
      job.status = 'complete';
      job.progress = 100;
      job.downloadUrl = `/api/exports/${job.id}/download`;
    }
  } catch (error) {
    if ((job as InternalJob).status !== 'cancelled') {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Video export failed.';
    }
  } finally {
    job.process = undefined;
    activeJob = undefined;
    void processNextExport();
  }
}

function runExportProcess(job: InternalJob): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, buildExportArguments(job.request, job.media), {
      cwd: job.directory,
    });
    job.process = child;
    let diagnostic = '';
    let pending = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Export exceeded the one-hour processing limit.'));
    }, 3_600_000);
    child.stderr?.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-6000);
    });
    child.stdout?.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/);
        if (match)
          job.progress = Math.min(
            99,
            Math.round(
              (Number(match[1]) / 1_000_000 / (job.request.range.end - job.request.range.start)) *
                100,
            ),
          );
      }
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start FFmpeg: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || job.status === 'cancelled') resolve();
      else {
        console.error('FFmpeg export failed:', diagnostic);
        reject(new Error('FFmpeg could not export this video. Check the server log for details.'));
      }
    });
  });
}

export function stopAllExports() {
  for (const job of jobs.values()) cancelExportJob(job.id);
}
