import { Captions, Film, RotateCcw } from 'lucide-react';
import { useRef, type PointerEvent } from 'react';
import type { Clip, MediaAsset, SubtitleCue, TimeRange } from '../../../shared/editor.types';
import { positionClips } from '../../../shared/timeline.utils';
import { clamp, formatShortTime, formatTime } from '../../../shared/time.utils';
import type { Thumbnail } from '../../hooks/use-video-thumbnails';
import { Button } from '../ui/button';

type Props = {
  media: MediaAsset | null;
  clips: Clip[];
  cues: SubtitleCue[];
  thumbnails: Thumbnail[];
  duration: number;
  currentTime: number;
  range: TimeRange;
  zoom: number;
  selectedClipId: string | null;
  onSeek: (time: number) => void;
  onSelectClip: (id: string) => void;
  onSelectCue: (cue: SubtitleCue) => void;
  onRangeChange: (range: TimeRange) => void;
  onRestore: () => void;
};

export function TimelineTracks(props: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<'start' | 'end' | 'seek' | null>(null);
  const percentage = (time: number) => (props.duration ? (time / props.duration) * 100 : 0);
  const clips = positionClips(props.clips);
  const tickCount = Math.max(8, Math.round(10 * props.zoom));
  function updatePointer(event: PointerEvent<HTMLDivElement>) {
    if (!trackRef.current || !props.duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const time = clamp(
      ((event.clientX - rect.left) / rect.width) * props.duration,
      0,
      props.duration,
    );
    if (drag.current === 'start')
      props.onRangeChange({ ...props.range, start: Math.min(time, props.range.end - 0.05) });
    else if (drag.current === 'end')
      props.onRangeChange({ ...props.range, end: Math.max(time, props.range.start + 0.05) });
    else if (drag.current === 'seek') props.onSeek(time);
  }
  function beginPointer(event: PointerEvent<HTMLDivElement>) {
    if (!props.duration || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-range-handle]')?.dataset.rangeHandle;
    if (!handle && target.closest('[data-no-seek]')) return;
    drag.current = handle === 'start' || handle === 'end' ? handle : 'seek';
    if (drag.current === 'seek') {
      const clipId = target.closest<HTMLElement>('[data-clip-id]')?.dataset.clipId;
      if (clipId) props.onSelectClip(clipId);
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePointer(event);
  }
  return (
    <div className="timeline-track-area">
      <div className="track-labels">
        <div className="ruler-label">TRACKS</div>
        <div className="range-label">
          <span className="range-label-dot" />
          Range
        </div>
        <div className="video-label">
          <Film size={15} />
          <span>
            Video
            <small>
              {props.clips.length} {props.clips.length === 1 ? 'segment' : 'segments'}
            </small>
          </span>
        </div>
        <div className="captions-label">
          <Captions size={16} />
          <span>
            Subtitles<small>{props.cues.length} cues</small>
          </span>
        </div>
      </div>
      <div className="timeline-scroll">
        <div
          ref={trackRef}
          className="timeline-track-content"
          style={{ width: `${props.zoom * 100}%` }}
          onPointerDown={beginPointer}
          onPointerMove={(event) => {
            if (drag.current) updatePointer(event);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div className="timeline-ruler">
            {Array.from({ length: tickCount + 1 }, (_, index) => (
              <span key={index} style={{ left: `${(index / tickCount) * 100}%` }}>
                {formatShortTime((props.duration * index) / tickCount)}
              </span>
            ))}
          </div>
          <div className="range-track">
            {props.duration > 0 && (
              <div
                className="export-range-band"
                style={{
                  left: `${percentage(props.range.start)}%`,
                  width: `${percentage(props.range.end - props.range.start)}%`,
                }}
              >
                {(['start', 'end'] as const).map((edge) => (
                  <button
                    key={edge}
                    data-range-handle={edge}
                    className={`range-handle range-handle-${edge}`}
                    aria-label={`Drag export range ${edge}`}
                    role="slider"
                    aria-valuemin={0}
                    aria-valuemax={props.duration}
                    aria-valuenow={props.range[edge]}
                    aria-valuetext={formatTime(props.range[edge], true)}
                    title={`Export ${edge}: ${formatTime(props.range[edge], true)}`}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                      event.preventDefault();
                      const value =
                        props.range[edge] +
                        (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 0.1);
                      props.onRangeChange({
                        ...props.range,
                        [edge]:
                          edge === 'start'
                            ? clamp(value, 0, props.range.end - 0.05)
                            : clamp(value, props.range.start + 0.05, props.duration),
                      });
                    }}
                  >
                    <span />
                  </button>
                ))}
                <span className="range-band-text">EXPORT RANGE</span>
              </div>
            )}
          </div>
          <div className="video-track">
            {clips.map((clip, index) => (
              <button
                key={clip.id}
                data-clip-id={clip.id}
                aria-label={`Select video segment ${index + 1}`}
                aria-pressed={props.selectedClipId === clip.id}
                className={`timeline-clip ${props.selectedClipId === clip.id ? 'selected' : ''}`}
                style={{
                  left: `${percentage(clip.start)}%`,
                  width: `${percentage(clip.end - clip.start)}%`,
                }}
                onClick={() => props.onSelectClip(clip.id)}
              >
                <div className="clip-thumbnails">
                  {Array.from({ length: 8 }, (_, frame) => {
                    const sourceTime =
                      clip.sourceStart + ((clip.sourceEnd - clip.sourceStart) * frame) / 8;
                    const thumbnail = props.thumbnails.reduce<Thumbnail | null>(
                      (best, item) =>
                        !best || Math.abs(item.time - sourceTime) < Math.abs(best.time - sourceTime)
                          ? item
                          : best,
                      null,
                    );
                    return thumbnail ? (
                      <img key={frame} src={thumbnail.url} alt="" draggable={false} />
                    ) : (
                      <span key={frame} />
                    );
                  })}
                </div>
                <span className="clip-caption">
                  <Film size={11} />
                  {props.media?.name}
                  <span>{formatTime(clip.end - clip.start)}</span>
                </span>
              </button>
            ))}
            {!clips.length && (
              <div className="empty-track">
                {props.media ? (
                  <Button data-no-seek variant="ghost" size="sm" onClick={props.onRestore}>
                    <RotateCcw size={14} />
                    Restore original video
                  </Button>
                ) : (
                  'Your video track will appear here'
                )}
              </div>
            )}
          </div>
          <div className="subtitle-track">
            {props.cues.map((cue, index) => (
              <button
                key={cue.id}
                data-no-seek
                className={`timeline-cue ${props.currentTime >= cue.start && props.currentTime < cue.end ? 'active' : ''}`}
                style={{
                  left: `${percentage(cue.start)}%`,
                  width: `${percentage(cue.end - cue.start)}%`,
                }}
                title={cue.text}
                aria-label={`Seek to subtitle ${index + 1}`}
                onClick={() => props.onSelectCue(cue)}
              >
                <Captions size={12} />
                <span>{cue.text}</span>
              </button>
            ))}
            {!props.cues.length && <div className="empty-track">No subtitles</div>}
          </div>
          {props.duration > 0 && (
            <div className="playhead" style={{ left: `${percentage(props.currentTime)}%` }}>
              <span className="playhead-cap" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
