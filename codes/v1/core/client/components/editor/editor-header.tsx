import { ArrowDownToLine, FolderOpen, Link2, Maximize, Redo2, Undo2 } from 'lucide-react';
import { Button } from '../ui/button';
import type { MediaAsset } from '../../../shared/editor.types';

type Props = {
  media: MediaAsset | null;
  onOpen: () => void;
  onImportUrl: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
};
export function EditorHeader({
  media,
  onOpen,
  onImportUrl,
  onExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  busy,
}: Props) {
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* Some embedded browsers do not allow fullscreen. */
    }
  }
  return (
    <header className="editor-header">
      <a className="brand" href="/" aria-label="Framecut home">
        <span className="brand-mark">
          f<span />
        </span>
        <span>
          framecut<span className="brand-dot">.</span>
        </span>
      </a>
      <span className="header-divider" />
      <div className="project-title">
        <strong>{media?.name.replace(/\.[^.]+$/, '') || 'Untitled project'}</strong>
        <span>Video & subtitles</span>
      </div>
      <div className="header-actions">
        <div className="history-actions">
          <Button
            variant="ghost"
            size="icon"
            title="Undo (⌘/Ctrl Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Redo (⌘/Ctrl Shift Z)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 size={17} />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="fullscreen-button"
          title="Toggle fullscreen"
          aria-label="Toggle fullscreen"
          onClick={toggleFullscreen}
        >
          <Maximize size={17} />
        </Button>
        <span className="header-divider" />
        <Button variant="ghost" className="url-import-button" disabled={busy} onClick={onImportUrl}>
          <Link2 size={16} />
          <span>From URL</span>
        </Button>
        <Button variant="outline" disabled={busy} onClick={onOpen}>
          <FolderOpen size={16} />
          <span>{media ? 'Replace video' : 'Open video'}</span>
        </Button>
        <Button disabled={!media || busy} onClick={onExport}>
          <ArrowDownToLine size={16} />
          <span>Export</span>
        </Button>
      </div>
    </header>
  );
}
