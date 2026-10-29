import { useEffect, useState } from 'react';
import { Film, FolderOpen, Plus } from 'lucide-react';
import type { MediaAsset, ProjectSummary } from '../../../shared/editor.types';
import { formatTime } from '../../../shared/time.utils';
import { requestJson } from '../../lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: (id: string) => Promise<void>;
  onMedia: (media: MediaAsset) => Promise<void>;
  onNew: () => Promise<void>;
};
export function ProjectLibraryDialog(props: Props) {
  const [tab, setTab] = useState<'projects' | 'media'>('projects');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open) return;
    let disposed = false;
    setError(null);
    setBusy(true);
    Promise.all([
      requestJson<ProjectSummary[]>('/api/projects'),
      requestJson<MediaAsset[]>('/api/media'),
    ])
      .then(([saved, assets]) => {
        if (!disposed) {
          setProjects(saved);
          setMedia(assets);
        }
      })
      .catch((failure) => {
        if (!disposed) setError(failure.message);
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [props.open]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      props.onOpenChange(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="project-library">
        <DialogTitle className="dialog-title">Projects</DialogTitle>
        <DialogDescription className="dialog-description">
          Continue a saved project or reuse a video already on this computer.
        </DialogDescription>
        <div className="library-tabs">
          <button aria-pressed={tab === 'projects'} onClick={() => setTab('projects')}>
            Saved projects <span>{projects.length}</span>
          </button>
          <button aria-pressed={tab === 'media'} onClick={() => setTab('media')}>
            Existing videos <span>{media.length}</span>
          </button>
        </div>
        {error && (
          <p className="export-error" role="alert">
            {error}
          </p>
        )}
        <div className="library-items" aria-busy={busy}>
          {tab === 'projects'
            ? projects.map((project) => (
                <button
                  className="library-item"
                  key={project.id}
                  disabled={busy}
                  onClick={() => perform(() => props.onOpen(project.id))}
                >
                  <FolderOpen size={21} />
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {project.canvas.width} × {project.canvas.height} ·{' '}
                      {formatTime(project.duration)} ·{' '}
                      {new Date(project.updatedAt).toLocaleString()}
                    </small>
                  </span>
                  <span className="library-open">Open</span>
                </button>
              ))
            : media.map((asset) => (
                <button
                  className="library-item"
                  key={asset.id}
                  disabled={busy}
                  onClick={() => perform(() => props.onMedia(asset))}
                >
                  <Film size={21} />
                  <span>
                    <strong>{asset.name}</strong>
                    <small>
                      {asset.width} × {asset.height} · {formatTime(asset.duration)} ·{' '}
                      {(asset.size / 1024 ** 2).toFixed(1)} MB
                    </small>
                    <code>{asset.id}</code>
                  </span>
                  <span className="library-open">Use video</span>
                </button>
              ))}
          {!busy && !(tab === 'projects' ? projects.length : media.length) && (
            <p className="library-empty">
              {tab === 'projects'
                ? 'Saved projects will appear here.'
                : 'Imported and downloaded videos will appear here.'}
            </p>
          )}
          {busy && <p className="library-empty">Loading…</p>}
        </div>
        <div className="dialog-footer">
          <span>Media is shared between projects.</span>
          <Button variant="outline" disabled={busy} onClick={() => perform(props.onNew)}>
            <Plus size={14} />
            New project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
