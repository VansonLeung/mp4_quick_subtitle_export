import {
  Captions,
  Film,
  FolderOpen,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Button } from '../ui/button';
import { formatTime } from '../../../shared/time.utils';
import { stripSubtitleMarkup } from '../../../shared/subtitles.utils';
import type { MediaAsset, SubtitleCue, Project, VideoLayout } from '../../../shared/editor.types';
import { resolveComposition } from '../../../shared/composition.utils';
import { useVideoLayoutGesture } from '../../hooks/use-video-layout-gesture';
import type { VideoPlayback } from '../../hooks/use-video-playback';

type Props = {
  media: MediaAsset | null;
  cues: SubtitleCue[];
  duration: number;
  playback: VideoPlayback;
  onOpen: () => void;
  uploadProgress: number | null;
  project: Project;
  onLayout: (layout: VideoLayout) => void;
};
export function VideoPreview({
  media,
  cues,
  duration,
  playback,
  onOpen,
  uploadProgress,
  project,
  onLayout,
}: Props) {
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [previewError, setPreviewError] = useState(false);
  const activeCues = cues.filter(
    (cue) => playback.currentTime >= cue.start && playback.currentTime < cue.end,
  );
  const { canvas, video } = resolveComposition(project, media || { width: 1920, height: 1080 });
  const gesture = useVideoLayoutGesture(canvas, video, onLayout);
  const videoStyle: CSSProperties = {
    left: `${(gesture.layout.x / canvas.width) * 100}%`,
    top: `${(gesture.layout.y / canvas.height) * 100}%`,
    width: `${(gesture.layout.width / canvas.width) * 100}%`,
    height: `${(gesture.layout.height / canvas.height) * 100}%`,
  };
  return (
    <section className="preview-panel" aria-label="Video preview">
      <div className="panel-heading">
        <div className="panel-title">
          Preview
          <span className="subtle-tag">
            {media ? `${canvas.width} × ${canvas.height}` : 'No video'}
          </span>
        </div>
        <span className="section-caption">
          {media ? 'Canvas · Drag video to position' : 'MP4 / M4V'}
        </span>
      </div>
      <div className="preview-stage">
        {media ? (
          <div
            ref={gesture.canvasRef}
            className="video-frame"
            style={
              {
                aspectRatio: `${canvas.width}/${canvas.height}`,
                '--video-aspect': canvas.width / canvas.height,
                background: canvas.background,
              } as CSSProperties
            }
          >
            <video
              key={media.id}
              ref={playback.videoRef}
              src={media.url}
              muted={playback.muted}
              playsInline
              preload="auto"
              style={videoStyle}
              onLoadedMetadata={() => {
                setPreviewError(false);
                playback.seek(playback.currentTime);
              }}
              onError={() => {
                setPreviewError(true);
                playback.pause();
              }}
              onPointerDown={(event) => gesture.begin(event)}
              onPointerMove={gesture.move}
              onPointerUp={(event) => gesture.finish(event)}
              onPointerCancel={(event) => gesture.finish(event, true)}
              aria-label="Video preview. Drag to move the video."
            />
            {gesture.selected && (
              <div className="video-selection-outline" style={videoStyle}>
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <button
                    key={corner}
                    className={`video-resize-handle handle-${corner}`}
                    aria-label={`Resize video ${corner}`}
                    onPointerDown={(event) => gesture.begin(event, corner)}
                    onPointerMove={gesture.move}
                    onPointerUp={(event) => gesture.finish(event)}
                    onPointerCancel={(event) => gesture.finish(event, true)}
                  />
                ))}
              </div>
            )}
            {captionsVisible && activeCues.length > 0 && (
              <div className="subtitle-overlay" aria-live="off">
                {activeCues.map((cue) => (
                  <span key={cue.id}>{stripSubtitleMarkup(cue.text)}</span>
                ))}
              </div>
            )}
            {previewError && (
              <div className="preview-error">
                <Film size={24} />
                <strong>This codec cannot be previewed in your browser.</strong>
                <span>Try an H.264 MP4. You can still edit subtitles and export this file.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-preview">
            <div className="empty-video-icon">
              <Film size={29} strokeWidth={1.3} />
            </div>
            <h1>{uploadProgress !== null ? 'Importing video' : 'Open your video'}</h1>
            <p>
              {uploadProgress !== null
                ? uploadProgress < 100
                  ? `Uploading · ${uploadProgress}%`
                  : 'Reading video information…'
                : 'Drop an MP4 or M4V file here'}
            </p>
            {uploadProgress === null ? (
              <Button variant="secondary" onClick={onOpen}>
                <FolderOpen size={16} />
                Choose file
              </Button>
            ) : (
              <div className="upload-progress">
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
            <span className="empty-footnote">MP4, M4V · Up to 4 GB</span>
          </div>
        )}
      </div>
      <div className="playback-toolbar">
        <div className="playback-left">
          <Button
            variant="ghost"
            size="icon"
            title={playback.muted ? 'Unmute' : 'Mute'}
            aria-label={playback.muted ? 'Unmute' : 'Mute'}
            disabled={!media}
            onClick={() => playback.setMuted(!playback.muted)}
          >
            {playback.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </Button>
          <select
            aria-label="Playback speed"
            value={playback.speed}
            disabled={!media}
            onChange={(event) => playback.setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </div>
        <div className="playback-center">
          <Button
            variant="ghost"
            size="icon"
            title="Go to start"
            aria-label="Go to start"
            disabled={!duration}
            onClick={() => playback.seek(0)}
          >
            <SkipBack size={16} />
          </Button>
          <Button
            className="play-button"
            size="icon"
            title="Play / pause (Space)"
            aria-label={playback.playing ? 'Pause' : 'Play'}
            disabled={!duration || previewError}
            onClick={playback.togglePlayback}
          >
            {playback.playing ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Go to end"
            aria-label="Go to end"
            disabled={!duration}
            onClick={() => {
              playback.pause();
              playback.seek(duration);
            }}
          >
            <SkipForward size={16} />
          </Button>
        </div>
        <div className="playback-right">
          <span className="timecode">
            {formatTime(playback.currentTime, true)}
            <span> / {formatTime(duration, true)}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={captionsVisible ? 'is-active' : ''}
            aria-pressed={captionsVisible}
            title="Toggle preview subtitles"
            aria-label="Toggle preview subtitles"
            onClick={() => setCaptionsVisible(!captionsVisible)}
          >
            <Captions size={19} />
          </Button>
        </div>
      </div>
    </section>
  );
}
