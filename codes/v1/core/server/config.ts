import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

export const appRoot = fileURLToPath(new URL('..', import.meta.url));
export const dataRoot = path.resolve(process.env.DATA_DIR || path.join(appRoot, '.data'));
export const uploadDirectory = path.join(dataRoot, 'uploads');
export const exportDirectory = path.join(dataRoot, 'exports');
export const projectDirectory = path.join(dataRoot, 'projects');
export const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
export const ffprobePath = process.env.FFPROBE_PATH || ffprobeStatic.path;
export const ytDlpDirectory = path.resolve(appRoot, '../services/yt-dlp');
const configuredYtDlpPython =
  process.env.YT_DLP_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
export function resolveConfiguredPath(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const configuredPath = value.trim();
  return path.resolve(
    appRoot,
    configuredPath.startsWith('~/')
      ? path.join(homedir(), configuredPath.slice(2))
      : configuredPath,
  );
}
export const ytDlpPython = configuredYtDlpPython.startsWith('~/')
  ? path.join(homedir(), configuredYtDlpPython.slice(2))
  : configuredYtDlpPython;
export const ytDlpCookiesPath = resolveConfiguredPath(process.env.YT_DLP_COOKIES);
export const port = Number(process.env.PORT || 5533);
