import { LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { VideoImportJob } from '../../../shared/editor.types';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: VideoImportJob | null;
  busy: boolean;
  error: string | null;
  onBegin: (url: string) => void;
  onCancel: () => void;
};

export function ImportUrlDialog({
  open,
  onOpenChange,
  job,
  busy,
  error,
  onBegin,
  onCancel,
}: Props) {
  const [url, setUrl] = useState('');
  const failure = error || job?.error;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="dialog-eyebrow">IMPORT VIDEO</div>
        <DialogTitle className="dialog-title">Import from URL</DialogTitle>
        <DialogDescription className="dialog-description">
          Paste a public video page URL. One MP4 video will be downloaded for editing.
        </DialogDescription>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onBegin(url);
          }}
        >
          <label className="field-label" htmlFor="video-import-url">
            Video URL
          </label>
          <input
            id="video-import-url"
            className="url-import-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={4096}
            placeholder="https://…"
            value={url}
            required
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
          <p className="url-import-note">
            Downloads run locally through yt-dlp. Playlists, sign-in, and protected videos are not
            supported.
          </p>
          {busy && (
            <div className="export-progress" aria-live="polite">
              <div>
                <span>
                  <LoaderCircle className="spin" size={14} />
                  {job?.status === 'queued'
                    ? 'Waiting to download'
                    : job?.phase === 'converting'
                      ? 'Converting for browser playback…'
                      : job?.phase === 'inspecting'
                        ? 'Preparing video for editing…'
                        : 'Downloading video…'}
                </span>
                <strong>{job?.progress || 0}%</strong>
              </div>
              <progress max={100} value={job?.progress || 0} />
            </div>
          )}
          {failure && (
            <p className="export-error" role="alert">
              {failure}
            </p>
          )}
          {job?.output && (
            <section className="url-import-output" aria-label="yt-dlp process output">
              <strong>Process output</strong>
              <pre role="log" aria-live="polite">
                {job.output}
              </pre>
            </section>
          )}
          <div className="url-import-actions">
            {busy ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel download
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={!url.trim()}>
                  Import video
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
