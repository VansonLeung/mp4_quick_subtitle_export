import type { CanvasSettings, MediaAsset, Project, VideoLayout } from './editor.types';

type Dimensions = Pick<MediaAsset, 'width' | 'height'>;
export function originalCanvas(media: Dimensions): CanvasSettings {
  return {
    width: Math.ceil(media.width / 2) * 2,
    height: Math.ceil(media.height / 2) * 2,
    background: '#000000',
  };
}
export function fitVideoLayout(
  media: Dimensions,
  canvas: CanvasSettings,
  mode: 'fit' | 'fill' = 'fit',
): VideoLayout {
  const scale = Math[mode === 'fit' ? 'min' : 'max'](
    canvas.width / media.width,
    canvas.height / media.height,
  );
  const width = Math.max(2, Math.round((media.width * scale) / 2) * 2);
  const height = Math.max(2, Math.round((media.height * scale) / 2) * 2);
  return {
    width,
    height,
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    aspectLocked: true,
  };
}
export function resolveComposition(project: Pick<Project, 'canvas' | 'video'>, media: Dimensions) {
  const canvas = project.canvas || originalCanvas(media);
  return { canvas, video: project.video || fitVideoLayout(media, canvas) };
}
export function validateComposition(canvas: CanvasSettings, video: VideoLayout) {
  if (
    !canvas ||
    !Number.isInteger(canvas.width) ||
    !Number.isInteger(canvas.height) ||
    canvas.width < 16 ||
    canvas.height < 16 ||
    canvas.width > 8192 ||
    canvas.height > 8192 ||
    canvas.width % 2 ||
    canvas.height % 2 ||
    canvas.width * canvas.height > 33_554_432 ||
    !/^#[0-9a-f]{6}$/i.test(canvas.background)
  ) {
    throw new Error(
      'Canvas dimensions must be even numbers from 16 to 8192, up to 32 megapixels, with a valid background color.',
    );
  }
  if (
    !video ||
    ![video.width, video.height, video.x, video.y].every(Number.isInteger) ||
    video.width < 2 ||
    video.height < 2 ||
    video.width > 16384 ||
    video.height > 16384 ||
    video.width * video.height > 67_108_864 ||
    Math.abs(video.x) > 32768 ||
    Math.abs(video.y) > 32768 ||
    typeof video.aspectLocked !== 'boolean'
  ) {
    throw new Error(
      'Enter valid video dimensions and position. Video dimensions can be 2–16384 pixels, up to 64 megapixels.',
    );
  }
}
