# Framecut

A local video and subtitle editor built with Vite, React, shadcn-style components, and Express. The application fills the browser window; use the header's fullscreen button to hide browser chrome.

## Run

Requires Node.js 22.12+ and Python 3.11+; Node.js 24 was used for verification.

```sh
cd codes/v1/core
npm ci
~/.common-venv/python3.12/bin/python3 -m pip install -e "../services/yt-dlp[default]"
npm run dev
```

Open **http://localhost:5533**. The Express server hosts Vite during development, so a second server is unnecessary.
The Python install makes the local `codes/v1/services/yt-dlp` source available with its default extractor dependencies. Copy `.env.example` to `.env` and set `YT_DLP_PYTHON` to that same Python executable. The app enables its running Node.js binary as yt-dlp's JavaScript runtime for YouTube challenge solving. The server loads `.env` for both development and production; `~` at the start of configured paths is expanded to your home directory. Environment variables already set by your shell take precedence.
The development watcher excludes generated `.data`, `dist`, and `test-results` files so downloads and exports do not restart the server. Restart the dev server manually after changing `.env`.

To use a private yt-dlp Netscape-format cookies file for sites that require your authenticated session, keep the file outside the project and restrict its permissions:

```sh
mkdir -p ~/.config/framecut
chmod 700 ~/.config/framecut
chmod 600 ~/.config/framecut/youtube-cookies.txt
```

Set `YT_DLP_COOKIES=~/.config/framecut/youtube-cookies.txt` in `.env`. The server expands `~` and passes the path to yt-dlp with `--cookies`. Do not paste cookie contents into `.env`, commit the cookie file, or share it; cookies can grant access to your account.

For a production build served by Express:

```sh
npm run build
npm start
```

FFmpeg and FFprobe binaries are installed as dependencies. The FFmpeg build includes libass for subtitle rendering. Installation needs network access to download the binary for your platform. The package manifest allows the `ffmpeg-static` and `esbuild` install scripts. If your npm configuration blocks them, run `npm rebuild ffmpeg-static esbuild` after enabling those scripts in your local npm configuration.

## Editing

- Open or drop one MP4/M4V video, up to 4 GB. Replacing it starts a new project.
- Import one video URL at a time through the local yt-dlp checkout. It prefers MP4/M4A formats, falls back to available formats when necessary, and transcodes the result to H.264/AAC MP4 for browser playback. Downloads are limited to 4 GB; playlists and DRM-protected media are not supported. An optional private Netscape-format cookie file can be configured for sites that require an authenticated session. Download and conversion progress, cancellation, and sanitized process output are available while importing.
- Click the timeline to seek. Click a video segment to select it.
- Split at the playhead; trim a selected segment's start or end to the playhead; delete selected segments. Deletions close gaps, shorten the timeline, and retime subtitles automatically.
- Import an SRT file, or add subtitles at the playhead. Edit text and start/end times in the subtitle panel. Imported timestamps refer to the current edited timeline. Cues outside that timeline are trimmed or removed.
- Undo and redo video and subtitle edits, with up to 100 history entries.
- Preview the edited sequence with subtitles, playback speed, mute, frame stepping, and actual video thumbnails.

## Projects and existing videos

Use **Projects** to reopen a saved project, or choose **Existing videos** to start a project from an upload/download already on disk. The existing video `ce75fa20-217b-4262-b382-8a2c383e9ed7` can be selected there without another upload or download.

Each project has its own editable name. **Save** (Cmd/Ctrl+S) saves immediately; autosave runs about 0.8 seconds after edits settle. **Duplicate** creates an independent edit sharing the original media. **New** saves the current project before clearing the workspace. Project switching also saves current edits first.

Saved projects include cuts, subtitle text/timing, export range, canvas, video placement, export preferences, playhead and timeline zoom. The last project reopens automatically. A browser-tab recovery draft preserves pending edits across refresh; if another tab saved a newer revision, recovered edits open as a separate recovered project instead of overwriting that revision. Concurrent stale saves report a conflict; **Duplicate** preserves that tab's edits as another project.

Projects are stored under `.data/projects/<project-id>/project.json`, with a schema version and revision number. Writes use a temporary file and atomic replacement. The ten most recent revisions are kept in `revisions/`; if the current JSON becomes unreadable, loading falls back to the latest readable snapshot. Sources remain in `.data/uploads` and are referenced by media ID. Back up the whole `.data` directory to preserve projects and their media together.

## Canvas and video layout

Open the **Canvas & video** tab beside the preview. Canvas presets include Original, Landscape 16:9, Portrait 9:16, Square 1:1, and Portrait 4:5. Custom canvas width/height must be even numbers from 16 to 8192, up to 32 megapixels. A background-color control fills unused space. Changing canvas dimensions refits the video; undo restores the previous composition.

Video controls include width, height, scale, X/Y coordinates, aspect-ratio lock, Fit, Fill, Center, Reset, and edge alignment. Coordinates are in canvas pixels from its top-left corner. **Fit** shows the whole video with background around it; **Fill** covers the canvas and crops overflow. Drag the preview video to move it; selecting it reveals corner handles for resizing. One drag is one undoable edit.

