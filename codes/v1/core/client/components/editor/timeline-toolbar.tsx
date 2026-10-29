import {
  ChevronFirst,
  ChevronLast,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '../ui/button';
import { TimeInput } from '../ui/time-input';
import type { TimeRange } from '../../../shared/editor.types';

type Props = {
  duration: number;
  range: TimeRange;
  zoom: number;
  selected: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onRangeChange: (range: TimeRange) => void;
  onZoom: (zoom: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onUndo: () => void;
  onRedo: () => void;
};
export function TimelineToolbar(props: Props) {
  return (
    <div className="timeline-toolbar">
      <div className="timeline-tool-group">
        <span className="timeline-heading">Timeline</span>
        <span className="tool-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Split at playhead (S)"
          aria-label="Split at playhead"
          disabled={!props.duration}
          onClick={props.onSplit}
        >
          <Scissors size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Trim selected segment start to playhead"
          aria-label="Trim start to playhead"
          disabled={!props.selected}
          onClick={props.onTrimStart}
        >
          <ChevronFirst size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Trim selected segment end to playhead"
          aria-label="Trim end to playhead"
          disabled={!props.selected}
          onClick={props.onTrimEnd}
        >
          <ChevronLast size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Delete selected segment (Delete)"
          aria-label="Delete selected segment"
          disabled={!props.selected}
          onClick={props.onDelete}
        >
          <Trash2 size={15} />
        </Button>
        <span className="tool-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Undo"
          aria-label="Undo timeline edit"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          <Undo2 size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Redo"
          aria-label="Redo timeline edit"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Redo2 size={15} />
        </Button>
      </div>
      <div className="range-controls">
        <span>Export range</span>
        <TimeInput
          value={props.range.start}
          label="Range start"
          max={props.duration}
          disabled={!props.duration}
          onCommit={(start) => {
            if (start >= props.range.end - 0.049) return false;
            props.onRangeChange({ ...props.range, start });
          }}
        />
        <span className="range-dash">—</span>
        <TimeInput
          value={props.range.end}
          label="Range end"
          max={props.duration}
          disabled={!props.duration}
          onCommit={(end) => {
            if (end <= props.range.start + 0.049) return false;
            props.onRangeChange({ ...props.range, end });
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={!props.duration}
          title="Select entire timeline"
          onClick={() => props.onRangeChange({ start: 0, end: props.duration })}
        >
          Reset
        </Button>
      </div>
      <div className="zoom-controls">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out timeline"
          disabled={props.zoom <= 1}
          onClick={() => props.onZoom(Math.max(1, props.zoom - 0.5))}
        >
          <ZoomOut size={16} />
        </Button>
        <span>{Math.round(props.zoom * 100)}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in timeline"
          disabled={props.zoom >= 8}
          onClick={() => props.onZoom(Math.min(8, props.zoom + 0.5))}
        >
          <ZoomIn size={16} />
        </Button>
      </div>
    </div>
  );
}
