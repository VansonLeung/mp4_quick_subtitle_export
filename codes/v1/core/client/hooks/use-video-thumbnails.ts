import { useEffect, useState } from 'react';
import type { MediaAsset } from '../../shared/editor.types';

export type Thumbnail = { time: number; url: string };
export function useVideoThumbnails(media: MediaAsset | null) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  useEffect(() => {
    setThumbnails([]);
    if (!media) return;
    let disposed = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = media.url;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = Math.max(1, Math.round((160 * media.height) / media.width));
    const context = canvas.getContext('2d');
    const frames: Thumbnail[] = [];
    let index = 0;
    function capture() {
      if (disposed || !context || !media) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ time: video.currentTime, url: canvas.toDataURL('image/jpeg', 0.65) });
      setThumbnails([...frames]);
      index++;
      if (index < 12)
        video.currentTime = Math.min(media.duration - 0.02, (media.duration * index) / 12);
    }
    video.addEventListener('loadeddata', capture, { once: true });
    video.addEventListener('seeked', capture);
    return () => {
      disposed = true;
      video.removeEventListener('seeked', capture);
      video.removeAttribute('src');
      video.load();
    };
  }, [media]);
  return thumbnails;
}
