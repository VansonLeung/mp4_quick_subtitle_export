import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { mkdir, readdir, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { VideoImportJob } from '../../shared/editor.types';
import {
  ffmpegPath,
  ffprobePath,
  uploadDirectory,
  ytDlpCookiesPath,
  ytDlpDirectory,
  ytDlpPython,
} from '../config';
import { inspectMediaFile } from './media.service';

const executeFile = promisify(execFile);
type InternalVideoImportJob = VideoImportJob & {
  sourceUrl: string;
  process?: ChildProcess;
  directory?: string;
  storedPath?: string;
};

const jobs = new Map<string, InternalVideoImportJob>();
let activeJob: string | undefined;
export const ytDlpFormatSelector =
  'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo*+bestaudio/best';

export function buildBrowserCompatibleArguments(inputPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map_metadata',
    '0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ];
}

export function buildYtDlpArguments(sourceUrl: string, outputTemplate: string): string[] {
  const args = [
    '-m',
    'yt_dlp',
    '--ignore-config',
    '--no-playlist',
    '--newline',
    '--progress',
    '--js-runtimes',
    `node:${process.execPath}`,
    '--format',
    ytDlpFormatSelector,
    '--merge-output-format',
    'mp4',
    '--recode-video',
    'mp4',
    '--max-filesize',
    '4G',
    '--ffmpeg-location',
    ffmpegPath,
    '--output',
    outputTemplate,
  ];
  if (ytDlpCookiesPath) args.push('--cookies', ytDlpCookiesPath);
  args.push(sourceUrl);
  return args;
}

export function validateVideoImportUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096)
    throw new Error('Enter a valid public video URL.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid public video URL.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !hostname ||
    url.username ||
    url.password ||
    isIP(hostname) ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Use an HTTP(S) URL for a public video page.');
  }
  return url.toString();
}

export function publicVideoImportJob(job: InternalVideoImportJob): VideoImportJob {
  const { id, status, progress, error, output, media } = job;
  return { id, status, progress, error, output, media };
}

export function sanitizeYtDlpOutput(output: string): string {
  return output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(-3000)
    .trim();
}

export function getVideoImportJob(id: string) {
  return jobs.get(id);
}

export function createVideoImportJob(value: unknown): VideoImportJob {
  const sourceUrl = validateVideoImportUrl(value);
  if ([...jobs.values()].filter((job) => ['queued', 'processing'].includes(job.status)).length >= 3)
    throw new Error('The video import queue is full. Wait for an import to finish.');
  const job: InternalVideoImportJob = {
    id: randomUUID(),
    sourceUrl,
    status: 'queued',
    progress: 0,
  };
  jobs.set(job.id, job);
  console.info(`[yt-dlp:${job.id}] Queued video import from ${new URL(sourceUrl).host}.`);
  void processNextImport();
  return publicVideoImportJob(job);
}

export function cancelVideoImportJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  if (job.status === 'queued' || job.status === 'processing') {
    job.status = 'cancelled';
    console.info(`[yt-dlp:${job.id}] Video import cancelled.`);
    job.process?.kill('SIGTERM');
  }
}

