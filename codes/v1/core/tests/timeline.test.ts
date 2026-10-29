import test from 'node:test';
import assert from 'node:assert/strict';
import { cropSubtitles, parseSrt, serializeSrt } from '../shared/subtitles.utils';
import { formatTime, parseTime } from '../shared/time.utils';
import {
  removeTimelineRange,
  selectSourceSegments,
  splitClip,
  timelineDuration,
  timelineToSource,
} from '../shared/timeline.utils';
import type { Project } from '../shared/editor.types';
import { fitVideoLayout, originalCanvas, validateComposition } from '../shared/composition.utils';

test('composition fits, fills and centers a landscape source inside a portrait canvas', () => {
  const source = { width: 1920, height: 1080 };
  const canvas = { width: 1080, height: 1920, background: '#000000' };
  const fitted = fitVideoLayout(source, canvas);
  assert.deepEqual(fitted, { width: 1080, height: 608, x: 0, y: 656, aspectLocked: true });
  const filled = fitVideoLayout(source, canvas, 'fill');
  assert.equal(filled.height, 1920);
  assert.ok(filled.x < 0);
  validateComposition(canvas, filled);
  assert.equal(originalCanvas({ width: 319, height: 179 }).width, 320);
  assert.throws(() => validateComposition({ ...canvas, width: 1079 }, fitted), /even/);
  const project: Project = {
    clips: [{ id: 'a', sourceStart: 0, sourceEnd: 3 }],
    cues: [],
    canvas,
    video: fitted,
  };
  const edited = removeTimelineRange(project, { start: 1, end: 2 });
  assert.deepEqual(edited.canvas, canvas);
  assert.deepEqual(edited.video, fitted);
});

test('SRT handles BOM, CRLF, multiline text and millisecond round trips', () => {
  const cues = parseSrt(
    '\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\nHello\r\nworld\r\n\r\n2\r\n00:00:04,001 --> 00:00:05,999\r\nNext\r\n',
  );
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello\nworld');
  assert.equal(cues[0].start, 1.25);
  assert.deepEqual(
    parseSrt(serializeSrt(cues)).map(({ id: _id, ...cue }) => cue),
    cues.map(({ id: _id, ...cue }) => cue),
  );
  assert.throws(() => parseSrt('1\n00:00:03,000 --> 00:00:01,000\nWrong'), /invalid timing/);
  assert.throws(() => parseSrt(''), /empty/);
});

test('time formatting carries milliseconds across minute and hour boundaries', () => {
  assert.equal(formatTime(59.9996, true), '00:01:00.000');
  assert.equal(formatTime(3600.125, true), '01:00:00.125');
  assert.equal(parseTime('01:02:03,456'), 3723.456);
  assert.equal(parseTime('00:61:00'), null);
  assert.equal(parseTime('1:02.5'), 62.5);
});

test('split preserves duration and source mapping across a deleted gap', () => {
  const clips = [
    { id: 'a', sourceStart: 0, sourceEnd: 4 },
    { id: 'b', sourceStart: 8, sourceEnd: 10 },
  ];
  const split = splitClip(clips, 2.5);
  assert.equal(split.length, 3);
  assert.equal(timelineDuration(split), 6);
  assert.equal(timelineToSource(split, 4)?.sourceTime, 8);
  assert.equal(timelineToSource(split, 5.5)?.sourceTime, 9.5);
  assert.equal(splitClip(clips, 4).length, 2);
});

test('ripple deletion retimes crossing subtitles and removes fully deleted cues', () => {
  const project: Project = {
    clips: [{ id: 'a', sourceStart: 0, sourceEnd: 10 }],
    cues: [
      { id: 'before', start: 0, end: 1, text: 'Before' },
      { id: 'across', start: 1, end: 7, text: 'Across' },
      { id: 'inside', start: 3, end: 4, text: 'Removed' },
      { id: 'after', start: 7, end: 9, text: 'After' },
    ],
  };
  const edited = removeTimelineRange(project, { start: 2, end: 5 });
  assert.equal(timelineDuration(edited.clips), 7);
  assert.deepEqual(
    edited.clips.map((clip) => [clip.sourceStart, clip.sourceEnd]),
    [
      [0, 2],
      [5, 10],
    ],
  );
  assert.deepEqual(
    edited.cues.map((cue) => [cue.id, cue.start, cue.end]),
    [
      ['before', 0, 1],
      ['across', 1, 4],
      ['after', 4, 6],
    ],
  );
  assert.equal(project.clips[0].sourceEnd, 10);
});

test('range export intersects edited segments and shifts clipped subtitles to zero', () => {
  const clips = [
    { id: 'a', sourceStart: 0, sourceEnd: 2 },
    { id: 'b', sourceStart: 4, sourceEnd: 6 },
  ];
  assert.deepEqual(
    selectSourceSegments(clips, { start: 1, end: 3 }).map((clip) => [
      clip.sourceStart,
      clip.sourceEnd,
    ]),
    [
      [1, 2],
      [4, 5],
    ],
  );
  const cues = [
    { id: 'a', start: 0.5, end: 2.5, text: 'Crossing' },
    { id: 'b', start: 3, end: 4, text: 'Outside' },
  ];
  assert.deepEqual(
    cropSubtitles(cues, { start: 1, end: 3 }).map((cue) => [cue.start, cue.end]),
    [[0, 1.5]],
  );
});
