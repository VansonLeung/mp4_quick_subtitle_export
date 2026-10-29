import type { Clip, Project, SubtitleCue, TimeRange } from './editor.types';
import { clamp } from './time.utils';

export function timelineDuration(clips: Clip[]): number {
  return clips.reduce((duration, clip) => duration + clip.sourceEnd - clip.sourceStart, 0);
}

export function positionClips(clips: Clip[]) {
  let cursor = 0;
  return clips.map((clip) => {
    const start = cursor;
    cursor += clip.sourceEnd - clip.sourceStart;
    return { ...clip, start, end: cursor };
  });
}

export function timelineToSource(clips: Clip[], time: number) {
  const positioned = positionClips(clips);
  const clip =
    positioned.find((item) => time >= item.start && time < item.end) ?? positioned.at(-1);
  return clip
    ? { clip, sourceTime: clip.sourceStart + clamp(time - clip.start, 0, clip.end - clip.start) }
    : null;
}

export function splitClip(clips: Clip[], time: number): Clip[] {
  return positionClips(clips).flatMap((clip) => {
    const original = { id: clip.id, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd };
    if (time <= clip.start + 0.025 || time >= clip.end - 0.025) return [original];
    const sourceSplit = clip.sourceStart + time - clip.start;
    return [
      { ...original, sourceEnd: sourceSplit },
      { id: crypto.randomUUID(), sourceStart: sourceSplit, sourceEnd: clip.sourceEnd },
    ];
  });
}

export function removeTimelineRange(project: Project, range: TimeRange): Project {
  const removedDuration = range.end - range.start;
  if (removedDuration <= 0) return project;
  const clips = positionClips(project.clips).flatMap((clip) => {
    if (clip.end <= range.start || clip.start >= range.end) {
      return [{ id: clip.id, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd }];
    }
    const remaining: Clip[] = [];
    if (clip.start < range.start)
      remaining.push({
        id: clip.id,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceStart + range.start - clip.start,
      });
    if (clip.end > range.end)
      remaining.push({
        id: remaining.length ? crypto.randomUUID() : clip.id,
        sourceStart: clip.sourceStart + range.end - clip.start,
        sourceEnd: clip.sourceEnd,
      });
    return remaining;
  });
  const mapTime = (time: number) =>
    time <= range.start ? time : time >= range.end ? time - removedDuration : range.start;
  const cues: SubtitleCue[] = project.cues
    .map((cue) => ({ ...cue, start: mapTime(cue.start), end: mapTime(cue.end) }))
    .filter((cue) => cue.end - cue.start >= 0.001);
  return { ...project, clips, cues };
}

export function selectSourceSegments(clips: Clip[], range: TimeRange): Clip[] {
  return positionClips(clips)
    .filter((clip) => clip.end > range.start && clip.start < range.end)
    .map((clip) => ({
      id: clip.id,
      sourceStart: clip.sourceStart + Math.max(0, range.start - clip.start),
      sourceEnd: clip.sourceEnd - Math.max(0, clip.end - range.end),
    }));
}
