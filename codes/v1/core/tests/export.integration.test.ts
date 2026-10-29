import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { ffmpegPath, ffprobePath, appRoot } from '../server/config';
import type { ExportJob, ExportRequest, MediaAsset, ProjectDocument } from '../shared/editor.types';
import { defaultExportSettings } from '../shared/editor.types';

const execute = promisify(execFile);

test(
  'real FFmpeg upload, range exports, audio, GIF and burned subtitles',
  { timeout: 90_000 },
  async (t) => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'framecut-test-'));
    const listener = createServer();
    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    let log = '';
    const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production'], {
      cwd: appRoot,
      env: { ...process.env, PORT: String(port), DATA_DIR: path.join(temporary, '.data') },
    });
    server.stdout.on('data', (chunk) => {
      log += chunk;
    });
    server.stderr.on('data', (chunk) => {
      log += chunk;
    });
    t.after(async () => {
      const stopped = new Promise((resolve) => server.once('exit', resolve));
      server.kill('SIGTERM');
      await Promise.race([stopped, delay(3000)]);
      await rm(temporary, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* Wait for the child to listen. */
      }
      await delay(100);
    }
    assert.ok(ready, log);
    const sourcePath = path.join(temporary, 'source.mp4');
    await execute(ffmpegPath, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      "color=red:s=320x180:r=30:d=6,drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='between(t,2,4)',drawbox=x=0:y=0:w=iw:h=ih:color=green:t=fill:enable='gte(t,4)'",
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=6',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      sourcePath,
    ]);
    async function upload(filePath: string, filename = 'sample.mp4') {
      const form = new FormData();
      form.append('video', new Blob([await readFile(filePath)]), filename);
      const response = await fetch(`${base}/api/media`, { method: 'POST', body: form });
      assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
      return (await response.json()) as MediaAsset;
    }
    const media = await upload(sourcePath);
    assert.equal(media.hasAudio, true);
    assert.equal(media.width, 320);
    const request: ExportRequest = {
      mediaId: media.id,
      clips: [
        { id: 'a', sourceStart: 0, sourceEnd: 2 },
        { id: 'b', sourceStart: 4, sourceEnd: 6 },
      ],
      cues: [{ id: 'caption', start: 0, end: 4, text: 'Hello 世界\nSubtitle test' }],
      range: { start: 1, end: 3 },
      format: 'mp4',
      burnSubtitles: false,
      gifWidth: 320,
      gifFps: 12,
    };
    async function exportFile(body: ExportRequest, name: string) {
      const response = await fetch(`${base}/api/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 202, JSON.stringify(await response.clone().json()));
      let job = (await response.json()) as ExportJob;
      for (
        let attempt = 0;
        attempt < 200 && ['processing', 'queued'].includes(job.status);
        attempt++
      ) {
        await delay(100);
        job = await (await fetch(`${base}/api/exports/${job.id}`)).json();
      }
      assert.equal(job.status, 'complete', `${job.error}\n${log}`);
      const download = await fetch(`${base}${job.downloadUrl}`);
      assert.equal(download.status, 200);
      const output = path.join(temporary, name);
      await writeFile(output, Buffer.from(await download.arrayBuffer()));
      return output;
    }
    async function probe(file: string) {
      return JSON.parse(
        (
          await execute(ffprobePath, [
            '-v',
            'error',
            '-show_format',
            '-show_streams',
            '-of',
            'json',
            file,
          ])
        ).stdout,
      );
    }
    async function rgbAt(file: string, time: number, size = '1:1') {
      return (
        await execute(
          ffmpegPath,
          [
            '-v',
            'error',
            '-ss',
            String(time),
            '-i',
            file,
            '-frames:v',
            '1',
            '-vf',
            `scale=${size}`,
            '-pix_fmt',
            'rgb24',
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          { encoding: 'buffer', maxBuffer: 5_000_000 },
        )
      ).stdout;
    }
    let cleanFile: string;
    await t.test(
      'projects round-trip edits, detect stale writes and recover from a damaged current file',
      async () => {
        const draft: ProjectDocument = {
          schemaVersion: 1,
          id: '',
          name: 'Portrait edit',
          mediaId: media.id,
          revision: 0,
          createdAt: '',
          updatedAt: '',
          project: {
            clips: request.clips,
            cues: request.cues,
            canvas: { width: 320, height: 320, background: '#123456' },
            video: { x: 16, y: 80, width: 160, height: 90, aspectLocked: true },
          },
          range: request.range,
          exportSettings: defaultExportSettings,
          view: { playhead: 1.5, zoom: 2 },
        };
        const created = await fetch(`${base}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        assert.equal(created.status, 201);
        const saved = (await created.json()) as ProjectDocument;
        assert.equal(saved.revision, 1);
        assert.deepEqual(saved.project, draft.project);
        const loaded = await (await fetch(`${base}/api/projects/${saved.id}`)).json();
        assert.deepEqual(loaded, saved);
        assert.equal(loaded.view.playhead, 1.5);
        const responses = await Promise.all(
          ['First writer', 'Second writer'].map((name) =>
            fetch(`${base}/api/projects/${saved.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...saved, name }),
            }),
          ),
        );
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        const winner = (await responses
          .find((response) => response.status === 200)!
          .json()) as ProjectDocument;
        await writeFile(
          path.join(temporary, '.data', 'projects', saved.id, 'project.json'),
          '{ damaged',
        );
        const recovered = await (await fetch(`${base}/api/projects/${saved.id}`)).json();
        assert.equal(recovered.revision, 2);
        assert.equal(recovered.name, winner.name);
        const duplicate = await fetch(`${base}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...winner, id: '', revision: 0, name: 'Copy' }),
        });
        const copy = await duplicate.json();
        assert.notEqual(copy.id, saved.id);
        assert.equal(copy.mediaId, media.id);
        const assetList = await (await fetch(`${base}/api/media`)).json();
        assert.equal(assetList.length, 1);
        assert.equal(assetList[0].filePath, undefined);
        assert.equal((await (await fetch(`${base}/api/projects`)).json()).length, 2);
        const { gifSubtitle: _oldStyle, ...legacySettings } = defaultExportSettings;
        const legacy = await fetch(`${base}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, exportSettings: legacySettings }),
        });
        assert.equal(legacy.status, 201);
        assert.equal((await legacy.json()).exportSettings.gifSubtitle.fontSize, 36);
      },
    );
    await t.test('selected MP4 has correct duration, cuts, colors and audio', async () => {
      cleanFile = await exportFile(request, 'clean.mp4');
      const output = await probe(cleanFile);
      assert.ok(Math.abs(Number(output.format.duration) - 2) < 0.15);
      assert.ok(
        output.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'),
      );
      const first = await rgbAt(cleanFile, 0.3);
      const second = await rgbAt(cleanFile, 1.3);
      assert.ok(
        first[0] > first[1] * 2 && first[0] > first[2] * 2,
        `Expected red, got ${[...first]}`,
      );
      assert.ok(
        second[1] > second[0] * 2 && second[1] > second[2] * 2,
        `Expected green, got ${[...second]}`,
      );
    });
    await t.test('MP4 requests without GIF settings remain compatible', async () => {
      const { gifWidth: _width, gifFps: _fps, ...legacyRequest } = request;
      const output = await exportFile(legacyRequest as ExportRequest, 'legacy-mp4.mp4');
      assert.ok(Math.abs(Number((await probe(output)).format.duration) - 2) < 0.15);
    });
    await t.test('burned subtitles actually change rendered video pixels', async () => {
      const burned = await exportFile({ ...request, burnSubtitles: true }, 'burned.mp4');
      const plainPixels = await rgbAt(cleanFile, 0.3, '320:180');
      const burnedPixels = await rgbAt(burned, 0.3, '320:180');
      let changed = 0;
      for (let pixel = 0; pixel < plainPixels.length; pixel++)
        if (Math.abs(plainPixels[pixel] - burnedPixels[pixel]) > 30) changed++;
      assert.ok(changed > 300, `Only ${changed} pixels changed.`);
    });
    await t.test(
      'MP4 and GIF render canvas dimensions, background, video placement and canvas-fixed subtitles',
      async () => {
        const composition = {
          canvas: { width: 320, height: 320, background: '#0000ff' },
          video: { x: 16, y: 80, width: 160, height: 90, aspectLocked: true },
        };
        for (const format of ['mp4', 'gif'] as const) {
          const file = await exportFile(
            { ...request, ...composition, format, burnSubtitles: true },
            `canvas.${format}`,
          );
          const output = await probe(file);
          assert.equal(output.streams[0].width, 320);
          assert.equal(output.streams[0].height, 320);
          const pixels = await rgbAt(file, 0.3, '320:320');
          const pixel = (x: number, y: number) => [
            ...pixels.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3),
          ];
          const background = pixel(8, 8);
          const video = pixel(40, 100);
          assert.ok(
            background[2] > 200 && background[0] < 50,
            `Expected blue canvas: ${background}`,
          );
          assert.ok(video[0] > 200 && video[2] < 50, `Expected red placed video: ${video}`);
          let whiteBelowVideo = 0;
          for (let y = 220; y < 315; y++)
            for (let x = 0; x < 320; x++) {
              const color = pixel(x, y);
              if (color.every((channel) => channel > 180)) whiteBelowVideo++;
            }
          assert.ok(
            whiteBelowVideo > 50,
            `Expected canvas-fixed caption pixels below video, got ${whiteBelowVideo}`,
          );
        }
        const cropped = await exportFile(
          {
            ...request,
            canvas: { width: 320, height: 180, background: '#ffffff' },
            video: { x: -160, y: -90, width: 640, height: 360, aspectLocked: true },
          },
          'cropped.mp4',
        );
        assert.ok((await rgbAt(cropped, 0.3))[0] > 200);
      },
    );
    await t.test(
      'GIF has selected duration, requested dimensions, frames and no audio',
      async () => {
        const gif = await exportFile(
          { ...request, format: 'gif', burnSubtitles: true },
          'selected.gif',
        );
        const output = await probe(gif);
        assert.equal(output.streams[0].codec_name, 'gif');
        assert.equal(output.streams[0].width, 320);
        assert.equal(Number(output.streams[0].nb_frames), 24);
        assert.ok(Math.abs(Number(output.format.duration) - 2) < 0.15);
        assert.equal(output.streams.length, 1);
      },
    );
    await t.test(
      '320px GIF subtitles use output-pixel sizing, Chinese font, position and actual-frame preview',
      async () => {
        const style = {
          fontSize: 18,
          font: 'traditional' as const,
          position: 'top' as const,
          margin: 8,
          outline: 2,
          background: false,
        };
        const gifRequest = {
          ...request,
          format: 'gif' as const,
          burnSubtitles: true,
          gifSubtitle: style,
          cues: [{ id: 'chinese', start: 0, end: 4, text: '這是可讀的繁體中文字幕' }],
        };
        const small = await exportFile(gifRequest, 'chinese-18.gif');
        const large = await exportFile(
          { ...gifRequest, gifSubtitle: { ...style, fontSize: 32 } },
          'chinese-32.gif',
        );
        async function bounds(file: string, time = 0.5) {
          const pixels = await rgbAt(file, time, '320:180');
          const points: [number, number][] = [];
          for (let y = 0; y < 180; y++)
            for (let x = 0; x < 320; x++) {
              const index = (y * 320 + x) * 3;
              if (pixels[index] > 185 && pixels[index + 1] > 185 && pixels[index + 2] > 185)
                points.push([x, y]);
            }
          assert.ok(points.length > 50, 'Expected visible Chinese subtitle glyphs.');
          return {
            top: Math.min(...points.map((point) => point[1])),
            bottom: Math.max(...points.map((point) => point[1])),
            pixels,
          };
        }
        const smallBounds = await bounds(small);
        const largeBounds = await bounds(large);
        assert.ok(smallBounds.top < 35, `Expected text at the top, got ${smallBounds.top}`);
        assert.ok(
          largeBounds.bottom - largeBounds.top > (smallBounds.bottom - smallBounds.top) * 1.25,
          `Expected 32px text to render larger than 18px.`,
        );
        const preview = await fetch(`${base}/api/exports/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...gifRequest, previewTime: 1.5 }),
        });
        assert.equal(preview.status, 200, await preview.clone().text());
        assert.equal(preview.headers.get('content-type'), 'image/png');
        const previewPath = path.join(temporary, 'preview.png');
        await writeFile(previewPath, Buffer.from(await preview.arrayBuffer()));
        const previewBounds = await bounds(previewPath, 0);
        assert.ok(Math.abs(previewBounds.top - smallBounds.top) <= 1);
        assert.ok(Math.abs(previewBounds.bottom - smallBounds.bottom) <= 1);
        let pixelDifference = 0;
        for (let index = 0; index < smallBounds.pixels.length; index++)
          pixelDifference += Math.abs(smallBounds.pixels[index] - previewBounds.pixels[index]);
        assert.ok(
          pixelDifference / smallBounds.pixels.length < 8,
          `Preview differs from GIF by ${pixelDifference / smallBounds.pixels.length} per channel`,
        );
        const glyphPixels: Buffer[] = [];
        for (const character of ['中', '文']) {
          const frame = await fetch(`${base}/api/exports/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...gifRequest,
              cues: [{ id: 'one', start: 0, end: 4, text: character }],
              previewTime: 1.5,
            }),
          });
          assert.equal(frame.status, 200);
          const framePath = path.join(temporary, `${character}.png`);
          await writeFile(framePath, Buffer.from(await frame.arrayBuffer()));
          glyphPixels.push(await rgbAt(framePath, 0, '320:180'));
        }
        let glyphDifferences = 0;
        for (let index = 0; index < glyphPixels[0].length; index++)
          if (Math.abs(glyphPixels[0][index] - glyphPixels[1][index]) > 40) glyphDifferences++;
        assert.ok(
          glyphDifferences > 100,
          `Chinese characters should render as distinct glyphs, got ${glyphDifferences} differing channels.`,
        );
        const later = await fetch(`${base}/api/exports/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...gifRequest, previewTime: 2.5 }),
        });
        assert.equal(later.status, 200);
        const laterPath = path.join(temporary, 'after-cut.png');
        await writeFile(laterPath, Buffer.from(await later.arrayBuffer()));
        const afterCut = await rgbAt(laterPath, 0, '1:1');
        assert.ok(
          afterCut[1] > afterCut[0] * 2,
          `Preview should show green source after the cut, got ${[...afterCut]}`,
        );
      },
    );
    await t.test(
      'Chinese subtitles wrap at GIF width and optional background darkens the area behind text',
      async () => {
        const text = '這是一個很長的繁體中文字幕需要自動換行保持畫面完整';
        const style = {
          fontSize: 18,
          font: 'traditional' as const,
          position: 'top' as const,
          margin: 8,
          outline: 2,
          background: false,
        };
        const gifRequest = {
          ...request,
          format: 'gif' as const,
          burnSubtitles: true,
          gifSubtitle: style,
          cues: [{ id: 'chinese', start: 0, end: 4, text }],
        };
        const plain = await exportFile(gifRequest, 'wrapped.gif');
        const boxed = await exportFile(
          { ...gifRequest, gifSubtitle: { ...style, background: true } },
          'wrapped-box.gif',
        );
        const plainPixels = await rgbAt(plain, 0.5, '320:180');
        const boxedPixels = await rgbAt(boxed, 0.5, '320:180');
        const whiteCoordinates: [number, number][] = [];
        let changedPixels = 0;
        for (let y = 0; y < 100; y++)
          for (let x = 0; x < 320; x++) {
            const index = (y * 320 + x) * 3;
            if (
              plainPixels[index] > 185 &&
              plainPixels[index + 1] > 185 &&
              plainPixels[index + 2] > 185
            )
              whiteCoordinates.push([x, y]);
            if (Math.abs(plainPixels[index] - boxedPixels[index]) > 35) changedPixels++;
          }
        assert.ok(whiteCoordinates.length > 100);
        assert.ok(
          Math.max(...whiteCoordinates.map((point) => point[1])) -
            Math.min(...whiteCoordinates.map((point) => point[1])) >
            20,
          'Expected multiple lines.',
        );
        assert.ok(
          Math.min(...whiteCoordinates.map((point) => point[0])) >= 10 &&
            Math.max(...whiteCoordinates.map((point) => point[0])) < 310,
          'Expected wrapped text inside side margins.',
        );
        assert.ok(
          changedPixels > 100,
          `Expected a visible dark background, got ${changedPixels} changed pixels.`,
        );
      },
    );
    await t.test('silent M4V exports without requiring an audio stream', async () => {
      const silent = path.join(temporary, 'silent.m4v');
      await execute(ffmpegPath, ['-v', 'error', '-i', sourcePath, '-an', '-c:v', 'copy', silent]);
      const silentMedia = await upload(silent, 'silent.m4v');
      assert.equal(silentMedia.hasAudio, false);
      const file = await exportFile({ ...request, mediaId: silentMedia.id }, 'silent-export.mp4');
      assert.equal((await probe(file)).streams.length, 1);
    });
    await t.test(
      'burn-in remains valid when selected range contains no subtitle cues',
      async () => {
        for (const format of ['mp4', 'gif'] as const) {
          const file = await exportFile(
            {
              ...request,
              format,
              burnSubtitles: true,
              cues: [{ id: 'outside', start: 0, end: 0.5, text: 'Outside selection' }],
            },
            `no-cues.${format}`,
          );
          assert.ok(Math.abs(Number((await probe(file)).format.duration) - 2) < 0.15);
        }
      },
    );
    await t.test('API supports range requests and requested CORS policy', async () => {
      const response = await fetch(`${base}${media.url}`, {
        headers: { Range: 'bytes=0-127', Origin: 'http://example.test' },
      });
      assert.equal(response.status, 206);
      assert.equal((await response.arrayBuffer()).byteLength, 128);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
    });
    await t.test('invalid range and malformed uploads return readable failures', async () => {
      const invalid = await fetch(`${base}/api/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, range: { start: 3, end: 8 } }),
      });
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /export range/);
      const shortGif = await fetch(`${base}/api/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          format: 'gif',
          gifFps: 8,
          range: { start: 0, end: 0.05 },
        }),
      });
      assert.equal(shortGif.status, 400);
      assert.match((await shortGif.json()).error, /at least 0.125 seconds/);
      const form = new FormData();
      form.append('video', new Blob(['invalid media']), 'broken.mp4');
      const broken = await fetch(`${base}/api/media`, { method: 'POST', body: form });
      assert.equal(broken.status, 400);
    });
    await t.test('an active export can be cancelled', async () => {
      const clips = Array.from({ length: 100 }, (_, index) => ({
        id: String(index),
        sourceStart: 0,
        sourceEnd: 6,
      }));
      const response = await fetch(`${base}/api/exports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, clips, range: { start: 0, end: 600 } }),
      });
      assert.equal(response.status, 202);
      const job = (await response.json()) as ExportJob;
      assert.equal(
        (await fetch(`${base}/api/exports/${job.id}`, { method: 'DELETE' })).status,
        204,
      );
      assert.equal(
        (await (await fetch(`${base}/api/exports/${job.id}`)).json()).status,
        'cancelled',
      );
    });
  },
);
