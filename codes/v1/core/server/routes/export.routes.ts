import { Router } from 'express';
import path from 'node:path';
import { readMedia } from '../services/media.service';
import { validateExportRequest } from '../services/export-validation.service';
import { renderGifPreview } from '../services/gif-preview.service';
import {
  cancelExportJob,
  createExportJob,
  getExportJob,
  publicJob,
} from '../services/export-jobs.service';

export const exportRouter = Router();

exportRouter.post('/preview', async (request, response, next) => {
  const controller = new AbortController();
  response.on('close', () => controller.abort());
  try {
    const media = await readMedia(request.body?.mediaId);
    const validRequest = validateExportRequest(request.body, media);
    const frame = await renderGifPreview(
      validRequest,
      media,
      request.body.previewTime,
      controller.signal,
    );
    if (!controller.signal.aborted)
      response.type('png').set('Cache-Control', 'no-store').send(frame);
  } catch (error) {
    if (!controller.signal.aborted) next(error);
  }
});

exportRouter.post('/', async (request, response, next) => {
  try {
    const media = await readMedia(request.body?.mediaId);
    const validRequest = validateExportRequest(request.body, media);
    response.status(202).json(createExportJob(validRequest, media));
  } catch (error) {
    next(error);
  }
});

exportRouter.get('/:id', (request, response) => {
  const job = getExportJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Export not found. The server may have restarted.' });
    return;
  }
  response.json(publicJob(job));
});

exportRouter.delete('/:id', (request, response) => {
  cancelExportJob(request.params.id);
  response.sendStatus(204);
});

exportRouter.get('/:id/download', (request, response) => {
  const job = getExportJob(request.params.id);
  if (!job || job.status !== 'complete') {
    response.status(404).json({ error: 'This export is not ready.' });
    return;
  }
  response.download(
    path.join(job.directory, `output.${job.request.format}`),
    job.filename || `export.${job.request.format}`,
    { dotfiles: 'allow' },
  );
});
