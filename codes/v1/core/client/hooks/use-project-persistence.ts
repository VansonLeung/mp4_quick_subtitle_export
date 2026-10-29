import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExportSettings, MediaAsset, ProjectDocument } from '../../shared/editor.types';
import { defaultExportSettings } from '../../shared/editor.types';
import { requestJson } from '../lib/api';
import {
  clearLegacyRecovery,
  createProjectDraft,
  lastProjectKey,
  projectFingerprint,
  readRecoveryDraft,
  writeRecoveryDraft,
} from '../lib/project-recovery';
import type { useEditorSession } from './use-editor-session';

type Session = ReturnType<typeof useEditorSession>;
type SaveStatus = 'loading' | 'unsaved' | 'saving' | 'saved' | 'error';
export function useProjectPersistence(
  session: Session,
  zoom: number,
  setZoom: (zoom: number) => void,
  notify: (message: string) => void,
) {
  const [metadata, setMetadata] = useState<ProjectDocument | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const active = useRef<ProjectDocument | null>(null);
  const savedFingerprint = useRef('');
  const pendingSave = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const latestSession = useRef(session);
  latestSession.current = session;
  const current = useRef<ProjectDocument | null>(null);
  current.current = session.media
    ? createProjectDraft(
        session.media,
        session.project,
        session.range,
        exportSettings,
        { playhead: session.playback.currentTime, zoom },
        metadata,
      )
    : null;

  const save = useCallback(async function saveCurrent(): Promise<void> {
    if (pendingSave.current) {
      await pendingSave.current;
      return saveCurrent();
    }
    if (!current.current) return;
    const draft = { ...current.current };
    if (active.current?.id && active.current.mediaId === draft.mediaId) {
      draft.id = active.current.id;
      draft.revision = active.current.revision;
    }
    const fingerprint = projectFingerprint(draft);
    setStatus('saving');
    setError(null);
    const operation = (async () => {
      try {
        const saved = await requestJson<ProjectDocument>(
          draft.id ? `/api/projects/${draft.id}` : '/api/projects',
          {
            method: draft.id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          },
        );
        if (!mounted.current) return;
        active.current = saved;
        savedFingerprint.current = fingerprint;
        const latest = current.current;
        setMetadata(latest?.mediaId === saved.mediaId ? { ...saved, name: latest.name } : saved);
        if (latest?.mediaId === saved.mediaId) {
          current.current = {
            ...latest,
            id: saved.id,
            revision: saved.revision,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
          };
          writeRecoveryDraft(current.current);
        }
        try {
          localStorage.setItem(lastProjectKey, saved.id);
        } catch {
          /* Recent projects remain available from disk. */
        }
        clearLegacyRecovery();
        setStatus(latest && projectFingerprint(latest) !== fingerprint ? 'unsaved' : 'saved');
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : 'Project could not be saved.';
        setError(message);
        setStatus('error');
        throw failure;
      }
    })();
    pendingSave.current = operation;
    try {
      await operation;
    } finally {
      if (pendingSave.current === operation) pendingSave.current = null;
    }
  }, []);

  async function activate(document: ProjectDocument) {
    const media = await requestJson<MediaAsset>(`/api/media/${document.mediaId}`);
    active.current = document.id ? document : null;
    savedFingerprint.current = document.id ? projectFingerprint(document) : '';
    setMetadata(document);
    setExportSettings(document.exportSettings);
    setZoom(document.view.zoom);
    latestSession.current.loadProject(document, media);
    writeRecoveryDraft(document);
    setStatus(document.id ? 'saved' : 'unsaved');
    setError(null);
    if (document.id) {
      try {
        localStorage.setItem(lastProjectKey, document.id);
      } catch {
        /* Optional recent-project convenience. */
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    async function restore() {
      // HMR may retain a live, previously unsaved editor. Capture it before loading disk state.
      if (latestSession.current.media) {
        setReady(true);
        setStatus('unsaved');
        return;
      }
      try {
        const draft = readRecoveryDraft();
        let document = draft;
        if (draft?.id) {
          const saved = await requestJson<ProjectDocument>(`/api/projects/${draft.id}`);
          if (saved.revision !== draft.revision) {
            document =
              projectFingerprint(saved) === projectFingerprint(draft)
                ? { ...saved, view: draft.view }
                : {
                    ...draft,
                    id: '',
                    revision: 0,
                    name: `${draft.name.slice(0, 180)} (recovered)`,
                  };
          }
        } else if (!draft) {
          const lastId = localStorage.getItem(lastProjectKey);
          if (lastId) document = await requestJson<ProjectDocument>(`/api/projects/${lastId}`);
        }
        if (!disposed && document) await activate(document);
      } catch (failure) {
        if (!disposed) {
          setError(failure instanceof Error ? failure.message : 'Could not restore the project.');
          notify(
            'Project recovery could not finish. Open Projects to select a saved project or existing video.',
          );
        }
      } finally {
        if (!disposed) {
          setReady(true);
          setStatus((previous) => (previous === 'loading' ? 'unsaved' : previous));
        }
      }
    }
    void restore();
    return () => {
      disposed = true;
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !current.current) return;
    writeRecoveryDraft(current.current);
    const changed = projectFingerprint(current.current) !== savedFingerprint.current;
    if (changed && status !== 'error' && !pendingSave.current) setStatus('unsaved');
    if (status === 'error') return;
    const timeout = setTimeout(
      () => {
        void save().catch(() => {});
      },
      changed ? 800 : 1500,
    );
    return () => clearTimeout(timeout);
  }, [
    ready,
    session.media?.id,
    session.project,
    session.range,
    metadata?.name,
    exportSettings,
    zoom,
    Math.floor(session.playback.currentTime / 5),
  ]);

  useEffect(() => {
    const preserve = () => writeRecoveryDraft(current.current);
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      preserve();
      if (current.current && (status === 'error' || status === 'saving' || status === 'unsaved'))
        event.preventDefault();
    };
    window.addEventListener('pagehide', preserve);
    window.addEventListener('beforeunload', protectUnsaved);
    return () => {
      window.removeEventListener('pagehide', preserve);
      window.removeEventListener('beforeunload', protectUnsaved);
    };
  }, [status]);

  async function openProject(id: string) {
    await save();
    await activate(await requestJson<ProjectDocument>(`/api/projects/${id}`));
  }
  async function newProject() {
    await save();
    active.current = null;
    savedFingerprint.current = '';
    setMetadata(null);
    setExportSettings(defaultExportSettings);
    latestSession.current.clearProject();
    setZoom(1);
    writeRecoveryDraft(null);
    clearLegacyRecovery();
    try {
      localStorage.removeItem(lastProjectKey);
    } catch {
      /* Optional convenience. */
    }
    setStatus('unsaved');
    setError(null);
  }
  async function duplicate() {
    if (pendingSave.current) await pendingSave.current.catch(() => {});
    if (!current.current) return;
    const copy = await requestJson<ProjectDocument>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current.current,
        id: '',
        revision: 0,
        name: `${current.current.name.slice(0, 190)} copy`,
      }),
    });
    await activate(copy);
    notify('Project duplicated. The original video is shared.');
  }
  function rename(name: string) {
    if (current.current && name.trim()) {
      const next = { ...current.current, name: name.trim().slice(0, 200) };
      setMetadata(next);
      current.current = next;
    }
  }
  return {
    ready,
    status,
    error,
    name: current.current?.name || 'Untitled project',
    document: metadata,
    exportSettings,
    setExportSettings,
    save,
    openProject,
    newProject,
    duplicate,
    rename,
  };
}
