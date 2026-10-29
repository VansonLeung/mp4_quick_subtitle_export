import type { ProjectDocument } from '../../shared/editor.types';
import { resolveComposition, validateComposition } from '../../shared/composition.utils';
import { timelineDuration } from '../../shared/timeline.utils';
import type { StoredMedia } from './media.service';
import {
  resolveGifSubtitleSettings,
  validateGifSubtitleSettings,
} from '../../shared/gif-subtitle.utils';

export function validateProjectDocument(
  body: ProjectDocument,
  media: StoredMedia,
): ProjectDocument {
  if (!body || body.schemaVersion !== 1) throw new Error('This project version is not supported.');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200)
    throw new Error('Enter a project name of up to 200 characters.');
  if (!Number.isInteger(body.revision) || body.revision < 0)
    throw new Error('Invalid project revision.');
  const project = body.project;
  if (
    !project ||
    !Array.isArray(project.clips) ||
    project.clips.length > 200 ||
    !Array.isArray(project.cues) ||
    project.cues.length > 20_000
  )
    throw new Error('Invalid project timeline.');
  const ids = new Set<string>();
  for (const clip of project.clips) {
    if (
      typeof clip.id !== 'string' ||
      !clip.id ||
      ids.has(clip.id) ||
      !Number.isFinite(clip.sourceStart) ||
      !Number.isFinite(clip.sourceEnd) ||
      clip.sourceStart < 0 ||
      clip.sourceEnd > media.duration + 0.05 ||
      clip.sourceEnd - clip.sourceStart < 0.025
    )
      throw new Error('A project segment has invalid source timing or ID.');
    ids.add(clip.id);
  }
  const duration = timelineDuration(project.clips);
  ids.clear();
  for (const cue of project.cues) {
    if (
      typeof cue.id !== 'string' ||
      !cue.id ||
      ids.has(cue.id) ||
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < 0 ||
      cue.end <= cue.start ||
      cue.end > duration + 0.001 ||
      typeof cue.text !== 'string' ||
      !cue.text.trim() ||
      cue.text.length > 10_000
    )
      throw new Error('A project subtitle has invalid text, timing, or ID.');
    ids.add(cue.id);
  }
  const { canvas, video } = resolveComposition(project, media);
  validateComposition(canvas, video);
  const range = body.range;
  if (
    !range ||
    !Number.isFinite(range.start) ||
    !Number.isFinite(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > duration + 0.001 ||
    (duration > 0 && range.end === range.start)
  )
    throw new Error('Invalid saved export range.');
  const settings = body.exportSettings;
  if (
    !settings ||
    !['mp4', 'gif'].includes(settings.format) ||
    typeof settings.burnSubtitles !== 'boolean' ||
    ![320, 480, 640, 960].includes(settings.gifWidth) ||
    ![8, 12, 15, 24].includes(settings.gifFps)
  )
    throw new Error('Invalid saved export settings.');
  const gifSubtitle = resolveGifSubtitleSettings(settings);
  validateGifSubtitleSettings(gifSubtitle);
  if (
    !body.view ||
    !Number.isFinite(body.view.playhead) ||
    body.view.playhead < 0 ||
    body.view.playhead > duration + 0.001 ||
    !Number.isFinite(body.view.zoom) ||
    body.view.zoom < 1 ||
    body.view.zoom > 8
  )
    throw new Error('Invalid saved editor view.');
  return {
    schemaVersion: 1,
    id: body.id,
    name: body.name.trim(),
    mediaId: media.id,
    revision: body.revision,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    project: {
      clips: project.clips.map(({ id, sourceStart, sourceEnd }) => ({
        id,
        sourceStart,
        sourceEnd,
      })),
      cues: project.cues.map(({ id, start, end, text }) => ({ id, start, end, text })),
      canvas: { width: canvas.width, height: canvas.height, background: canvas.background },
      video: {
        x: video.x,
        y: video.y,
        width: video.width,
        height: video.height,
        aspectLocked: video.aspectLocked,
      },
    },
    range: { start: range.start, end: Math.min(range.end, duration) },
    exportSettings: {
      format: settings.format,
      gifWidth: settings.gifWidth,
      gifFps: settings.gifFps,
      burnSubtitles: settings.burnSubtitles,
      gifSubtitle,
    },
    view: { playhead: Math.min(body.view.playhead, duration), zoom: body.view.zoom },
  };
}
