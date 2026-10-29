import {
  AlignCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyCenter,
  LockKeyhole,
  UnlockKeyhole,
} from 'lucide-react';
import type {
  CanvasSettings,
  MediaAsset,
  Project,
  VideoLayout,
} from '../../../shared/editor.types';
import {
  fitVideoLayout,
  resolveComposition,
  validateComposition,
} from '../../../shared/composition.utils';
import { Button } from '../ui/button';
import { NumberField } from '../ui/number-field';

type Props = {
  media: MediaAsset | null;
  project: Project;
  onCommit: (project: Project) => void;
  notify: (message: string) => void;
};
export function CompositionPanel({ media, project, onCommit, notify }: Props) {
  if (!media)
    return (
      <div className="composition-empty">
        Open a video or a saved project
        <br />
        to adjust its canvas and layout.
      </div>
    );
  const { canvas, video } = resolveComposition(project, media);
  function update(nextCanvas: CanvasSettings, nextVideo: VideoLayout) {
    try {
      validateComposition(nextCanvas, nextVideo);
      onCommit({ ...project, canvas: nextCanvas, video: nextVideo });
    } catch (error) {
      notify((error as Error).message);
    }
  }
  function resizeCanvas(next: CanvasSettings) {
    update(next, fitVideoLayout(media!, next));
  }
  function resizeVideo(edge: 'width' | 'height', value: number) {
    const ratio = video.width / video.height;
    update(canvas, {
      ...video,
      [edge]: value,
      ...(video.aspectLocked
        ? edge === 'width'
          ? { height: Math.max(2, Math.round(value / ratio)) }
          : { width: Math.max(2, Math.round(value * ratio)) }
        : {}),
    });
  }
  return (
    <div className="composition-panel">
      <section>
        <div className="inspector-title">
          Canvas
          <span>
            {canvas.width} × {canvas.height}
          </span>
        </div>
        <label className="inspector-select">
          Preset
          <select
            aria-label="Canvas preset"
            value=""
            onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              resizeCanvas({ ...canvas, width, height });
            }}
          >
            <option value="" disabled>
              Choose a size…
            </option>
            <option value={`${Math.ceil(media.width / 2) * 2}x${Math.ceil(media.height / 2) * 2}`}>
              Original · {media.width} × {media.height}
            </option>
            <option value="1920x1080">Landscape · 16:9</option>
            <option value="1080x1920">Portrait · 9:16</option>
            <option value="1080x1080">Square · 1:1</option>
            <option value="1080x1350">Portrait · 4:5</option>
          </select>
        </label>
        <div className="inspector-grid">
          <NumberField
            label="Canvas width"
            value={canvas.width}
            min={16}
            max={8192}
            step={2}
            onCommit={(width) => resizeCanvas({ ...canvas, width })}
          />
          <NumberField
            label="Canvas height"
            value={canvas.height}
            min={16}
            max={8192}
            step={2}
            onCommit={(height) => resizeCanvas({ ...canvas, height })}
          />
        </div>
        <label className="background-field">
          <span>Background</span>
          <input
            type="color"
            aria-label="Canvas background"
            value={canvas.background}
            onChange={(event) => update({ ...canvas, background: event.target.value }, video)}
          />
          <code>{canvas.background}</code>
        </label>
        <p className="inspector-note">
          Canvas size changes refit the video. All layout changes can be undone.
        </p>
      </section>
      <section>
        <div className="inspector-title">
          Video layout<span>All segments</span>
        </div>
        <div className="inspector-fit">
          <Button
            variant="outline"
            size="sm"
            onClick={() => update(canvas, fitVideoLayout(media, canvas))}
          >
            Fit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => update(canvas, fitVideoLayout(media, canvas, 'fill'))}
          >
            Fill
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              update(canvas, {
                ...video,
                x: Math.round((canvas.width - video.width) / 2),
                y: Math.round((canvas.height - video.height) / 2),
              })
            }
          >
            Center
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update(canvas, fitVideoLayout(media, canvas))}
          >
            Reset
          </Button>
        </div>
        <div className="inspector-grid">
          <NumberField
            label="Video width"
            value={video.width}
            min={2}
            max={16384}
            onCommit={(value) => resizeVideo('width', value)}
          />
          <NumberField
            label="Video height"
            value={video.height}
            min={2}
            max={16384}
            onCommit={(value) => resizeVideo('height', value)}
          />
        </div>
        <div className="aspect-lock">
          <button
            aria-label="Lock video aspect ratio"
            aria-pressed={video.aspectLocked}
            onClick={() => update(canvas, { ...video, aspectLocked: !video.aspectLocked })}
          >
            {video.aspectLocked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
            {video.aspectLocked ? 'Aspect ratio locked' : 'Free resize'}
          </button>
          <span>{Math.round((video.width / media.width) * 100)}%</span>
        </div>
        <NumberField
          label="Video scale (%)"
          value={Math.round((video.width / media.width) * 100)}
          min={1}
          max={Math.min(
            1000,
            Math.floor((16384 / media.width) * 100),
            Math.floor((16384 / media.height) * 100),
          )}
          onCommit={(scale) =>
            update(canvas, {
              ...video,
              width: Math.max(2, Math.round((media.width * scale) / 100)),
              height: Math.max(2, Math.round((media.height * scale) / 100)),
            })
          }
        />
        <div className="inspector-grid">
          <NumberField
            label="Video X"
            value={video.x}
            onCommit={(x) => update(canvas, { ...video, x })}
          />
          <NumberField
            label="Video Y"
            value={video.y}
            onCommit={(y) => update(canvas, { ...video, y })}
          />
        </div>
        <div className="alignment-buttons">
          {[
            { label: 'Align video left', icon: AlignHorizontalJustifyStart, update: { x: 0 } },
            {
              label: 'Align video horizontally center',
              icon: AlignCenter,
              update: { x: Math.round((canvas.width - video.width) / 2) },
            },
            {
              label: 'Align video right',
              icon: AlignHorizontalJustifyEnd,
              update: { x: canvas.width - video.width },
            },
            { label: 'Align video top', icon: AlignVerticalJustifyStart, update: { y: 0 } },
            {
              label: 'Align video vertically center',
              icon: AlignVerticalJustifyCenter,
              update: { y: Math.round((canvas.height - video.height) / 2) },
            },
            {
              label: 'Align video bottom',
              icon: AlignVerticalJustifyEnd,
              update: { y: canvas.height - video.height },
            },
          ].map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              size="icon"
              aria-label={item.label}
              title={item.label}
              onClick={() => update(canvas, { ...video, ...item.update })}
            >
              <item.icon size={16} />
            </Button>
          ))}
        </div>
        <p className="inspector-note">
          Drag the video to move it. Drag a corner to resize. Subtitles stay anchored to the canvas.
        </p>
      </section>
    </div>
  );
}
