import type {
  ExportSettings,
  MediaAsset,
  Project,
  ProjectDocument,
  TimeRange,
} from '../../shared/editor.types';
import { defaultExportSettings } from '../../shared/editor.types';
import { resolveComposition } from '../../shared/composition.utils';
import { legacyRecoveryKey } from './legacy-project-recovery';

const draftKey = 'framecut:project-draft:v1';
export const lastProjectKey = 'framecut:last-project';
export function writeRecoveryDraft(document: ProjectDocument | null) {
  try {
    if (document) sessionStorage.setItem(draftKey, JSON.stringify(document));
    else sessionStorage.removeItem(draftKey);
  } catch {
    /* Disk autosave remains available when browser storage is full. */
  }
}
export function readRecoveryDraft(): ProjectDocument | null {
  try {
    const current = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (current?.schemaVersion === 1 && current.project && current.mediaId) return current;
    const legacy = JSON.parse(localStorage.getItem(legacyRecoveryKey) || 'null');
    if (legacy?.media?.id && Array.isArray(legacy.project?.clips))
      return createProjectDraft(legacy.media, legacy.project, legacy.range, defaultExportSettings, {
        playhead: legacy.playhead || 0,
        zoom: 1,
      });
  } catch {
    /* An invalid local recovery entry must not prevent opening saved projects. */
  }
  return null;
}
export function clearLegacyRecovery() {
  try {
    localStorage.removeItem(legacyRecoveryKey);
  } catch {
    /* Ignore unavailable browser storage. */
  }
}
export function createProjectDraft(
  media: MediaAsset,
  project: Project,
  range: TimeRange,
  exportSettings: ExportSettings,
  view: ProjectDocument['view'],
  previous?: ProjectDocument | null,
): ProjectDocument {
  const sameMedia = previous?.mediaId === media.id;
  return {
    schemaVersion: 1,
    id: sameMedia ? previous.id : '',
    name: sameMedia ? previous.name : media.name.replace(/\.[^.]+$/, '').slice(0, 200),
    mediaId: media.id,
    revision: sameMedia ? previous.revision : 0,
    createdAt: sameMedia ? previous.createdAt : '',
    updatedAt: sameMedia ? previous.updatedAt : '',
    project: { ...project, ...resolveComposition(project, media) },
    range,
    exportSettings,
    view,
  };
}
export function projectFingerprint(document: ProjectDocument) {
  return JSON.stringify([
    document.mediaId,
    document.name,
    document.project,
    document.range,
    document.exportSettings,
    document.view.zoom,
  ]);
}
