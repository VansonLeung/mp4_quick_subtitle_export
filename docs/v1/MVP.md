# V1 implementation

Implementation: `codes/v1/core`.

## Accepted scope

- Vite, React, and shadcn-style UI components.
- Node/Express server serving the Vite build on port **5533**, with all CORS origins allowed.
- Browser-filling editor with no promotional sections.
- Import MP4/M4V video; preview with subtitles and an editable timeline.
- Import one video URL at a time through the local `codes/v1/services/yt-dlp` checkout, with progress and cancellation; optional private Netscape-format cookie file; no playlists or DRM.
- Split, trim, and delete video segments, with subtitle timing adjusted after cuts.
- Import SRT, edit subtitle text/timing, add/delete cues, and export SRT.
- Export edited MP4 with optional burned-in subtitles using local FFmpeg.
- **Additional confirmed scope:** select an edited time range and export only that portion as **MP4 or GIF**, with optional burned-in subtitles.
- Named projects with manual saving, autosave, reopening, duplication, atomic disk storage, ten recovery snapshots, and an existing-media picker.
- Canvas presets/custom size/background, plus one shared video layout with dimensions, position, aspect locking, fit/fill, alignment, and preview drag/resize controls. Subtitles are anchored to the canvas.

## Available controls

- Video preview with play/pause, mute, playback speed, subtitle visibility, and start/end navigation.
- Video and subtitle timeline tracks, source thumbnails, a draggable playhead, and timeline zoom.
- Segment selection, split at playhead, trim start/end to playhead, deletion, undo, and redo.
- Searchable subtitle cards with editable text and millisecond timestamps.
- Export-range handles and precise in/out time inputs; I/O keys set range marks.
- MP4/GIF export dialog with selected-range or whole-timeline scope, burn-in toggle, progress, cancellation, and download.
- GIF width and frame-rate settings.
- GIF subtitle output-pixel size, font, top/center/bottom position and margin, outline, optional background, and rendered-frame preview. Defaults scale to 18 px at 320 px width.
- Browser fullscreen control and a compact layout for small screens.

SRT exports follow the selected range and shift timestamps to zero. Reset the range for a full-timeline SRT. Video cuts close gaps and retime subtitles.

## Start

```sh
cd codes/v1/core
npm ci
npm run dev
```

Open **http://localhost:5533**. For production, run `npm run build` followed by `npm start`.

Run `npm test` for timeline/SRT and real FFmpeg integration checks, and `npm run test:browser` for Chrome checks. See `codes/v1/core/README.md` for shortcuts, export details, configuration, and test coverage.

## Current boundaries

- One imported video and one video track; multiple segments from that video.
- MP4 export uses H.264 at 30 fps and AAC audio, when available. GIF is silent.
- Browser preview depends on source codec support; H.264 MP4 is recommended for preview.
- Projects, sources, and rendered outputs remain in local `.data` storage. Projects restore after refresh and restart; undo history resets when a project is reopened. Browser recovery drafts protect pending edits on refresh.
- Canvas and video layout are shared by all segments. Per-segment transforms and animated movement are not included.
- Exports are processed sequentially. Job status is held in server memory and resets on restart.
