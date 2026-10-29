import { Router } from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { uploadDirectory } from '../config';
import { inspectUploadedMedia, readMedia } from '../services/media.service';
import {
  cancelVideoImportJob,
  createVideoImportJob,
  getVideoImportJob,
  publicVideoImportJob,
} from '../services/video-import-jobs.service';

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, _file, callback) => callback(null, `${randomUUID()}.video`),
  }),
  limits: { fileSize: 4 * 1024 ** 3, files: 1 },
  fileFilter: (_request, file, callback) =>
    /\.(mp4|m4v)$/i.test(file.originalname)
      ? callback(null, true)
      : callback(new Error('Choose an MP4 or M4V video.')),
});
export const mediaRouter = Router();
mediaRouter.get('/', async (_request, response, next) => {
  try {
    const names = (await readdir(uploadDirectory)).filter((name) =>
      /^[a-f0-9-]{36}\.json$/.test(name),
    );
    const assets = await Promise.all(
      names.map(async (name) => {
        try {
          const { filePath, ...media } = await readMedia(path.basename(name, '.json'));
          const details = await stat(filePath);
          return { ...media, importedAt: details.mtime.toISOString() };
        } catch {
          return null;
        }
      }),
    );
    response.json(
      assets
        .filter((item) => item !== null)
        .sort((left, right) => right!.importedAt.localeCompare(left!.importedAt)),
    );
  } catch (error) {
    next(error);
  }
});
mediaRouter.get('/:id', async (request, response, next) => {
  try {
    const { filePath: _filePath, ...media } = await readMedia(request.params.id);
    response.json(media);
  } catch (error) {
    next(error);
  }
});

mediaRouter.post('/imports', (request, response, next) => {
  try {
    response.status(202).json(createVideoImportJob(request.body?.url));
  } catch (error) {
    next(error);
  }
});

mediaRouter.get('/imports/:id', (request, response) => {
  const job = getVideoImportJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Video import not found.' });
    return;
  }
  response.json(publicVideoImportJob(job));
});

mediaRouter.delete('/imports/:id', (request, response) => {
  const job = getVideoImportJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Video import not found.' });
    return;
  }
  cancelVideoImportJob(job.id);
  response.json(publicVideoImportJob(job));
});

mediaRouter.post('/', upload.single('video'), async (request, response, next) => {
  if (!request.file) {
    response.status(400).json({ error: 'Choose a video to import.' });
    return;
  }
  try {
    const { filePath: _filePath, ...media } = await inspectUploadedMedia(request.file);
    response.status(201).json(media);
  } catch (error) {
    await unlink(request.file.path).catch(() => {});
    next(error);
  }
});

mediaRouter.get('/:id/video', async (request, response, next) => {
  try {
    const media = await readMedia(request.params.id);
    response.type('video/mp4').sendFile(media.filePath, { dotfiles: 'allow' }, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    next(error);
  }
});
