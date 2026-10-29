export type Clip = { id: string; sourceStart: number; sourceEnd: number };
export type SubtitleCue = { id: string; start: number; end: number; text: string };
export type CanvasSettings = { width: number; height: number; background: string };
export type VideoLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectLocked: boolean;
};
export type Project = {
  clips: Clip[];
  cues: SubtitleCue[];
  canvas?: CanvasSettings;
  video?: VideoLayout;
};
export type TimeRange = { start: number; end: number };
export type MediaAsset = {
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  size: number;
  url: string;
};
export type ExportSettings = {
  format: 'mp4' | 'gif';
  burnSubtitles: boolean;
  gifWidth: number;
  gifFps: number;
  gifSubtitle?: GifSubtitleSettings;
};
export type GifSubtitleSettings = {
  fontSize: number;
  font: 'auto' | 'traditional' | 'serif';
  position: 'bottom' | 'middle' | 'top';
  margin: number;
  outline: number;
  background: boolean;
};
export type ExportRequest = ExportSettings & {
  mediaId: string;
  clips: Clip[];
  cues: SubtitleCue[];
  range: TimeRange;
  canvas?: CanvasSettings;
  video?: VideoLayout;
};
export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  name: string;
  mediaId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  project: Project;
  range: TimeRange;
  exportSettings: ExportSettings;
  view: { playhead: number; zoom: number };
};
export type ProjectSummary = Pick<
  ProjectDocument,
  'id' | 'name' | 'mediaId' | 'revision' | 'updatedAt'
> & { canvas: CanvasSettings; duration: number };
export const defaultExportSettings: ExportSettings = {
  format: 'mp4',
  burnSubtitles: false,
  gifWidth: 640,
  gifFps: 12,
  gifSubtitle: {
    fontSize: 36,
    font: 'auto',
    position: 'bottom',
    margin: 12,
    outline: 2,
    background: false,
  },
};
export type ExportJob = {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
  downloadUrl?: string;
  filename?: string;
};
export type VideoImportJob = {
  id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  phase?: 'downloading' | 'converting' | 'inspecting';
  error?: string;
  output?: string;
  media?: MediaAsset;
};
