import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectDocument, ProjectSummary } from '../../shared/editor.types';
import { timelineDuration } from '../../shared/timeline.utils';
import { projectDirectory } from '../config';
import { readMedia } from './media.service';
import { validateProjectDocument } from './project-validation.service';

const pendingWrites = new Map<string, Promise<unknown>>();
function projectPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid project ID.');
  return path.join(projectDirectory, id);
}
async function atomicWrite(filename: string, value: ProjectDocument) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2));
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function readProject(id: string): Promise<ProjectDocument> {
  const directory = projectPath(id);
  const candidates = ['project.json'];
  try {
    candidates.push(
      ...(await readdir(path.join(directory, 'revisions')))
        .filter((name) => /^\d+\.json$/.test(name))
        .sort()
        .reverse()
        .map((name) => `revisions/${name}`),
    );
  } catch {
    /* A new project may have no recovery snapshots yet. */
  }
  for (const candidate of candidates) {
    try {
      const document = JSON.parse(
        await readFile(path.join(directory, candidate), 'utf8'),
      ) as ProjectDocument;
      if (
        document.id === id &&
        document.schemaVersion === 1 &&
        document.project &&
        document.range &&
        document.view
      )
        return document;
    } catch {
      /* Recover from the most recent intact snapshot. */
    }
  }
  throw Object.assign(
    new Error('Project not found or no readable recovery snapshot is available.'),
    { status: 404 },
  );
}
export async function listProjects(): Promise<ProjectSummary[]> {
  const directories = await readdir(projectDirectory, { withFileTypes: true });
  const projects = await Promise.all(
    directories
      .filter((item) => item.isDirectory() && /^[a-f0-9-]{36}$/.test(item.name))
      .map(async (item) => {
        try {
          const document = await readProject(item.name);
          return {
            id: document.id,
            name: document.name,
            mediaId: document.mediaId,
            revision: document.revision,
            updatedAt: document.updatedAt,
            canvas: document.project.canvas!,
            duration: timelineDuration(document.project.clips),
          };
        } catch {
          return null;
        }
      }),
  );
  return projects
    .filter((project): project is ProjectSummary => project !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
export async function saveProject(
  body: ProjectDocument,
  existingId?: string,
): Promise<ProjectDocument> {
  const id = existingId || randomUUID();
  const previousWrite = pendingWrites.get(id) || Promise.resolve();
  const operation = previousWrite
    .catch(() => {})
    .then(async () => {
      const media = await readMedia(body?.mediaId);
      const validated = validateProjectDocument(body, media);
      const previous = existingId ? await readProject(id) : undefined;
      if (
        previous &&
        (previous.revision !== validated.revision || previous.mediaId !== validated.mediaId)
      ) {
        throw Object.assign(
          new Error(
            'This project changed in another tab. Duplicate your current edits or reopen the latest saved version.',
          ),
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const document = {
        ...validated,
        id,
        revision: (previous?.revision || 0) + 1,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      };
      const directory = projectPath(id);
      const revisions = path.join(directory, 'revisions');
      await mkdir(revisions, { recursive: true });
      // Persist a recovery copy first, then atomically replace the current document.
      await atomicWrite(
        path.join(revisions, `${String(document.revision).padStart(10, '0')}.json`),
        document,
      );
      await atomicWrite(path.join(directory, 'project.json'), document);
      const snapshots = (await readdir(revisions))
        .filter((name) => /^\d+\.json$/.test(name))
        .sort();
      await Promise.all(
        snapshots.slice(0, -10).map((name) => rm(path.join(revisions, name), { force: true })),
      );
      return document;
    });
  pendingWrites.set(id, operation);
  try {
    return await operation;
  } finally {
    if (pendingWrites.get(id) === operation) pendingWrites.delete(id);
  }
}
