import { useState } from 'react';
import type {
  ExportSettings,
  GifSubtitleSettings,
  MediaAsset,
  Project,
  TimeRange,
} from '../../../shared/editor.types';
import { gifOutputSize, resolveGifSubtitleSettings } from '../../../shared/gif-subtitle.utils';
import { resolveComposition } from '../../../shared/composition.utils';
import { stripSubtitleMarkup } from '../../../shared/subtitles.utils';
import { formatTime } from '../../../shared/time.utils';
import { useGifPreview } from '../../hooks/use-gif-preview';

type Props = {
  media: MediaAsset;
  project: Project;
  range: TimeRange;
  settings: ExportSettings;
  onChange: (settings: ExportSettings) => void;
  visible: boolean;
};
export function GifSubtitleSettingsPanel({
  media,
  project,
  range,
  settings,
  onChange,
  visible,
}: Props) {
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const style = resolveGifSubtitleSettings(settings);
  const cues = project.cues.filter((cue) => cue.end > range.start && cue.start < range.end);
  const selectedCue = cues.find((cue) => cue.id === selectedCueId) || cues[0];
  const previewTime = selectedCue
    ? (Math.max(selectedCue.start, range.start) + Math.min(selectedCue.end, range.end)) / 2
    : null;
  const { canvas } = resolveComposition(project, media);
  const dimensions = gifOutputSize(canvas, settings.gifWidth);
  const preview = useGifPreview(
    visible && selectedCue
      ? { ...settings, mediaId: media.id, ...project, range, burnSubtitles: true }
      : null,
    previewTime,
  );
  function update(changes: Partial<GifSubtitleSettings>) {
    onChange({ ...settings, gifSubtitle: { ...style, ...changes } });
  }
  return (
    <section className="gif-subtitle-settings" aria-label="GIF subtitle style">
      <div className="gif-subtitle-heading">
        <strong>Subtitle style</strong>
        <span>Measured at output size</span>
      </div>
      <label className="gif-slider">
        <span>
          Size <strong>{style.fontSize} px</strong>
        </span>
        <input
          type="range"
          aria-label="GIF subtitle size"
          min="8"
          max="96"
          step="1"
          value={style.fontSize}
          onChange={(event) => update({ fontSize: Number(event.target.value) })}
        />
      </label>
      <div className="gif-style-grid">
        <label>
          Font
          <select
            aria-label="GIF subtitle font"
            value={style.font}
            onChange={(event) =>
              update({ font: event.target.value as GifSubtitleSettings['font'] })
            }
          >
            <option value="auto">Automatic sans</option>
            <option value="traditional">Traditional Chinese</option>
            <option value="serif">Serif</option>
          </select>
        </label>
        <label>
          Position
          <select
            aria-label="GIF subtitle position"
            value={style.position}
            onChange={(event) => {
              const position = event.target.value as GifSubtitleSettings['position'];
              update({ position, margin: position === 'middle' ? 0 : Math.max(0, style.margin) });
            }}
          >
            <option value="bottom">Bottom</option>
            <option value="middle">Center</option>
            <option value="top">Top</option>
          </select>
        </label>
      </div>
      <label className="gif-slider">
        <span>
          {style.position === 'middle' ? 'Vertical offset' : 'Edge margin'}{' '}
          <strong>{style.margin} px</strong>
        </span>
        <input
          type="range"
          aria-label="GIF subtitle margin"
          min={style.position === 'middle' ? -80 : 0}
          max="80"
          step="1"
          value={style.margin}
          onChange={(event) => update({ margin: Number(event.target.value) })}
        />
      </label>
      <div className="gif-outline-row">
        <label>
          Outline{' '}
          <select
            aria-label="GIF subtitle outline"
            value={style.outline}
            onChange={(event) => update({ outline: Number(event.target.value) })}
          >
            {[1, 2, 3, 4].map((width) => (
              <option key={width} value={width}>
                {width} px
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="GIF subtitle background"
            checked={style.background}
            onChange={(event) => update({ background: event.target.checked })}
          />
          Dark background
        </label>
      </div>
      <div className="gif-preview-heading">
        <strong>Output preview</strong>
        <span>
          {dimensions.width} × {dimensions.height} px
        </span>
      </div>
      {cues.length ? (
        <>
          <label className="gif-preview-select">
            Subtitle to preview
            <select
              aria-label="Subtitle to preview"
              value={selectedCue.id}
              onChange={(event) => setSelectedCueId(event.target.value)}
            >
              {cues.map((cue, index) => (
                <option key={cue.id} value={cue.id}>
                  {formatTime(cue.start, true)} ·{' '}
                  {stripSubtitleMarkup(cue.text).replace(/\s+/g, ' ').slice(0, 60) ||
                    `Subtitle ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="gif-preview-frame" aria-busy={preview.loading}>
            {preview.url && (
              <img
                src={preview.url}
                alt="GIF output preview with the selected subtitle"
                style={{ width: dimensions.width }}
              />
            )}
            {preview.loading && <span className="gif-preview-loading">Rendering preview…</span>}
            {preview.error && (
              <span className="gif-preview-error" role="alert">
                {preview.error}
              </span>
            )}
          </div>
          <p className="gif-preview-note">
            Frame at {formatTime(previewTime!, true)} · Before GIF color reduction. Long captions
            may need a smaller size.
          </p>
        </>
      ) : (
        <p className="gif-preview-note">No subtitles overlap the selected export range.</p>
      )}
    </section>
  );
}
