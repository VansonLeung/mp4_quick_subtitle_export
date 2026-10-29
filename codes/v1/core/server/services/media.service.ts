import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffprobePath, uploadDirectory } from '../config';
import type { MediaAsset } from '../../shared/editor.types';

const executeFile = promisify(execFile);
export type StoredMedia = MediaAsset & { filePath: string };

export async function inspectMediaFile(file: {
  filename: string;
  originalname: string;
  path: string;
  size: number;
}): Promise<StoredMedia> {
  const { stdout } = await executeFile(
    ffprobePath,
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file.path],
    { timeout: 30_000, maxBuffer: 2_000_000 },
  ).catch(() => {
    throw new Error('This file is not a readable MP4 or M4V video.');
  });
  const probe = JSON.parse(stdout);
  const video = probe.streams?.find(
    (stream: { codec_type: string; disposition?: { attached_pic?: number } }) =>
      stream.codec_type === 'video' && !stream.disposition?.attached_pic,
  );
  const duration = Number(video?.duration || probe.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0)
    throw new Error('This file does not contain a readable video track.');
  const rotation = Math.abs(
    Number(
      video.side_data_list?.find((side: { rotation?: number }) => side.rotation !== undefined)
        ?.rotation ||
        video.tags?.rotate ||
        0,
    ),
  );
  const rotated = rotation % 180 === 90;
  const media: StoredMedia = {
    id: path.basename(file.filename, '.video'),
    name: file.originalname,
    duration,
    width: rotated ? video.height : video.width,
    height: rotated ? video.width : video.height,
    hasAudio: probe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'),
    size: file.size,
    url: `/api/media/${path.basename(file.filename, '.video')}/video`,
    filePath: file.path,
  };
  await writeFile(path.join(uploadDirectory, `${media.id}.json`), JSON.stringify(media));
  return media;
}

export function inspectUploadedMedia(file: Express.Multer.File) {
  return inspectMediaFile({
    ...file,
    originalname: Buffer.from(file.originalname, 'latin1').toString('utf8'),
  });
}

export async function readMedia(mediaId: string): Promise<StoredMedia> {
  if (!/^[a-f0-9-]{36}$/.test(mediaId)) throw new Error('Invalid video ID.');
  try {
    return JSON.parse(await readFile(path.join(uploadDirectory, `${mediaId}.json`), 'utf8'));
  } catch {
    throw new Error('Video not found. Import the video again.');
  }
}
