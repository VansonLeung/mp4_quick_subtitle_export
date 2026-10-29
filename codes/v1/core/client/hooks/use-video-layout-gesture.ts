import { useRef, useState, type PointerEvent } from 'react';
import type { CanvasSettings, VideoLayout } from '../../shared/editor.types';
import { clamp } from '../../shared/time.utils';

type Gesture = {
  mode: string;
  clientX: number;
  clientY: number;
  layout: VideoLayout;
  scale: number;
};
export function useVideoLayoutGesture(
  canvas: CanvasSettings,
  layout: VideoLayout,
  onCommit: (layout: VideoLayout) => void,
) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef<VideoLayout | null>(null);
  const [draft, setDraft] = useState<VideoLayout | null>(null);
  const [selected, setSelected] = useState(false);
  function begin(event: PointerEvent<HTMLElement>, mode = 'move') {
    if (event.button !== 0 || !canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected(true);
    gesture.current = {
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      layout,
      scale: canvas.width / canvasRef.current.getBoundingClientRect().width,
    };
    latest.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const deltaX = (event.clientX - active.clientX) * active.scale;
    const deltaY = (event.clientY - active.clientY) * active.scale;
    const initial = active.layout;
    let next: VideoLayout;
    if (active.mode === 'move')
      next = {
        ...initial,
        x: clamp(Math.round(initial.x + deltaX), -32768, 32768),
        y: clamp(Math.round(initial.y + deltaY), -32768, 32768),
      };
    else {
      const left = active.mode.includes('w');
      const top = active.mode.includes('n');
      let width = clamp(Math.round(initial.width + deltaX * (left ? -1 : 1)), 2, 16384);
      let height = clamp(Math.round(initial.height + deltaY * (top ? -1 : 1)), 2, 16384);
      if (initial.aspectLocked) {
        const ratio = initial.width / initial.height;
        if (Math.abs(deltaX / initial.width) >= Math.abs(deltaY / initial.height))
          height = Math.max(2, Math.round(width / ratio));
        else width = Math.max(2, Math.round(height * ratio));
        if (Math.max(width, height) > 16384) {
          const scale = 16384 / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
      }
      if (width * height > 67_108_864) return;
      next = {
        ...initial,
        width,
        height,
        x: left ? initial.x + initial.width - width : initial.x,
        y: top ? initial.y + initial.height - height : initial.y,
      };
    }
    latest.current = next;
    setDraft(next);
  }
  function finish(event: PointerEvent<HTMLElement>, cancel = false) {
    if (!gesture.current) return;
    gesture.current = null;
    if (!cancel && latest.current) onCommit(latest.current);
    latest.current = null;
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return { canvasRef, selected, setSelected, layout: draft || layout, begin, move, finish };
}
