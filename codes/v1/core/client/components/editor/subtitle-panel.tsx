import { Captions, Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SubtitleCue } from '../../../shared/editor.types';
import { Button } from '../ui/button';
import { TimeInput } from '../ui/time-input';

type Props = {
  cues: SubtitleCue[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSelect: (cue: SubtitleCue) => void;
  onUpdate: (cue: SubtitleCue) => boolean;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
};
export function SubtitlePanel(props: Props) {
  const [search, setSearch] = useState('');
  const filteredCues = props.cues.filter((cue) =>
    cue.text.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <aside className="subtitle-panel">
      <div className="panel-heading">
        <div className="panel-title">
          <Captions size={17} />
          Subtitles<span className="count-badge">{props.cues.length}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="Add subtitle at playhead"
          aria-label="Add subtitle"
          disabled={!props.duration}
          onClick={props.onAdd}
        >
          <Plus size={18} />
        </Button>
      </div>
      <div className="subtitle-file-actions">
        <Button variant="outline" size="sm" disabled={!props.duration} onClick={props.onImport}>
          <Upload size={14} />
          Import SRT
        </Button>
        <Button variant="ghost" size="sm" disabled={!props.cues.length} onClick={props.onExport}>
          <Download size={14} />
          Export SRT
        </Button>
      </div>
      {props.cues.length > 0 && (
        <div className="subtitle-search">
          <Search size={15} />
          <input
            placeholder="Find in subtitles…"
            aria-label="Find in subtitles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span>{filteredCues.length}</span>
        </div>
      )}
      <div className="subtitle-list">
        {!props.cues.length ? (
          <div className="empty-subtitles">
            <span className="empty-captions">
              <Captions size={26} strokeWidth={1.2} />
            </span>
            <strong>No subtitles yet</strong>
            <p>
              Import an SRT file or add a subtitle
              <br />
              at the playhead.
            </p>
            <Button variant="ghost" size="sm" disabled={!props.duration} onClick={props.onAdd}>
              <Plus size={14} />
              Add subtitle
            </Button>
          </div>
        ) : filteredCues.length ? (
          filteredCues.map((cue) => (
            <SubtitleCard
              key={cue.id}
              cue={cue}
              number={props.cues.indexOf(cue) + 1}
              duration={props.duration}
              selected={props.selectedId === cue.id}
              active={props.currentTime >= cue.start && props.currentTime < cue.end}
              onSelect={() => props.onSelect(cue)}
              onUpdate={props.onUpdate}
              onDelete={() => props.onDelete(cue.id)}
            />
          ))
        ) : (
          <p className="no-results">No matching subtitles.</p>
        )}
      </div>
      <div className="subtitle-footer">
        <span className="status-dot" />
        <span>Times follow the edited timeline</span>
      </div>
    </aside>
  );
}

function SubtitleCard({
  cue,
  number,
  duration,
  selected,
  active,
  onSelect,
  onUpdate,
  onDelete,
}: {
  cue: SubtitleCue;
  number: number;
  duration: number;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onUpdate: (cue: SubtitleCue) => boolean;
  onDelete: () => void;
}) {
  const [text, setText] = useState(cue.text);
  useEffect(() => setText(cue.text), [cue.text]);
  return (
    <article className={`subtitle-card ${selected ? 'selected' : ''} ${active ? 'active' : ''}`}>
      <div className="subtitle-card-top">
        <button className="subtitle-number" title="Seek to subtitle" onClick={onSelect}>
          {String(number).padStart(2, '0')}
        </button>
        <div className="cue-timing">
          <TimeInput
            label={`Subtitle ${number} start`}
            value={cue.start}
            max={duration}
            onCommit={(start) => onUpdate({ ...cue, start })}
          />
          <span>→</span>
          <TimeInput
            label={`Subtitle ${number} end`}
            value={cue.end}
            max={duration}
            onCommit={(end) => onUpdate({ ...cue, end })}
          />
        </div>
        <button
          className="delete-cue"
          title="Delete subtitle"
          aria-label={`Delete subtitle ${number}`}
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <textarea
        aria-label={`Subtitle ${number} text`}
        value={text}
        rows={Math.max(2, text.split('\n').length)}
        onFocus={onSelect}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text !== cue.text && !onUpdate({ ...cue, text })) setText(cue.text);
        }}
      />
    </article>
  );
}
