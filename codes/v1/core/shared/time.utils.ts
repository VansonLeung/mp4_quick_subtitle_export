export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatTime(seconds: number, milliseconds = false): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  const base = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return milliseconds ? `${base}.${String(total % 1000).padStart(3, '0')}` : base;
}

export function parseTime(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const match = normalized.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const [, hours, minutes, seconds, fraction = ''] = match;
  if (Number(minutes) >= 60 || Number(seconds) >= 60) return null;
  return (
    Number(hours || 0) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(fraction.padEnd(3, '0')) / 1000
  );
}

export function formatShortTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
