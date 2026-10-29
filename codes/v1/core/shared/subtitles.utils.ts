import type { SubtitleCue, TimeRange } from './editor.types';
import { formatTime, parseTime } from './time.utils';

export function parseSrt(content: string): SubtitleCue[] {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!normalized) throw new Error('This SRT file is empty.');
  const blocks = normalized.split(/\n\s*\n/);
  const cues = blocks.map((block, index) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0].trim())) lines.shift();
    const timing = lines.shift()?.match(/^(\S+)\s*-->\s*(\S+)(?:\s+.*)?$/);
    const start = timing ? parseTime(timing[1]) : null;
    const end = timing ? parseTime(timing[2]) : null;
    const text = lines.join('\n').trim();
    if (start === null || end === null || end <= start || !text) {
      throw new Error(
        `Subtitle ${index + 1} has invalid timing or no text. Use SRT timestamps such as 00:00:01,000.`,
      );
    }
    return { id: crypto.randomUUID(), start, end, text };
  });
  return cues.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function serializeSrt(cues: SubtitleCue[]): string {
  return (
    [...cues]
      .sort((left, right) => left.start - right.start || left.end - right.end)
      .map(
        (cue, index) =>
          `${index + 1}\n${formatTime(cue.start, true).replace('.', ',')} --> ${formatTime(cue.end, true).replace('.', ',')}\n${cue.text.trim()}`,
      )
      .join('\n\n') + (cues.length ? '\n' : '')
  );
}

// Intersect cues with an export range, then reset timestamps to the exported start.
export function cropSubtitles(cues: SubtitleCue[], range: TimeRange): SubtitleCue[] {
  return cues
    .filter((cue) => cue.end > range.start && cue.start < range.end)
    .map((cue) => ({
      ...cue,
      start: Math.max(cue.start, range.start) - range.start,
      end: Math.min(cue.end, range.end) - range.start,
    }));
}

export function stripSubtitleMarkup(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '');
}