async function processNextImport() {
  if (activeJob) return;
  const job = [...jobs.values()].find((item) => item.status === 'queued');
  if (!job) return;
  activeJob = job.id;
  job.status = 'processing';
  try {
    job.directory = path.join(uploadDirectory, `import-${job.id}`);
    await mkdir(job.directory, { recursive: true });
    if (isCancelled(job)) return;
    await runYtDlp(job);
    if (isCancelled(job)) return;
    const entries = await readdir(job.directory, { withFileTypes: true });
    const videos = entries.filter((entry) => entry.isFile() && /\.(mp4|m4v)$/i.test(entry.name));
    if (videos.length !== 1) {
      throw new Error('yt-dlp did not produce one MP4 or M4V video. Choose a direct video URL.');
    }
    const downloadedPath = path.join(job.directory, videos[0].name);
    const downloadedSize = (await stat(downloadedPath)).size;
    if (downloadedSize > 4 * 1024 ** 3)
      throw new Error('Downloaded video exceeds the 4 GB import limit.');
    job.phase = 'converting';
    job.progress = 80;
    job.output = sanitizeYtDlpOutput(
      `${job.output || ''}\nConverting to browser-compatible H.264/AAC MP4…`,
    );
    console.info(`[yt-dlp:${job.id}] Converting download to browser-compatible H.264/AAC MP4.`);
    const convertedPath = path.join(job.directory, 'browser-compatible.mp4');
    await convertVideoForBrowser(job, downloadedPath, convertedPath);
    if (isCancelled(job)) return;
    const convertedSize = (await stat(convertedPath)).size;
    if (convertedSize > 4 * 1024 ** 3)
      throw new Error('Converted video exceeds the 4 GB import limit.');
    job.phase = 'inspecting';
    job.progress = 99;
    const mediaId = randomUUID();
    job.storedPath = path.join(uploadDirectory, `${mediaId}.video`);
    await rename(convertedPath, job.storedPath);
    const stored = await inspectMediaFile({
      filename: `${mediaId}.video`,
      originalname: videos[0].name,
      path: job.storedPath,
      size: convertedSize,
    });
    if (isCancelled(job)) return;
    const { filePath: _filePath, ...media } = stored;
    job.media = media;
    job.status = 'complete';
    job.progress = 100;
    console.info(`[yt-dlp:${job.id}] Import complete (${(media.size / 1024 ** 2).toFixed(1)} MB).`);
  } catch (error) {
    if (!isCancelled(job)) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Could not import this video URL.';
      console.error(`[yt-dlp:${job.id}] Import failed: ${job.error}`);
    }
  } finally {
    job.process = undefined;
    if (job.directory) await removeImportDirectory(job.directory);
    if (job.status !== 'complete' && job.storedPath) {
      await unlink(job.storedPath).catch((error) =>
        console.error('Could not remove incomplete video import:', error),
      );
      await unlink(job.storedPath.replace(/\.video$/, '.json')).catch((error: unknown) => {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
          console.error('Could not remove incomplete video metadata:', error);
      });
    }
    activeJob = undefined;
    void processNextImport();
  }
}

function runYtDlp(job: InternalVideoImportJob): Promise<void> {
  return new Promise((resolve, reject) => {
    job.phase = 'downloading';
    const outputTemplate = path.join(job.directory!, '%(title).100B-%(id)s.%(ext)s');
    const args = buildYtDlpArguments(job.sourceUrl, outputTemplate);
    console.info(
      `[yt-dlp:${job.id}] Starting Python process: ${ytDlpPython} -m yt_dlp (${new URL(job.sourceUrl).host}) using Node.js for JavaScript challenges${ytDlpCookiesPath ? ' with configured cookies' : ''}.`,
    );
    const child = spawn(ytDlpPython, args, { cwd: ytDlpDirectory });
    job.process = child;
    let diagnostic = '';
    let processOutput = '';
    let pending = '';
    let settled = false;
    let timedOut = false;
    let lastLoggedProgress = 0;
    let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimeout = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 5000);
    }, 3_600_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      error ? reject(error) : resolve();
    };
    function readProgress(chunk: Buffer) {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match) {
          job.progress = Math.min(80, Math.max(0, Math.round(Number(match[1]) * 0.8)));
          const progressMilestone = Math.floor(job.progress / 10) * 10;
          if (progressMilestone >= lastLoggedProgress + 10) {
            lastLoggedProgress = progressMilestone;
            console.info(`[yt-dlp:${job.id}] Download progress: ${progressMilestone}%.`);
          }
        }
      }
    }
    function captureOutput(chunk: Buffer) {
      processOutput = (processOutput + chunk.toString()).slice(-6000);
      job.output = sanitizeYtDlpOutput(processOutput);
    }
    child.stdout?.on('data', (chunk) => {
      readProgress(chunk);
      captureOutput(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      diagnostic = (diagnostic + text).slice(-6000);
      readProgress(chunk);
      captureOutput(chunk);
    });
    child.on('error', (error) => {
      finish(
        'code' in error && error.code === 'ENOENT'
          ? new Error(`Could not start Python. Install Python 3.11+ or set YT_DLP_PYTHON.`)
          : new Error(`Could not start yt-dlp: ${error.message}`),
      );
    });
    child.on('close', (code) => {
      if (isCancelled(job)) finish();
      else if (timedOut) finish(new Error('Video download exceeded the one-hour import limit.'));
      else if (code === 0) finish();
      else {
        const missingDependency = /No module named ['"]?([^'"\s]+)/.exec(diagnostic);
        const safeDiagnostic = sanitizeYtDlpOutput(diagnostic);
        if (safeDiagnostic) console.error(`[yt-dlp:${job.id}] Process output:\n${safeDiagnostic}`);
        finish(
          missingDependency
            ? new Error(
                `yt-dlp is missing Python dependency "${missingDependency[1]}". Install the yt-dlp project dependencies.`,
              )
            : new Error(
                'yt-dlp could not download this URL. It may be unsupported, unavailable, or require access that is not configured.',
              ),
        );
      }
    });
  });
}

