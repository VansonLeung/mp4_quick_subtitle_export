import type { MediaAsset, Project, TimeRange } from '../../shared/editor.types';

export const legacyRecoveryKey = 'framecut:legacy-project-recovery';
let lastProject: Project | undefined;
let lastRange: TimeRange | undefined;

// Capture the existing editor before introducing the persistent project model.
export function captureLegacyProject(
  media: MediaAsset | null,
  project: Project,
  range: TimeRange,
  playhead: number,
) {
  if (!media || (project === lastProject && range === lastRange)) return;
  try {
    localStorage.setItem(legacyRecoveryKey, JSON.stringify({ media, project, range, playhead }));
    lastProject = project;
    lastRange = range;
  } catch {
    /* The open tab can still be saved directly if browser storage is full. */
  }
}
