import type { ExportSettings, GifSubtitleSettings } from './editor.types';

export function defaultGifSubtitleSettings(width: number): GifSubtitleSettings {
  const referenceWidth = Number.isFinite(width) && width > 0 ? width : 640;
  return {
    fontSize: Math.max(8, Math.min(96, Math.round((18 * referenceWidth) / 320))),
    font: 'auto',
    position: 'bottom',
    margin: 12,
    outline: 2,
    background: false,
  };
}
export function resolveGifSubtitleSettings(
  settings: Pick<ExportSettings, 'gifWidth' | 'gifSubtitle'>,
): GifSubtitleSettings {
  return settings.gifSubtitle ?? defaultGifSubtitleSettings(settings.gifWidth);
}
export function validateGifSubtitleSettings(style: GifSubtitleSettings) {
  if (
    !style ||
    !Number.isInteger(style.fontSize) ||
    style.fontSize < 8 ||
    style.fontSize > 96 ||
    !['auto', 'traditional', 'serif'].includes(style.font) ||
    !['bottom', 'middle', 'top'].includes(style.position) ||
    !Number.isInteger(style.margin) ||
    style.margin < (style.position === 'middle' ? -80 : 0) ||
    style.margin > 80 ||
    !Number.isInteger(style.outline) ||
    style.outline < 1 ||
    style.outline > 4 ||
    typeof style.background !== 'boolean'
  )
    throw new Error('Invalid GIF subtitle style.');
}
export function gifOutputSize(canvas: { width: number; height: number }, width: number) {
  const outputWidth = Math.min(canvas.width, width);
  return {
    width: outputWidth,
    height: Math.max(2, Math.round((canvas.height * outputWidth) / canvas.width / 2) * 2),
  };
}