async function convertVideoForBrowser(
  job: InternalVideoImportJob,
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const { stdout } = await executeFile(
    ffprobePath,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ],
    { timeout: 30_000, maxBuffer: 100_000 },
  );
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('Could not determine the downloaded video duration for conversion.');
  if (isCancelled(job)) return;
  await runConversionProcess(job, buildBrowserCompatibleArguments(inputPath, outputPath), duration);
}

function runConversionProcess(
  job: InternalVideoImportJob,
  args: string[],
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { cwd: job.directory });
    job.process = child;
    let diagnostic = '';
    let pending = '';
    let settled = false;
    let timedOut = false;
    let lastLoggedProgress = 80;
    let forceKillTimeout: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKillTimeout = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 5000);
    }, 3_600_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      error ? reject(error) : resolve();
    };
    child.stdout?.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^out_time_us=(\d+)/);
        if (!match) continue;
        const fraction = Math.min(1, Number(match[1]) / 1_000_000 / duration);
        job.progress = Math.min(99, 80 + Math.round(fraction * 19));
        const milestone = Math.floor(job.progress / 5) * 5;
        if (milestone >= lastLoggedProgress + 5) {
          lastLoggedProgress = milestone;
          console.info(`[yt-dlp:${job.id}] Browser conversion progress: ${milestone}%.`);
        }
      }
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      diagnostic = (diagnostic + text).slice(-6000);
      job.output = sanitizeYtDlpOutput(`${job.output || ''}\n${text}`);
    });
    child.on('error', (error) => {
      finish(new Error(`Could not start FFmpeg video conversion: ${error.message}`));
    });
    child.on('close', (code) => {
      if (isCancelled(job)) finish();
      else if (timedOut) finish(new Error('Video conversion exceeded the one-hour import limit.'));
      else if (code === 0) finish();
      else {
        const safeDiagnostic = sanitizeYtDlpOutput(diagnostic);
        if (safeDiagnostic) console.error(`[yt-dlp:${job.id}] FFmpeg output:\n${safeDiagnostic}`);
        finish(new Error('FFmpeg could not convert this download to a browser-compatible MP4.'));
      }
    });
  });
}

function isCancelled(job: InternalVideoImportJob) {
  return job.status === 'cancelled';
}

async function removeImportDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true }).catch((error) =>
    console.error('Could not remove video import temporary files:', error),
  );
}

export function stopAllVideoImports() {
  for (const job of jobs.values()) cancelVideoImportJob(job.id);
}
