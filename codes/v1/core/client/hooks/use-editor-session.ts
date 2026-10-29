import { useEffect, useRef, useState } from 'react';
import type {
  MediaAsset,
  SubtitleCue,
  TimeRange,
  ProjectDocument,
} from '../../shared/editor.types';
import { originalCanvas, fitVideoLayout } from '../../shared/composition.utils';
import { clamp } from '../../shared/time.utils';
import { cropSubtitles, parseSrt, serializeSrt } from '../../shared/subtitles.utils';
import {
  positionClips,
  removeTimelineRange,
  splitClip,
  timelineDuration,
} from '../../shared/timeline.utils';
import { downloadTextFile, uploadVideo } from '../lib/api';
import { useProjectHistory } from './use-project-history';
import { useVideoPlayback } from './use-video-playback';

export function useEditorSession(notify: (message: string) => void) {
  const history = useProjectHistory();
  const { project, commit, reset } = history;
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [range, setRange] = useState<TimeRange>({ start: 0, end: 0 });
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const importInProgress = useRef(false);
  const restoredRange = useRef<TimeRange | null>(null);
  const duration = timelineDuration(project.clips);
  const playback = useVideoPlayback(project.clips);
  useEffect(() => {
    setRange(restoredRange.current || { start: 0, end: duration });
    restoredRange.current = null;
  }, [duration]);
  const selectedClip = positionClips(project.clips).find((clip) => clip.id === selectedClipId);

  async function importVideo(file?: File) {
    if (!file || importInProgress.current) return;
    if (!/\.(mp4|m4v)$/i.test(file.name)) {
      notify('Choose an MP4 or M4V video.');
      return;
    }
    if (file.size > 4 * 1024 ** 3) {
      notify('The maximum video size is 4 GB.');
      return;
    }
    importInProgress.current = true;
    playback.pause();
    setUploadProgress(0);
    try {
      const imported = await uploadVideo(file, setUploadProgress);
      acceptImportedVideo(imported);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import this video.');
    } finally {
      setUploadProgress(null);
      importInProgress.current = false;
    }
  }

  function acceptImportedVideo(imported: MediaAsset) {
    playback.pause();
    const clip = { id: crypto.randomUUID(), sourceStart: 0, sourceEnd: imported.duration };
    const canvas = originalCanvas(imported);
    playback.restoreTime(0);
    reset({ clips: [clip], cues: [], canvas, video: fitVideoLayout(imported, canvas) });
    setRange({ start: 0, end: imported.duration });
    setMedia(imported);
    setSelectedClipId(clip.id);
    setSelectedCueId(null);
  }
  function loadProject(document: ProjectDocument, imported: MediaAsset) {
    playback.pause();
    playback.restoreTime(document.view.playhead);
    if (timelineDuration(document.project.clips) !== duration)
      restoredRange.current = document.range;
    reset(document.project);
    setRange(document.range);
    setMedia(imported);
    setSelectedClipId(document.project.clips[0]?.id || null);
    setSelectedCueId(null);
  }
  function clearProject() {
    playback.pause();
    playback.restoreTime(0);
    reset({ clips: [], cues: [] });
    setMedia(null);
    setRange({ start: 0, end: 0 });
    setSelectedClipId(null);
    setSelectedCueId(null);
  }

  async function importSubtitles(file?: File) {
    if (!file || !duration) return;
    try {
      if (file.size > 8 * 1024 ** 2) throw new Error('Choose an SRT file smaller than 8 MB.');
      const parsed = parseSrt(await file.text());
      const cues = cropSubtitles(parsed, { start: 0, end: duration });
      if (!cues.length) throw new Error('None of these subtitles fall within the edited timeline.');
      commit((current) => ({ ...current, cues }));
      setSelectedCueId(cues[0].id);
      const clipped = parsed.some((cue) => cue.end > duration);
      notify(
        `Imported ${cues.length} subtitles.${clipped ? ' Cues outside the timeline were trimmed.' : ''}`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read this SRT file.');
    }
  }

  function updateCue(cue: SubtitleCue): boolean {
    if (cue.start < 0 || cue.end > duration || cue.end <= cue.start || !cue.text.trim()) {
      notify('Subtitle text is required, and its end must follow its start within the timeline.');
      return false;
    }
    commit((current) => ({
      ...current,
      cues: current.cues
        .map((item) => (item.id === cue.id ? { ...cue, text: cue.text.trim() } : item))
        .sort((a, b) => a.start - b.start),
    }));
    return true;
  }

  function addCue() {
    if (!duration) return;
    const start = clamp(playback.currentTime, 0, Math.max(0, duration - 0.1));
    const cue = {
      id: crypto.randomUUID(),
      start,
      end: Math.min(duration, start + 3),
      text: 'New subtitle',
    };
    commit((current) => ({
      ...current,
      cues: [...current.cues, cue].sort((a, b) => a.start - b.start),
    }));
    setSelectedCueId(cue.id);
  }

  function selectCue(cue: SubtitleCue) {
    setSelectedCueId(cue.id);
    playback.seek(cue.start);
  }
  function splitAtPlayhead() {
    const clips = splitClip(project.clips, playback.currentTime);
    if (clips.length === project.clips.length) {
      notify('Move the playhead inside a segment to split it.');
      return;
    }
    commit({ ...project, clips });
    setSelectedClipId(
      positionClips(clips).find((clip) => clip.start >= playback.currentTime - 0.001)?.id || null,
    );
  }
  function removeRange(removed: TimeRange) {
    commit(removeTimelineRange(project, removed));
    playback.pause();
    const time = playback.currentTime;
    playback.seek(
      time <= removed.start
        ? time
        : time >= removed.end
          ? time - (removed.end - removed.start)
          : removed.start,
    );
  }
  function deleteSelectedClip() {
    if (!selectedClip) return;
    removeRange({ start: selectedClip.start, end: selectedClip.end });
    setSelectedClipId(null);
  }
  function trimSelectedClip(edge: 'start' | 'end') {
    if (!selectedClip) return;
    const time = playback.currentTime;
    if (time <= selectedClip.start + 0.025 || time >= selectedClip.end - 0.025) {
      notify('Move the playhead inside the selected segment to trim it.');
      return;
    }
    removeRange(
      edge === 'start'
        ? { start: selectedClip.start, end: time }
        : { start: time, end: selectedClip.end },
    );
  }
  function exportSrt() {
    const cues = cropSubtitles(project.cues, range);
    if (!cues.length) {
      notify('There are no subtitles in the selected export range.');
      return;
    }
    downloadTextFile(
      `${media?.name.replace(/\.[^.]+$/, '') || 'subtitles'}-subtitles.srt`,
      serializeSrt(cues),
    );
    notify('SRT exported using the selected range, starting at 00:00:00.');
  }
  function restoreVideo() {
    if (!media) return;
    const clip = { id: crypto.randomUUID(), sourceStart: 0, sourceEnd: media.duration };
    commit({ ...project, clips: [clip], cues: [] });
    setSelectedClipId(clip.id);
  }
  return {
    ...history,
    media,
    duration,
    range,
    setRange,
    selectedClip,
    selectedClipId,
    setSelectedClipId,
    selectedCueId,
    uploadProgress,
    playback,
    importVideo,
    acceptImportedVideo,
    loadProject,
    clearProject,
    importSubtitles,
    updateCue,
    addCue,
    selectCue,
    splitAtPlayhead,
    deleteSelectedClip,
    trimSelectedClip,
    exportSrt,
    restoreVideo,
    deleteCue: (id: string) =>
      commit((current) => ({ ...current, cues: current.cues.filter((cue) => cue.id !== id) })),
  };
}
