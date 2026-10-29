import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExportRequest } from '../../shared/editor.types';
import { cropSubtitles } from '../../shared/subtitles.utils';
import { timelineToSource } from '../../shared/timeline.utils';
import { resolveComposition } from '../../shared/composition.utils';
import { gifOutputSize, resolveGifSubtitleSettings } from '../../shared/gif-subtitle.utils';
import { exportDirectory, ffmpegPath } from '../config';
import { buildExportArguments } from './ffmpeg-export.service';
import { serializeGifSubtitles } from './gif-subtitles.service';
import type { StoredMedia } from './media.service';

export async function renderGifPreview(
  request: ExportRequest,
  media: StoredMedia,
  time: number,
  signal: AbortSignal,
): Promise<Buffer> {
  if (
    request.format !== 'gif' ||
    !Number.isFinite(time) ||
    time < request.range.start ||
    time >= request.range.end
  )
    throw new Error('Choose a preview time inside the export range.');
  const target = timelineToSource(request.clips, time);
  if (!target) throw new Error('No video is available at this preview time.');
  const end = Math.min(
    request.range.end,
    target.clip.end,
    time + Math.max(0.5, 2 / request.gifFps),
  );
  const preview = { ...request, range: { start: time, end } };
  const inputSeek = Math.max(0, target.sourceTime - 0.5);
  const directory = await mkdtemp(path.join(exportDirectory, 'preview-'));
  try {
    const cues = cropSubtitles(preview.cues, preview.range);
    if (preview.burnSubtitles && cues.length) {
      const { canvas } = resolveComposition(preview, media);
      await writeFile(
        path.join(directory, 'captions.ass'),
        serializeGifSubtitles(
          cues,
          gifOutputSize(canvas, preview.gifWidth),
          resolveGifSubtitleSettings(preview),
        ),
      );
    }
    if (signal.aborted) throw new Error('Preview cancelled.');
    return await new Promise<Buffer>((resolve, reject) => {
      const process = spawn(
        ffmpegPath,
        buildExportArguments(preview, media, { preview: true, inputSeek }),
        { cwd: directory },
      );
      const chunks: Buffer[] = [];
      let bytes = 0;
      let diagnostic = '';
      const cancel = () => process.kill('SIGTERM');
      signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, 30_000);
      process.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 40_000_000) cancel();
        else chunks.push(chunk);
      });
      process.stderr.on('data', (chunk) => {
        diagnostic = (diagnostic + chunk.toString()).slice(-3000);
      });
      process.on('error', reject);
      process.on('close', (code) => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        if (code === 0 && bytes > 0 && !signal.aborted) resolve(Buffer.concat(chunks));
        else {
          if (!signal.aborted) console.error('GIF preview failed:', diagnostic);
          reject(new Error('Could not render the GIF preview.'));
        }
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
