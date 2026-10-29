import { useCallback, useState } from 'react';
import type { Project } from '../../shared/editor.types';

const emptyProject: Project = { clips: [], cues: [] };
type History = { past: Project[]; present: Project; future: Project[] };

export function useProjectHistory() {
  const [history, setHistory] = useState<History>({ past: [], present: emptyProject, future: [] });
  const commit = useCallback((update: Project | ((current: Project) => Project)) => {
    setHistory((current) => {
      const next = typeof update === 'function' ? update(current.present) : update;
      if (next === current.present) return current;
      return { past: [...current.past.slice(-99), current.present], present: next, future: [] };
    });
  }, []);
  const reset = useCallback(
    (project: Project) => setHistory({ past: [], present: project, future: [] }),
    [],
  );
  const undo = useCallback(
    () =>
      setHistory((current) =>
        current.past.length
          ? {
              past: current.past.slice(0, -1),
              present: current.past.at(-1)!,
              future: [current.present, ...current.future],
            }
          : current,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((current) =>
        current.future.length
          ? {
              past: [...current.past, current.present],
              present: current.future[0],
              future: current.future.slice(1),
            }
          : current,
      ),
    [],
  );
  return {
    project: history.present,
    commit,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
