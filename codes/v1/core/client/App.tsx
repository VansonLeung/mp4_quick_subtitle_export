import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileVideo, Keyboard, X } from 'lucide-react';
import { EditorHeader } from './components/editor/editor-header';
import { VideoPreview } from './components/editor/video-preview';
import { SubtitlePanel } from './components/editor/subtitle-panel';
import { TimelineToolbar } from './components/editor/timeline-toolbar';
import { TimelineTracks } from './components/editor/timeline-tracks';
import { ExportDialog } from './components/editor/export-dialog';
import { ImportUrlDialog } from './components/editor/import-url-dialog';
import { useEditorSession } from './hooks/use-editor-session';
import { useVideoImportJob } from './hooks/use-video-import-job';
import { useEditorShortcuts } from './hooks/use-editor-shortcuts';
import { useVideoThumbnails } from './hooks/use-video-thumbnails';
import { formatTime } from '../shared/time.utils';
import { useProjectPersistence } from './hooks/use-project-persistence';
import { ProjectToolbar } from './components/editor/project-toolbar';
import { ProjectLibraryDialog } from './components/editor/project-library-dialog';
import { CompositionPanel } from './components/editor/composition-panel';

export default function App() {
  const [message, setMessage] = useState<string | null>(null);
  const notify = useCallback((text: string) => setMessage(text), []);
  const session = useEditorSession(notify);
  const videoImporter = useVideoImportJob();
  const { media, project, playback, range, duration } = session;
  const [exportOpen, setExportOpen] = useState(false);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const persistence = useProjectPersistence(session, zoom, setZoom, notify);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'subtitles' | 'layout'>('subtitles');
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const videoInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const thumbnails = useVideoThumbnails(media);
  useEditorShortcuts(session, exportOpen || importUrlOpen || libraryOpen || !persistence.ready);
  async function perform(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'This action could not finish.');
    }
  }
  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        setTimeout(() => {
          void perform(persistence.save);
        }, 0);
      }
    };
    window.addEventListener('keydown', handleSave);
    return () => window.removeEventListener('keydown', handleSave);
  }, [persistence.save]);
  useEffect(() => {
    if (videoImporter.job?.status !== 'complete' || !videoImporter.job.media) return;
    const imported = videoImporter.job.media;
    void perform(async () => {
      await persistence.save();
      session.acceptImportedVideo(imported);
      videoImporter.clear();
      setImportUrlOpen(false);
      notify('Video imported from URL.');
    });
  }, [videoImporter.job?.id, videoImporter.job?.status]);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 6500);
    return () => clearTimeout(timeout);
  }, [message]);
  const openVideo = () => videoInput.current?.click();
  const importSrt = () => subtitleInput.current?.click();
  return (
    <div
      className="editor-app"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragDepth.current++;
          setDragOver(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        if (videoImporter.busy) {
          notify('Wait for the current video import to finish.');
          return;
        }
        const files = [...event.dataTransfer.files];
        const video = files.find((file) => /\.(mp4|m4v)$/i.test(file.name));
        const srt = files.find((file) => /\.srt$/i.test(file.name));
        if (video)
          void perform(async () => {
            await persistence.save();
            await session.importVideo(video);
          });
        else if (srt && duration) void session.importSubtitles(srt);
        else
          notify(
            srt ? 'Open a video before importing subtitles.' : 'Drop an MP4, M4V, or SRT file.',
          );
      }}
    >
      <input
        ref={videoInput}
        className="visually-hidden"
        type="file"
        accept=".mp4,.m4v,video/mp4,video/x-m4v"
        aria-label="Choose video file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          void perform(async () => {
            await persistence.save();
            await session.importVideo(file);
          });
          event.target.value = '';
        }}
      />
      <input
        ref={subtitleInput}
        className="visually-hidden"
        type="file"
        accept=".srt,application/x-subrip"
        aria-label="Choose SRT file"
        onChange={(event) => {
          void session.importSubtitles(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <EditorHeader
        media={media}
        busy={session.uploadProgress !== null || videoImporter.busy || !persistence.ready}
        onOpen={openVideo}
        onImportUrl={() => setImportUrlOpen(true)}
        onExport={() => setExportOpen(true)}
        onUndo={session.undo}
        onRedo={session.redo}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
      />
      <ProjectToolbar
        name={persistence.name}
        status={persistence.status}
        error={persistence.error}
        hasMedia={!!media}
        disabled={!persistence.ready || session.uploadProgress !== null || videoImporter.busy}
        onName={persistence.rename}
        onLibrary={() => setLibraryOpen(true)}
        onSave={() => void perform(persistence.save)}
        onNew={() => void perform(persistence.newProject)}
        onDuplicate={() => void perform(persistence.duplicate)}
      />
      <main className="editor-workspace">
        <VideoPreview
          media={media}
          cues={project.cues}
          duration={duration}
          playback={playback}
          onOpen={openVideo}
          uploadProgress={session.uploadProgress}
          project={project}
          onLayout={(video) => session.commit((current) => ({ ...current, video }))}
        />
        <aside className="editor-inspector">
          <div className="inspector-tabs" role="tablist" aria-label="Editor inspector">
            <button
              role="tab"
              aria-selected={inspectorTab === 'subtitles'}
              onClick={() => setInspectorTab('subtitles')}
            >
              Subtitles
            </button>
            <button
              role="tab"
              aria-selected={inspectorTab === 'layout'}
              onClick={() => setInspectorTab('layout')}
            >
              Canvas & video
            </button>
          </div>
          {inspectorTab === 'layout' ? (
            <CompositionPanel
              media={media}
              project={project}
              onCommit={session.commit}
              notify={notify}
            />
          ) : (
            <SubtitlePanel
              cues={project.cues}
              duration={duration}
              currentTime={playback.currentTime}
              selectedId={session.selectedCueId}
              onSelect={session.selectCue}
              onUpdate={session.updateCue}
              onDelete={session.deleteCue}
              onAdd={session.addCue}
              onImport={importSrt}
              onExport={session.exportSrt}
            />
          )}
        </aside>
      </main>
      <section className="timeline-panel" aria-label="Timeline editor">
        <TimelineToolbar
          duration={duration}
          range={range}
          zoom={zoom}
          selected={!!session.selectedClip}
          canUndo={session.canUndo}
          canRedo={session.canRedo}
          onRangeChange={session.setRange}
          onZoom={setZoom}
          onSplit={session.splitAtPlayhead}
          onDelete={session.deleteSelectedClip}
          onTrimStart={() => session.trimSelectedClip('start')}
          onTrimEnd={() => session.trimSelectedClip('end')}
          onUndo={session.undo}
          onRedo={session.redo}
        />
        <TimelineTracks
          media={media}
          clips={project.clips}
          cues={project.cues}
          thumbnails={thumbnails}
          duration={duration}
          currentTime={playback.currentTime}
          range={range}
          zoom={zoom}
          selectedClipId={session.selectedClipId}
          onSeek={playback.seek}
          onSelectClip={session.setSelectedClipId}
          onSelectCue={session.selectCue}
          onRangeChange={session.setRange}
          onRestore={session.restoreVideo}
        />
      </section>
      <footer className="app-footer">
        <div>
          <span className="status-dot" />
          <span>
            {session.uploadProgress !== null
              ? 'Importing video…'
              : videoImporter.busy
                ? 'Downloading video…'
                : media
                  ? 'Ready to edit'
                  : 'No video loaded'}
          </span>
          {media && (
            <>
              <span className="dot-separator">·</span>
              <span>{(media.size / 1024 ** 2).toFixed(1)} MB</span>
            </>
          )}
        </div>
        <span className="footer-range">
          Selected <strong>{formatTime(range.end - range.start, true)}</strong>
        </span>
        <div
          className="keyboard-hints"
          title="Space: play/pause · S: split · I/O: mark export in/out · Delete: remove selected segment · Arrows: step frame · Shift arrows: step second · Cmd/Ctrl Z: undo"
        >
          <Keyboard size={14} />
          <span>
            <kbd>Space</kbd> Play
          </span>
          <span>
            <kbd>S</kbd> Split
          </span>
          <span>
            <kbd>I</kbd>
            <kbd>O</kbd> Mark range
          </span>
        </div>
      </footer>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        media={media}
        project={project}
        duration={duration}
        range={range}
        onRangeChange={session.setRange}
        settings={persistence.exportSettings}
        onSettingsChange={persistence.setExportSettings}
      />
      <ProjectLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onOpen={persistence.openProject}
        onNew={persistence.newProject}
        onMedia={async (asset) => {
          await persistence.newProject();
          session.acceptImportedVideo(asset);
        }}
      />
      <ImportUrlDialog
        open={importUrlOpen}
        onOpenChange={setImportUrlOpen}
        job={videoImporter.job}
        busy={videoImporter.busy}
        error={videoImporter.error}
        onBegin={videoImporter.begin}
        onCancel={videoImporter.cancel}
      />
      {dragOver && (
        <div className="file-drop-overlay">
          <FileVideo size={40} strokeWidth={1.3} />
          <strong>Drop to import</strong>
          <span>MP4 / M4V video or SRT subtitles</span>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{message}</span>
          <button aria-label="Dismiss notification" onClick={() => setMessage(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
