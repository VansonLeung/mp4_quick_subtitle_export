import type { ExportRequest } from '../../shared/editor.types';
import { timelineDuration } from '../../shared/timeline.utils';
import type { StoredMedia } from './media.service';
import { resolveComposition, validateComposition } from '../../shared/composition.utils';
import {
  resolveGifSubtitleSettings,
  validateGifSubtitleSettings,
} from '../../shared/gif-subtitle.utils';

export function validateExportRequest(body: ExportRequest, media: StoredMedia): ExportRequest {
  if (!body || !['mp4', 'gif'].includes(body.format)) throw new Error('Choose MP4 or GIF.');
  if (!Array.isArray(body.clips) || !body.clips.length || body.clips.length > 200)
    throw new Error('Export requires 1–200 video segments.');
  for (const clip of body.clips) {
    if (
      !Number.isFinite(clip.sourceStart) ||
      !Number.isFinite(clip.sourceEnd) ||
      clip.sourceStart < 0 ||
      clip.sourceEnd > media.duration + 0.05 ||
      clip.sourceEnd - clip.sourceStart < 0.025
    ) {
      throw new Error('A video segment has invalid source timing.');
    }
  }
  const duration = timelineDuration(body.clips);
  if (
    !body.range ||
    !Number.isFinite(body.range.start) ||
    !Number.isFinite(body.range.end) ||
    body.range.start < 0 ||
    body.range.end > duration + 0.001 ||
    body.range.end - body.range.start < 0.05
  ) {
    throw new Error('Choose an export range of at least 0.05 seconds within the timeline.');
  }
  if (!Array.isArray(body.cues) || body.cues.length > 20_000)
    throw new Error('Invalid subtitle list.');
  for (const cue of body.cues) {
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      cue.end > duration + 0.001 ||
      typeof cue.text !== 'string' ||
      !cue.text.trim() ||
      cue.text.length > 10_000
    ) {
      throw new Error('A subtitle has invalid text or timing.');
    }
  }
  if (typeof body.burnSubtitles !== 'boolean') throw new Error('Invalid subtitle setting.');
  if (
    body.format === 'gif' &&
    (![320, 480, 640, 960].includes(body.gifWidth) || ![8, 12, 15, 24].includes(body.gifFps))
  ) {
    throw new Error('Choose a supported GIF size and frame rate.');
  }
  if (body.format === 'gif' && body.range.end - body.range.start < 1 / body.gifFps) {
    throw new Error(
      `Select at least ${(1 / body.gifFps).toFixed(3)} seconds for a GIF at ${body.gifFps} fps.`,
    );
  }
  const composition = resolveComposition(body, media);
  const gifSubtitle = resolveGifSubtitleSettings(body);
  validateGifSubtitleSettings(gifSubtitle);
  validateComposition(composition.canvas, composition.video);
  return {
    ...body,
    ...composition,
    gifSubtitle,
    range: { start: body.range.start, end: Math.min(body.range.end, duration) },
  };
}
