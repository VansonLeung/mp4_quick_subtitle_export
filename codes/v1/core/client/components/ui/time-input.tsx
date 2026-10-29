import { useEffect, useState } from 'react';
import { formatTime, parseTime } from '../../../shared/time.utils';

type Props = {
  value: number;
  onCommit: (time: number) => boolean | void;
  label: string;
  disabled?: boolean;
  max?: number;
};
export function TimeInput({ value, onCommit, label, disabled, max = Infinity }: Props) {
  const [draft, setDraft] = useState(formatTime(value, true));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(formatTime(value, true));
    setInvalid(false);
  }, [value]);
  function commit() {
    const parsed = parseTime(draft);
    if (parsed === null || parsed < 0 || parsed > max) {
      setInvalid(true);
      return;
    }
    if (Math.abs(parsed - value) < 0.0005) {
      setInvalid(false);
      setDraft(formatTime(value, true));
      return;
    }
    if (onCommit(parsed) === false) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(formatTime(parsed, true));
  }
  return (
    <input
      className="time-input"
      aria-label={label}
      aria-invalid={invalid}
      title={invalid ? 'Enter a valid time within the timeline.' : label}
      value={draft}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(formatTime(value, true));
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
