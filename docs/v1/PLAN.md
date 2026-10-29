frontend:
vite
react
shadcn

backend:
node
express
vite dist build server host
port: 5533
cors enabled
allow all origins

code practice:
separation of concerns
short code files
separate / group code files into (sub-)folders
specify code filenames with code type/nature
modularization
verbose function names and parameters
but yet --- simple, polished and clean codes with a few comments in between the codes

features:

- it is a tool app / web app / platform
- browser-fullscreen web app interface
- do not have promotional text / remove
- core features - video editor:
  - pick MP4 / M4V files
  - import / export SRT files
  - timeline editor with preview screen
  - editor shall be able to edit the video and subtitles

raise clarifications and suggestions before you start implementation

confirmed v1 scope:

- trim, split, and delete segments on one video track
- SRT export plus edited MP4 export, optionally with burned-in subtitles
- local FFmpeg processing through the Node backend
- import one video URL at a time through the local `codes/v1/services/yt-dlp` checkout, with progress and cancellation; optional private Netscape-format cookie file; no playlists or DRM
- select a time range and export only that portion as MP4 or GIF
- GIF width and frame-rate controls; optional burned-in subtitles
- GIF subtitle size, position, outline, background, CJK font option, wrapping, and rendered output-size preview
- named projects with autosave/manual save, reopening, duplication, existing-media reuse, and recovery snapshots
- canvas presets/custom size/background; shared video size/position, aspect lock, fit/fill, alignment, and drag/resize controls
- canvas-anchored subtitles and matching MP4/GIF composition rendering

implementation: codes/v1/core
implementation notes and run instructions: docs/v1/MVP.md
