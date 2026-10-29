import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ffmpegPath } from '../server/config';

let temporary: string;
let videoPath: string;
test.beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'framecut-browser-'));
  videoPath = path.join(temporary, 'studio-test.mp4');
  await promisify(execFile)(ffmpegPath, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=640x360:r=30:d=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    '-shortest',
    videoPath,
  ]);
});
test.afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

test('editing, ripple cuts, range selection and real downloadable exports', async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open your video' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('editor-empty.png') });
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Ready to edit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select video segment 1' })).toBeVisible();
  await page.getByLabel('Choose SRT file').setInputFiles({
    name: 'sample.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from(
      '1\n00:00:00,500 --> 00:00:02,000\nFirst subtitle\n\n2\n00:00:02,000 --> 00:00:04,000\nMiddle subtitle\n\n3\n00:00:04,000 --> 00:00:05,500\nLast subtitle\n',
    ),
  });
  await expect(page.getByLabel('Subtitle 3 text')).toBeVisible();
  await page.getByLabel('Subtitle 1 text').fill('Edited subtitle');
  await page.getByLabel('Subtitle 1 text').blur();
  const timeline = page.locator('.timeline-track-content');
  const rect = (await timeline.boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + 18);
  await expect(page.locator('.timecode')).toContainText('00:00:03.000');
  await page.getByRole('button', { name: 'Split at playhead', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select video segment 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete selected segment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select video segment 2' })).toHaveCount(0);
  await expect(page.getByLabel('Subtitle 3 text')).toHaveCount(0);
  await expect(page.getByLabel('Subtitle 2 end')).toHaveValue('00:00:03.000');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select video segment 2' })).toBeVisible();
  await expect(page.getByLabel('Subtitle 3 text')).toBeVisible();
  await page.getByLabel('Range start', { exact: true }).fill('00:00:01.000');
  await page.getByLabel('Range start', { exact: true }).blur();
  await page.getByLabel('Range end', { exact: true }).fill('00:00:04.000');
  await page.getByLabel('Range end', { exact: true }).blur();
  await page.getByRole('slider', { name: 'Drag export range end' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:03.900');
  await page.screenshot({ path: testInfo.outputPath('editor-loaded.png') });
  const srtDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SRT', exact: true }).click();
  const srtDownload = await srtDownloadEvent;
  const subtitles = await readFile((await srtDownload.path())!, 'utf8');
  expect(subtitles).toContain('00:00:00,000 --> 00:00:01,000');
  expect(subtitles).toContain('Edited subtitle');
  expect(subtitles).not.toContain('Last subtitle');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /GIF Looping/ }).click();
  await page.getByRole('switch', { name: 'Burn in subtitles' }).check();
  await page.getByRole('button', { name: 'Export GIF', exact: true }).click();
  await expect(page.getByText('Export complete. Your file is ready.')).toBeVisible({
    timeout: 30_000,
  });
  const gifDownloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download GIF' }).click();
  const gifDownload = await gifDownloadEvent;
  const gif = await readFile((await gifDownload.path())!);
  expect(gif.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  await page.screenshot({ path: testInfo.outputPath('export-complete.png') });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Go to start', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video) => (video as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(pageErrors).toEqual([]);
});

test('small screens retain usable controls without horizontal page overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open video', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('editor-mobile.png'), fullPage: true });
});

test('URL import rejects local addresses before starting a download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'From URL', exact: true }).click();
  await page.getByLabel('Video URL').fill('http://localhost/video');
  await page.getByRole('button', { name: 'Import video', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Use an HTTP(S) URL for a public video page.');
  await expect(page.getByRole('heading', { name: 'Import from URL' })).toBeVisible();
});

test('URL import displays yt-dlp process output from the server', async ({ page }) => {
  const job = {
    id: 'test-import-job',
    status: 'processing',
    progress: 20,
    output: '[youtube] Extracting video information\nERROR: Sign in to confirm you are not a bot.',
  };
  await page.route('**/api/media/imports', async (route) => {
    await route.fulfill({ json: job, status: 202 });
  });
  await page.route('**/api/media/imports/test-import-job', async (route) => {
    await route.fulfill({ json: job });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'From URL', exact: true }).click();
  await page.getByLabel('Video URL').fill('https://video.example/watch?id=123');
  await page.getByRole('button', { name: 'Import video', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Sign in to confirm you are not a bot.');
});

test('preview skips deleted source time and both trim controls ripple subtitles', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Ready to edit')).toBeVisible();
  await page.getByLabel('Choose SRT file').setInputFiles({
    name: 'span.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:00,000 --> 00:00:06,000\nAcross the entire video\n'),
  });
  await expect(page.getByLabel('Subtitle 1 text')).toBeVisible();
  async function seek(time: number, duration: number) {
    const rect = (await page.locator('.timeline-track-content').boundingBox())!;
    await page.mouse.click(rect.x + (rect.width * time) / duration, rect.y + 18);
  }
  await seek(2, 6);
  await page.getByRole('button', { name: 'Split at playhead', exact: true }).click();
  await seek(4, 6);
  await page.getByRole('button', { name: 'Split at playhead', exact: true }).click();
  await page.getByRole('button', { name: 'Select video segment 2', exact: true }).click();
  await page.getByRole('button', { name: 'Delete selected segment', exact: true }).click();
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:04.000');
  await expect(page.getByLabel('Subtitle 1 end')).toHaveValue('00:00:04.000');
  await seek(1.5, 4);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video) => (video as HTMLVideoElement).currentTime))
    .toBeGreaterThan(4.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await seek(0.5, 4);
  const clipRect = (await page
    .getByRole('button', { name: 'Select video segment 1', exact: true })
    .boundingBox())!;
  await page.mouse.click(clipRect.x + clipRect.width / 4, clipRect.y + 20);
  await page.getByRole('button', { name: 'Trim start to playhead', exact: true }).click();
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:03.500');
  await seek(1, 3.5);
  await page.getByRole('button', { name: 'Trim end to playhead', exact: true }).click();
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:03.000');
  await expect(page.getByLabel('Subtitle 1 end')).toHaveValue('00:00:03.000');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:03.500');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:04.000');
  const handle = page.getByRole('slider', { name: 'Drag export range start' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', /^(0\.[1-9]|[1-3])/);
});

