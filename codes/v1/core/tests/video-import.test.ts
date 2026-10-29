import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  buildYtDlpArguments,
  buildBrowserCompatibleArguments,
  sanitizeYtDlpOutput,
  validateVideoImportUrl,
  ytDlpFormatSelector,
} from '../server/services/video-import-jobs.service';
import { ffmpegPath, ffprobePath, resolveConfiguredPath } from '../server/config';

const executeFile = promisify(execFile);

test('accepts a public HTTP(S) video page URL', () => {
  assert.equal(
    validateVideoImportUrl('https://video.example/watch?id=123'),
    'https://video.example/watch?id=123',
  );
});

test('rejects non-HTTP, local, IP-literal, and credential URLs', () => {
  for (const url of [
    'file:///tmp/video.mp4',
    'ftp://video.example/file.mp4',
    'http://localhost/video',
    'https://media.local/video',
    'http://192.168.1.2/video',
    'https://user:pass@video.example/watch',
  ]) {
    assert.throws(() => validateVideoImportUrl(url), /public video URL|HTTP\(S\)/, url);
  }
});

test('rejects missing and oversized input', () => {
  assert.throws(() => validateVideoImportUrl(undefined), /valid public video URL/);
  assert.throws(() => validateVideoImportUrl(`https://video.example/${'x'.repeat(4096)}`));
});

test('sanitizes process output before exposing it to the browser', () => {
  const output = sanitizeYtDlpOutput(
    '\u001b[31mERROR\u001b[0m: Sign in at https://example.com/watch?v=secret\u0007',
  );
  assert.equal(output, 'ERROR: Sign in at [URL]');
  assert.equal(sanitizeYtDlpOutput('x'.repeat(3500)).length, 3000);
});

test('resolves cookie-file paths including home-relative values', () => {
  assert.equal(
    resolveConfiguredPath('~/.config/framecut/cookies.txt'),
    path.join(homedir(), '.config/framecut/cookies.txt'),
  );
  assert.equal(resolveConfiguredPath(undefined), undefined);
  assert.equal(resolveConfiguredPath('  '), undefined);
});

test('prefers MP4 sources but falls back when those formats are unavailable', () => {
  assert.equal(
    ytDlpFormatSelector,
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo*+bestaudio/best',
  );
});

test('enables the running Node.js binary for yt-dlp JavaScript challenges', () => {
  const args = buildYtDlpArguments('https://video.example/watch?id=123', '/tmp/video.%(ext)s');
  const runtimeIndex = args.indexOf('--js-runtimes');
  assert.notEqual(runtimeIndex, -1);
  assert.equal(args[runtimeIndex + 1], `node:${process.execPath}`);
  assert.equal(args.includes('--no-warnings'), false);
});

test('converts a non-browser-friendly download to H.264 and AAC', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'framecut-transcode-'));
  const inputPath = path.join(directory, 'source.mp4');
  const outputPath = path.join(directory, 'browser-compatible.mp4');
  try {
    await executeFile(ffmpegPath, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=320x180:r=24:d=1',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:v',
      'mpeg4',
      '-c:a',
      'mp3',
      '-shortest',
      inputPath,
    ]);
    await executeFile(ffmpegPath, buildBrowserCompatibleArguments(inputPath, outputPath), {
      timeout: 20_000,
    });
    const { stdout } = await executeFile(ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,pix_fmt',
      '-of',
      'json',
      outputPath,
    ]);
    const streams = JSON.parse(stdout).streams as { codec_name: string; pix_fmt?: string }[];
    assert.deepEqual(
      streams.map((stream) => stream.codec_name),
      ['h264', 'aac'],
    );
    assert.equal(streams[0].pix_fmt, 'yuv420p');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
