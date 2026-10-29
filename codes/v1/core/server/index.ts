import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  appRoot,
  exportDirectory,
  ffmpegPath,
  port,
  uploadDirectory,
  projectDirectory,
} from './config';
import { projectRouter } from './routes/project.routes';
import { mediaRouter } from './routes/media.routes';
import { exportRouter } from './routes/export.routes';
import { stopAllExports } from './services/export-jobs.service';
import { stopAllVideoImports } from './services/video-import-jobs.service';

await Promise.all([
  mkdir(uploadDirectory, { recursive: true }),
  mkdir(exportDirectory, { recursive: true }),
  mkdir(projectDirectory, { recursive: true }),
]);
const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));
const { stdout: filters } = await promisify(execFile)(ffmpegPath, ['-hide_banner', '-filters']);
const burnSubtitlesAvailable = /\bsubtitles\s/.test(filters);
app.get('/api/health', (_request, response) =>
  response.json({ status: 'ok', burnSubtitlesAvailable }),
);
app.use('/api/media', mediaRouter);
app.use('/api/exports', exportRouter);
app.use('/api/projects', projectRouter);
app.use('/api', (_request, response) =>
  response.status(404).json({ error: 'API route not found.' }),
);

if (process.argv.includes('--production')) {
  app.use(express.static(path.join(appRoot, 'dist')));
  app.get('/{*path}', (_request, response) =>
    response.sendFile(path.join(appRoot, 'dist/index.html')),
  );
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (response.headersSent) return;
  const message =
    error.code === 'LIMIT_FILE_SIZE'
      ? 'Video is too large. The maximum size is 4 GB.'
      : error.message || 'Something went wrong.';
  response.status(error.status || 400).json({ error: message });
};
app.use(errorHandler);
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Framecut is ready at http://localhost:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stopAllExports();
    stopAllVideoImports();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