test('projects save composition, range, view and export settings, reopen and share existing media', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Ready to edit')).toBeVisible();
  const name = `Portrait project ${Date.now()}`;
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page.getByLabel('Project name', { exact: true }).blur();
  await page
    .getByRole('button', { name: 'Add subtitle', description: 'Add subtitle at playhead' })
    .click();
  await page.getByLabel('Subtitle 1 text').fill('Saved caption');
  await page.getByLabel('Subtitle 1 text').blur();
  await page.getByRole('tab', { name: 'Canvas & video' }).click();
  await page.getByLabel('Canvas preset').selectOption('1080x1920');
  await expect(page.getByLabel('Canvas height')).toHaveValue('1920');
  for (const [label, value] of [
    ['Canvas width', '320'],
    ['Canvas height', '320'],
    ['Video width', '160'],
    ['Video X', '16'],
    ['Video Y', '80'],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).blur();
  }
  await expect(page.getByLabel('Video height', { exact: true })).toHaveValue('90');
  const bounds = (await page.locator('video').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 + 15, {
    steps: 4,
  });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.getByLabel('Video X', { exact: true }).inputValue()))
    .toBeGreaterThan(16);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Video X', { exact: true })).toHaveValue('16');
  const resize = (await page.getByRole('button', { name: 'Resize video se' }).boundingBox())!;
  await page.mouse.move(resize.x + 5, resize.y + 5);
  await page.mouse.down();
  await page.mouse.move(resize.x + 35, resize.y + 20, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.getByLabel('Video width', { exact: true }).inputValue()))
    .toBeGreaterThan(160);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Video width', { exact: true })).toHaveValue('160');
  for (const [label, value] of [
    ['Range start', '00:00:01.000'],
    ['Range end', '00:00:04.000'],
  ]) {
    await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel(label, { exact: true }).blur();
  }
  const timeline = (await page.locator('.timeline-track-content').boundingBox())!;
  await page.mouse.click(timeline.x + (timeline.width * 1.25) / 6, timeline.y + 18);
  await page.getByRole('button', { name: 'Zoom in timeline' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /GIF Looping/ }).click();
  await page.getByLabel('GIF frame rate').selectOption('15');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  const projects = await (await page.request.get('/api/projects')).json();
  const document = await (
    await page.request.get(
      `/api/projects/${projects.find((project: { name: string }) => project.name === name).id}`,
    )
  ).json();
  expect(document.view.playhead).toBeCloseTo(1.25, 2);
  await page.reload();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(name);
  await page.getByRole('tab', { name: 'Canvas & video' }).click();
  await expect(page.getByLabel('Canvas width')).toHaveValue('320');
  await expect(page.getByLabel('Video X', { exact: true })).toHaveValue('16');
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:04.000');
  await expect(page.locator('.zoom-controls')).toContainText('150%');
  await expect(page.locator('.timecode')).toContainText('00:00:01.250');
  await expect(page.locator('.subtitle-overlay')).toHaveText('Saved caption');
  await expect(page.locator('.subtitle-overlay')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('saved-canvas-project.png') });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('GIF frame rate')).toHaveValue('15');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const assetCount = (await (await page.request.get('/api/media')).json()).length;
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(`${name} copy`);
  expect((await (await page.request.get('/api/media')).json()).length).toBe(assetCount);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open your video' })).toBeVisible();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: /Existing videos/ }).click();
  await page.locator('.library-item').filter({ hasText: document.mediaId }).click();
  await expect(page.getByText('Ready to edit')).toBeVisible();
  expect((await (await page.request.get('/api/media')).json()).length).toBe(assetCount);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: /Saved projects/ }).click();
  await page
    .locator('.library-item')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(name);
  await expect(page.getByLabel('Video Y', { exact: true })).toHaveValue('80');
  expect(errors).toEqual([]);
});

