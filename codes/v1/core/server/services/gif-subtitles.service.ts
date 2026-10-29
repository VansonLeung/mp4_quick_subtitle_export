import type { GifSubtitleSettings, SubtitleCue } from '../../shared/editor.types';
import { stripSubtitleMarkup } from '../../shared/subtitles.utils';

function assTime(seconds: number) {
  const total = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(total / 360000)}:${String(Math.floor(total / 6000) % 60).padStart(2, '0')}:${String(Math.floor(total / 100) % 60).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
}
function fontFamily(style: GifSubtitleSettings) {
  if (style.font === 'traditional')
    return process.platform === 'darwin'
      ? 'PingFang HK'
      : process.platform === 'win32'
        ? 'Microsoft JhengHei'
        : 'Noto Sans CJK TC';
  return style.font === 'serif' ? 'serif' : 'sans-serif';
}
// Estimate widths conservatively and break CJK text even when it has no spaces.
function wrapText(text: string, maxWidth: number, fontSize: number): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const widthOf = (character: string) =>
    /\s/u.test(character)
      ? 0.35
      : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(
            character,
          )
        ? 1.05
        : /[MW@#%]/u.test(character)
          ? 0.95
          : /[ilI.,'!|]/u.test(character)
            ? 0.36
            : 0.68;
  return stripSubtitleMarkup(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => {
      const graphemes = [...segmenter.segment(line)].map((item) => item.segment);
      const lines: string[] = [];
      let current = '';
      let width = 0;
      let lastSpace = -1;
      while (graphemes.length) {
        const character = graphemes.shift()!;
        const nextWidth = widthOf(character) * fontSize;
        if (current && width + nextWidth > maxWidth) {
          if (lastSpace > 0 && lastSpace >= Math.floor(current.length / 2)) {
            const remaining = current.slice(lastSpace + 1);
            lines.push(current.slice(0, lastSpace).trimEnd());
            graphemes.unshift(
              ...[...segmenter.segment(remaining)].map((item) => item.segment),
              character,
            );
          } else {
            lines.push(current.trimEnd());
            graphemes.unshift(character);
          }
          current = '';
          width = 0;
          lastSpace = -1;
          continue;
        }
        if (!current && /\s/u.test(character)) continue;
        current += character;
        width += nextWidth;
        if (/\s/u.test(character)) lastSpace = current.length - 1;
      }
      lines.push(current);
      return lines;
    })
    .map((line) => line.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}'))
    .join('\\N');
}
export function serializeGifSubtitles(
  cues: SubtitleCue[],
  size: { width: number; height: number },
  style: GifSubtitleSettings,
) {
  const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const sideMargin = Math.max(1, Math.round(size.width * 0.05));
  const position =
    style.position === 'middle'
      ? `{\\an5\\pos(${Math.round(size.width / 2)},${Math.round(size.height / 2 + style.margin)})}`
      : '';
  const lines = cues.map(
    (cue) =>
      `Dialogue: 0,${assTime(cue.start)},${assTime(Math.max(cue.start + 0.01, cue.end))},Default,,0,0,0,,${position}${wrapText(cue.text, size.width - sideMargin * 2 - style.outline * 2, style.fontSize)}`,
  );
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${size.width}\nPlayResY: ${size.height}\nWrapStyle: 1\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontFamily(style)},${style.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,${style.background ? 3 : 1},${style.outline},0,${alignment},${sideMargin},${sideMargin},${style.position === 'middle' ? 0 : style.margin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${lines.join('\n')}\n`;
}