The layout applies to every segment of the video. Subtitles stay anchored to the canvas. The preview and FFmpeg exports use the same saved dimensions and position; MP4 renders the canvas dimensions, and GIF width scales the finished canvas while keeping its aspect ratio.

## Export a selected portion

Drag the two **Export range** handles or enter precise **Range start / end** times. You can also use **I** and **O** to mark the playhead as the in/out point.

Click **Export**, choose **Selected range** or **Entire edited timeline**, then choose:

- **MP4:** H.264 video at the saved canvas dimensions, 30 fps, and AAC audio if the source has audio.
- **GIF:** endlessly looping animation with 320/480/640/960 px width and 8/12/15/24 fps. Aspect ratio is preserved and smaller sources are not upscaled. GIF has no audio.
- **Burn in subtitles:** optionally render the edited subtitles into either output.

For GIFs, enabling burn-in reveals subtitle size, font, position, margin, outline, and an optional dark background. The size is measured in output pixels: the default is 18 px at 320 px width, scaling with the selected GIF width. Choose a subtitle in the export dialog to preview a frame rendered at the actual output dimensions; the preview appears before GIF palette reduction. Long text wraps within the frame, while explicit SRT line breaks remain in place. If a caption is too tall for the frame, reduce its size or shorten the text.

The **Traditional Chinese** font option uses PingFang HK on macOS, Microsoft JhengHei on Windows, or Noto Sans CJK TC on Linux, with system font fallback. The selected font or another font covering the required glyphs must be installed on the computer running the server. GIF subtitle settings save with the project; existing saved projects receive defaults when opened.

Export progress is shown in the dialog. Exports run one at a time; an active export can be cancelled. Click **Download** when ready. Closing the dialog lets an active export continue.

**Export SRT** in the subtitle panel uses the marked export range. It clips overlapping cues and shifts timestamps to zero, matching a video exported from the same range. Use **Reset** by the range fields for a full-timeline SRT.

## Keyboard shortcuts

| Shortcut                       | Action                        |
| ------------------------------ | ----------------------------- |
| Space                          | Play/pause                    |
| S                              | Split at playhead             |
| Delete / Backspace             | Delete selected video segment |
| I / O                          | Mark export range start/end   |
| Left / Right                   | Step 1/30 second              |
| Shift + Left / Right           | Step one second               |
| Cmd/Ctrl + Z                   | Undo                          |
| Cmd/Ctrl + Shift + Z, Ctrl + Y | Redo                          |

Text inputs retain their normal editing shortcuts. Focused range handles support arrow keys, with Shift for larger steps.

## Configuration and storage

| Environment variable | Default                           |
| -------------------- | --------------------------------- |
| `PORT`               | `5533`                            |
| `DATA_DIR`           | `codes/v1/core/.data`             |
| `FFMPEG_PATH`        | Installed `ffmpeg-static` binary  |
| `FFPROBE_PATH`       | Installed `ffprobe-static` binary |
| `YT_DLP_PYTHON`      | `python3` (`python` on Windows)   |
| `YT_DLP_COOKIES`     | Not set (optional cookies file)   |

The server binds to `127.0.0.1` and allows all CORS origins as requested. Video processing stays on this computer. Sources and exports remain in `.data` until you remove them; stop the server before clearing that directory. An export has a one-hour processing timeout, and the queue accepts up to ten pending/active exports.

Project edits persist on disk and reopen after refresh or restart. Undo/redo history is scoped to the open editing session. Export files and uploaded sources persist on disk, but export job records reset when the server restarts.

MP4/M4V containers can contain codecs that a browser cannot play. For reliable preview, use H.264 MP4. Unsupported preview codecs show a message; FFmpeg may still be able to export them. Subtitle preview uses plain text; burn-in uses FFmpeg's SRT rendering and available system fonts, so line wrapping and font appearance can differ.

## Validation

```sh
npm run build
npm test
npm run test:browser
```

The browser checks use installed Google Chrome and an isolated server on port 5534, with generated media under `test-results`. To use Playwright Chromium instead, remove `channel: 'chrome'` in `playwright.config.ts` and run `npx playwright install chromium`.

Unit tests cover SRT parsing/serialization, range cropping, time precision, splitting, and subtitle ripple edits. Integration tests generate real videos, verify export durations and actual output pixels, check audio and silent sources, render subtitles into MP4/GIF, and exercise cancellation and invalid inputs. Browser tests cover file imports, edits, cuts, trimming, playback across deleted sections, range handles, downloadable files, and small screens. Test screenshots are saved under `test-results`.

## Layout

- `client/components/editor`: preview, subtitles, timeline, and export interface.
- `client/components/ui`: shadcn-style Button, accessible Radix Dialog, and time inputs.
- `client/hooks`: playback, project history, import/edit actions, thumbnails, shortcuts, and export progress.
- `server/routes`: media upload/streaming and export APIs.
- `server/services`: probing, yt-dlp imports, validation, FFmpeg filter graphs, and job queues.
- `shared`: typed editor model, timeline operations, time conversion, and SRT handling.

Implementation references: [Vite integration](https://vite.dev/guide/backend-integration.html), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite), and [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html).
