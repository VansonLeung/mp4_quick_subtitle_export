import { Copy, FolderOpen, Plus, Save } from 'lucide-react';
import { Button } from '../ui/button';

type Props = {
  name: string;
  status: string;
  error: string | null;
  hasMedia: boolean;
  disabled: boolean;
  onName: (name: string) => void;
  onLibrary: () => void;
  onSave: () => void;
  onNew: () => void;
  onDuplicate: () => void;
};
export function ProjectToolbar(props: Props) {
  return (
    <div className="project-toolbar">
      <div className="project-toolbar-actions">
        <Button variant="ghost" size="sm" disabled={props.disabled} onClick={props.onLibrary}>
          <FolderOpen size={14} />
          Projects
        </Button>
        <Button variant="ghost" size="sm" disabled={props.disabled} onClick={props.onNew}>
          <Plus size={14} />
          New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!props.hasMedia || props.disabled}
          onClick={props.onSave}
        >
          <Save size={14} />
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!props.hasMedia || props.disabled}
          onClick={props.onDuplicate}
        >
          <Copy size={14} />
          Duplicate
        </Button>
      </div>
      <input
        className="project-name-input"
        aria-label="Project name"
        key={props.name}
        defaultValue={props.name}
        maxLength={200}
        disabled={!props.hasMedia || props.disabled}
        onBlur={(event) => props.onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <span
        className={`project-save-status ${props.status === 'error' ? 'has-error' : ''}`}
        role="status"
        title={props.error || 'Projects save automatically on this computer.'}
      >
        {props.status === 'loading'
          ? 'Loading project…'
          : props.status === 'saving'
            ? 'Saving…'
            : props.status === 'error'
              ? 'Save failed · Retry Save'
              : props.hasMedia
                ? props.status === 'saved'
                  ? 'Saved on this computer'
                  : 'Unsaved changes'
                : 'No project open'}
      </span>
    </div>
  );
}