test('a failed autosave keeps a recoverable draft through reload', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({ status: 503, json: { error: 'Temporary disk error' } });
    else await route.continue();
  });
  await page.getByRole('tab', { name: 'Canvas & video' }).click();
  await page.getByLabel('Video X', { exact: true }).fill('42');
  await page.getByLabel('Video X', { exact: true }).blur();
  await expect(page.getByText('Save failed · Retry Save', { exact: true })).toBeVisible();
  await page.unroute('**/api/projects/*');
  await page.reload();
  await page.getByRole('tab', { name: 'Canvas & video' }).click();
  await expect(page.getByLabel('Video X', { exact: true })).toHaveValue('42');
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
});

test('edits made while a save is in flight are retained and saved next', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  let release!: () => void;
  let observed!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    observed = resolve;
  });
  let held = false;
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PUT' && !held) {
      held = true;
      observed();
      await blocked;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await started;
  await page.getByLabel('Project name', { exact: true }).fill('Renamed during save');
  await page.getByLabel('Project name', { exact: true }).blur();
  await page
    .getByRole('button', { name: 'Add subtitle', description: 'Add subtitle at playhead' })
    .click();
  await page.getByLabel('Subtitle 1 text').fill('Edited during save');
  await page.getByLabel('Subtitle 1 text').blur();
  release();
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Renamed during save');
  await page.reload();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Renamed during save');
  await expect(page.getByLabel('Subtitle 1 text')).toHaveValue('Edited during save');
});

test('first project save captures an existing editor recovery snapshot', async ({ page }) => {
  const response = await page.request.post('/api/media', {
    multipart: {
      video: { name: 'legacy.mp4', mimeType: 'video/mp4', buffer: await readFile(videoPath) },
    },
  });
  const media = await response.json();
  await page.addInitScript((asset) => {
    localStorage.setItem(
      'framecut:legacy-project-recovery',
      JSON.stringify({
        media: asset,
        project: {
          clips: [{ id: 'old-cut', sourceStart: 2, sourceEnd: 5 }],
          cues: [{ id: 'old-cue', start: 0.5, end: 2, text: 'Existing edits' }],
        },
        range: { start: 0.25, end: 2.5 },
        playhead: 1,
      }),
    );
  }, media);
  await page.goto('/');
  await expect(page.getByLabel('Subtitle 1 text')).toHaveValue('Existing edits');
  await expect(page.getByLabel('Range end', { exact: true })).toHaveValue('00:00:02.500');
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  const saved = (await (await page.request.get('/api/projects')).json()).find(
    (project: { mediaId: string }) => project.mediaId === media.id,
  );
  const document = await (await page.request.get(`/api/projects/${saved.id}`)).json();
  expect(document.project.clips[0].sourceStart).toBe(2);
  expect(document.project.clips[0].sourceEnd).toBe(5);
  expect(document.project.cues[0].text).toBe('Existing edits');
});

test('320px GIF subtitle controls preview real Chinese captions and persist in the project', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Choose video file').setInputFiles(videoPath);
  await expect(page.getByText('Ready to edit')).toBeVisible();
  await page.getByLabel('Choose SRT file').setInputFiles({
    name: 'chinese.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from(
      '1\n00:00:00,500 --> 00:00:02,000\n這是繁體中文字幕\n\n2\n00:00:02,500 --> 00:00:04,000\n另一句字幕\n',
    ),
  });
  await expect(page.getByLabel('Subtitle 2 text')).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /GIF Looping/ }).click();
  await page.getByLabel('GIF width').selectOption('320');
  await page.getByRole('switch', { name: 'Burn in subtitles' }).check();
  await expect(page.getByLabel('GIF subtitle size')).toHaveValue('18');
  await page.getByLabel('GIF subtitle font').selectOption('traditional');
  await page.getByLabel('GIF subtitle position').selectOption('top');
  await page.getByLabel('GIF subtitle size').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('GIF subtitle size')).toHaveValue('22');
  await page.getByLabel('GIF subtitle margin').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.getByLabel('GIF subtitle outline').selectOption('3');
  await page.getByLabel('GIF subtitle background').check();
  await page.getByLabel('Subtitle to preview').selectOption({ label: '00:00:02.500 · 另一句字幕' });
  const image = page.getByAltText('GIF output preview with the selected subtitle');
  await expect(image).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBe(320);
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalHeight))
    .toBe(180);
  await page.screenshot({ path: testInfo.outputPath('gif-subtitle-preview.png') });
  await page.getByRole('button', { name: 'Export GIF', exact: true }).click();
  await expect(page.getByText('Export complete. Your file is ready.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('GIF width')).toHaveValue('320');
  await expect(page.getByLabel('GIF subtitle size')).toHaveValue('22');
  await expect(page.getByLabel('GIF subtitle font')).toHaveValue('traditional');
  await expect(page.getByLabel('GIF subtitle position')).toHaveValue('top');
  await expect(page.getByLabel('GIF subtitle margin')).toHaveValue('6');
  await expect(page.getByLabel('GIF subtitle outline')).toHaveValue('3');
  await expect(page.getByLabel('GIF subtitle background')).toBeChecked();
});
