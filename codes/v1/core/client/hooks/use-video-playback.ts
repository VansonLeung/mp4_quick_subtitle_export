import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clip } from '../../shared/editor.types';
import { positionClips, timelineDuration, timelineToSource } from '../../shared/timeline.utils';
import { clamp } from '../../shared/time.utils';

export function useVideoPlayback(clips: Clip[]) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeRef = useRef(0);
  const activeClipId = useRef<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const duration = timelineDuration(clips);

  const seek = useCallback(
    (time: number) => {
      const next = clamp(time, 0, duration);
      const target = timelineToSource(clips, next);
      timeRef.current = next;
      setCurrentTime(next);
      if (target && videoRef.current) {
        activeClipId.current = target.clip.id;
        videoRef.current.currentTime = target.sourceTime;
      }
    },
    [clips, duration],
  );

  useEffect(() => {
    videoRef.current?.pause();
    setPlaying(false);
    seek(timeRef.current);
  }, [seek]);

  useEffect(() => {
    if (!playing) return;
    let animationFrame = 0;
    const positioned = positionClips(clips);
    function update() {
      const video = videoRef.current;
      const index = positioned.findIndex((clip) => clip.id === activeClipId.current);
      const clip = positioned[index];
      if (video && clip && !video.seeking) {
        if (video.currentTime >= clip.sourceEnd - 0.012 || video.ended) {
          const next = positioned[index + 1];
          if (next) {
            activeClipId.current = next.id;
            video.currentTime = next.sourceStart;
            timeRef.current = next.start;
            setCurrentTime(next.start);
            if (video.paused) void video.play().catch(() => setPlaying(false));
          } else {
            video.pause();
            timeRef.current = duration;
            setCurrentTime(duration);
            setPlaying(false);
          }
        } else {
          const time = clamp(
            clip.start + video.currentTime - clip.sourceStart,
            clip.start,
            clip.end,
          );
          timeRef.current = time;
          setCurrentTime(time);
        }
      }
      animationFrame = requestAnimationFrame(update);
    }
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, clips, duration]);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !clips.length) return;
    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }
    if (timeRef.current >= duration - 0.02) seek(0);
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, clips]);
  return {
    videoRef,
    currentTime,
    playing,
    muted,
    speed,
    seek,
    restoreTime: (time: number) => {
      timeRef.current = time;
      setCurrentTime(time);
    },
    togglePlayback,
    setMuted,
    setSpeed,
    pause: () => {
      videoRef.current?.pause();
      setPlaying(false);
    },
  };
}

export type VideoPlayback = ReturnType<typeof useVideoPlayback>;
