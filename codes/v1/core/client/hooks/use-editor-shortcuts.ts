import { useEffect } from 'react';
import type { useEditorSession } from './use-editor-session';

export function useEditorShortcuts(
  session: ReturnType<typeof useEditorSession>,
  dialogOpen: boolean,
) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        dialogOpen ||
        (event.target instanceof HTMLElement &&
          event.target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      const modified = event.metaKey || event.ctrlKey;
      if (modified && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (modified && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        session.redo();
        return;
      }
      if (modified || event.altKey || !session.duration) return;
      switch (event.key.toLowerCase()) {
        case ' ':
          if (event.target instanceof HTMLElement && event.target.closest('button, a')) return;
          event.preventDefault();
          void session.playback.togglePlayback();
          break;
        case 's':
          event.preventDefault();
          session.splitAtPlayhead();
          break;
        case 'delete':
        case 'backspace':
          event.preventDefault();
          session.deleteSelectedClip();
          break;
        case 'arrowleft':
          event.preventDefault();
          session.playback.seek(session.playback.currentTime - (event.shiftKey ? 1 : 1 / 30));
          break;
        case 'arrowright':
          event.preventDefault();
          session.playback.seek(session.playback.currentTime + (event.shiftKey ? 1 : 1 / 30));
          break;
        case 'i':
          if (session.playback.currentTime <= session.range.end - 0.05)
            session.setRange({ ...session.range, start: session.playback.currentTime });
          break;
        case 'o':
          if (session.playback.currentTime >= session.range.start + 0.05)
            session.setRange({ ...session.range, end: session.playback.currentTime });
          break;
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [session, dialogOpen]);
}
