import { ArrowDownToLine, Check, CircleCheck, Film, Image, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { TimeInput } from '../ui/time-input';
import type { ExportSettings, MediaAsset, Project, TimeRange } from '../../../shared/editor.types';
import { formatTime } from '../../../shared/time.utils';
import { useExportJob } from '../../hooks/use-export-job';
import { requestJson } from '../../lib/api';
import { GifSubtitleSettingsPanel } from './gif-subtitle-settings';
import { resolveGifSubtitleSettings } from '../../../shared/gif-subtitle.utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  media: MediaAsset | null;
  project: Project;
  duration: number;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  settings: ExportSettings;
  onSettingsChange: (settings: ExportSettings) => void;
};
export function ExportDialog(props: Props) {
  const { settings, onSettingsChange: setSettings } = props;
  const [scope, setScope] = useState<'whole' | 'range'>('range');
  const [canBurnSubtitles, setCanBurnSubtitles] = useState(true);
  const exporter = useExportJob();
  const exportRange = scope === 'range' ? props.range : { start: 0, end: props.duration };
  const exportDuration = exportRange.end - exportRange.start;
  const minimumExportDuration =
    settings.format === 'gif' ? Math.max(0.05, 1 / settings.gifFps) : 0.05;
  useEffect(() => {
    requestJson<{ burnSubtitlesAvailable: boolean }>('/api/health')
      .then((health) => setCanBurnSubtitles(health.burnSubtitlesAvailable))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (props.open && !exporter.busy) exporter.clear();
  }, [props.open, props.media?.id]);
  const finished = exporter.job?.status === 'complete';
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <div className="dialog-eyebrow">EXPORT PROJECT</div>
        <DialogTitle className="dialog-title">Export video</DialogTitle>
        <DialogDescription className="dialog-description">
          Choose a format and time range for your export.
        </DialogDescription>
        <fieldset className="export-settings" disabled={!!exporter.busy}>
          <div className="format-options">
            {(['mp4', 'gif'] as const).map((format) => (
              <button
                key={format}
                type="button"
                className={`format-option ${settings.format === format ? 'selected' : ''}`}
                onClick={() => setSettings({ ...settings, format })}
                aria-pressed={settings.format === format}
              >
                {format === 'mp4' ? <Film size={21} /> : <Image size={21} />}
                <span>
                  <strong>{format.toUpperCase()}</strong>
                  <small>
                    {format === 'mp4' ? 'H.264 video · AAC audio' : 'Looping animation · no audio'}
                  </small>
                </span>
                {settings.format === format && <Check size={16} />}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="export-scope">
            Time range
          </label>
          <select
            id="export-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as typeof scope)}
          >
            <option value="range">Selected range</option>
            <option value="whole">Entire edited timeline</option>
          </select>
          <div className="export-time-range">
            <div>
              <span>IN</span>
              <TimeInput
                label="Export range start"
                value={exportRange.start}
                max={props.duration}
                disabled={scope === 'whole' || !!exporter.busy}
                onCommit={(start) => {
                  if (start > props.range.end - 0.05) return false;
                  props.onRangeChange({ ...props.range, start });
                }}
              />
            </div>
            <span>→</span>
            <div>
              <span>OUT</span>
              <TimeInput
                label="Export range end"
                value={exportRange.end}
                max={props.duration}
                disabled={scope === 'whole' || !!exporter.busy}
                onCommit={(end) => {
                  if (end < props.range.start + 0.05) return false;
                  props.onRangeChange({ ...props.range, end });
                }}
              />
            </div>
            <span className="duration-pill">{formatTime(exportDuration, true)}</span>
          </div>
          {settings.format === 'gif' && (
            <div className="gif-options">
              <label>
                Width
                <select
                  aria-label="GIF width"
                  value={settings.gifWidth}
                  onChange={(event) => {
                    const gifWidth = Number(event.target.value);
                    const style = resolveGifSubtitleSettings(settings);
                    setSettings({
                      ...settings,
                      gifWidth,
                      gifSubtitle: {
                        ...style,
                        fontSize: Math.max(
                          8,
                          Math.min(96, Math.round((style.fontSize * gifWidth) / settings.gifWidth)),
                        ),
                      },
                    });
                  }}
                >
                  {[320, 480, 640, 960].map((width) => (
                    <option key={width} value={width}>
                      {width}px
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Frame rate
                <select
                  aria-label="GIF frame rate"
                  value={settings.gifFps}
                  onChange={(event) =>
                    setSettings({ ...settings, gifFps: Number(event.target.value) })
                  }
                >
                  {[8, 12, 15, 24].map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} fps
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="subtitle-export-toggle">
            <span>
              <strong>Burn in subtitles</strong>
              <small>
                {!canBurnSubtitles
                  ? 'This FFmpeg build lacks subtitle rendering.'
                  : props.project.cues.length
                    ? 'Permanently render subtitles into the image.'
                    : 'Add or import subtitles to enable this.'}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Burn in subtitles"
              checked={settings.burnSubtitles && canBurnSubtitles && !!props.project.cues.length}
              disabled={!canBurnSubtitles || !props.project.cues.length}
              onChange={(event) =>
                setSettings({ ...settings, burnSubtitles: event.target.checked })
              }
            />
          </label>
          {settings.format === 'gif' &&
            settings.burnSubtitles &&
            canBurnSubtitles &&
            !!props.project.cues.length &&
            props.media && (
              <GifSubtitleSettingsPanel
                media={props.media}
                project={props.project}
                range={exportRange}
                settings={settings}
                onChange={setSettings}
                visible={props.open && !exporter.busy}
              />
            )}
          <p className="export-note">
            {exportDuration < minimumExportDuration
              ? `Choose a range of at least ${formatTime(minimumExportDuration, true)} for this format and frame rate.`
              : settings.format === 'mp4'
                ? `Canvas ${props.project.canvas?.width || props.media?.width} × ${props.project.canvas?.height || props.media?.height} · 30 fps · Includes timeline cuts`
                : `${Math.ceil(exportDuration * settings.gifFps).toLocaleString()} frames · Canvas aspect ratio · Width never upscaled`}
          </p>
        </fieldset>
        {exporter.error && (
          <p className="export-error" role="alert">
            {exporter.error}
          </p>
        )}
        {exporter.job?.status === 'failed' && (
          <p className="export-error" role="alert">
            {exporter.job.error}
          </p>
        )}
        {exporter.busy && (
          <div className="export-progress" aria-live="polite">
            <div>
              <span>
                <LoaderCircle className="spin" size={14} />
                {exporter.job?.status === 'queued' ? 'Waiting in queue' : 'Rendering your export…'}
              </span>
              <strong>{exporter.job?.progress || 0}%</strong>
            </div>
            <progress max={100} value={exporter.job?.progress || 0} />
          </div>
        )}
        {finished && (
          <div className="export-success" role="status">
            <CircleCheck size={17} />
            <span>Export complete. Your file is ready.</span>
          </div>
        )}
        <div className="dialog-footer">
          <span>
            {props.project.clips.length} {props.project.clips.length === 1 ? 'segment' : 'segments'}
            <span className="dot-separator">·</span>
            {props.project.cues.length} subtitles
          </span>
          {exporter.busy ? (
            <Button variant="outline" onClick={exporter.cancel}>
              Cancel export
            </Button>
          ) : finished ? (
            <Button asChild>
              <a href={exporter.job!.downloadUrl} download={exporter.job!.filename}>
                <ArrowDownToLine size={16} />
                Download {exporter.job!.filename?.split('.').at(-1)?.toUpperCase()}
              </a>
            </Button>
          ) : (
            <Button
              disabled={
                !props.media ||
                exportDuration < minimumExportDuration ||
                !props.project.clips.length
              }
              onClick={() =>
                props.media &&
                exporter.begin({
                  ...settings,
                  burnSubtitles:
                    settings.burnSubtitles && canBurnSubtitles && !!props.project.cues.length,
                  mediaId: props.media.id,
                  ...props.project,
                  range: exportRange,
                })
              }
            >
              <ArrowDownToLine size={16} />
              Export {settings.format.toUpperCase()}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
