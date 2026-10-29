import type { ExportRequest } from '../../shared/editor.types';
import { selectSourceSegments } from '../../shared/timeline.utils';
import { cropSubtitles } from '../../shared/subtitles.utils';
import type { StoredMedia } from './media.service';
import { resolveComposition } from '../../shared/composition.utils';

export function buildExportArguments(
  request: ExportRequest,
  media: StoredMedia,
  options: { preview?: boolean; inputSeek?: number } = {},
): string[] {
  const segments = selectSourceSegments(request.clips, request.range);
  const includeAudio = media.hasAudio && request.format === 'mp4';
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const duration = segment.sourceEnd - segment.sourceStart;
    filters.push(
      `[0:v:0]trim=start=${Math.max(0, segment.sourceStart - (options.inputSeek || 0))}:end=${segment.sourceEnd - (options.inputSeek || 0)},setpts=PTS-STARTPTS[v${index}]`,
    );
    if (includeAudio)
      filters.push(
        `[0:a:0]atrim=start=${segment.sourceStart}:end=${segment.sourceEnd},asetpts=PTS-STARTPTS,apad=whole_dur=${duration},atrim=duration=${duration}[a${index}]`,
      );
  });
  const inputs = segments
    .map((_, index) => `[v${index}]${includeAudio ? `[a${index}]` : ''}`)
    .join('');
  filters.push(
    `${inputs}concat=n=${segments.length}:v=1:a=${includeAudio ? 1 : 0}[joined]${includeAudio ? '[audio]' : ''}`,
  );
  const hasSubtitles =
    request.burnSubtitles && cropSubtitles(request.cues, request.range).length > 0;
  const subtitles =
    hasSubtitles && request.format === 'mp4'
      ? ",subtitles=captions.srt:force_style='FontName=Arial,FontSize=16,Outline=1,Shadow=0,MarginV=16'"
      : '';
  const args = [
    '-hide_banner',
    '-y',
    ...(options.inputSeek ? ['-ss', String(options.inputSeek)] : []),
    '-i',
    media.filePath,
  ];
  const { canvas, video } = resolveComposition(request, media);
  const frameRate = request.format === 'gif' ? request.gifFps : 30;
  const exportDuration = request.range.end - request.range.start;
  filters.push(
    `[joined]fps=${frameRate},scale=${video.width}:${video.height}:flags=lanczos,setsar=1,format=rgba[placed]`,
  );
  filters.push(
    `color=c=${canvas.background}:s=${canvas.width}x${canvas.height}:r=${frameRate}:d=${exportDuration},format=rgba[canvas]`,
  );
  filters.push(
    `[canvas][placed]overlay=x=${video.x}:y=${video.y}:shortest=1:format=auto${subtitles}[composite]`,
  );
  if (request.format === 'gif') {
    filters.push(
      `[composite]scale=w='min(${request.gifWidth},iw)':h=-2:flags=lanczos${hasSubtitles ? ',ass=captions.ass' : ''}[gifScaled]`,
    );
    if (options.preview) {
      filters.push('[gifScaled]format=rgb24[output]');
      args.push(
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[output]',
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-f',
        'image2pipe',
        'pipe:1',
      );
      return args;
    }
    filters.push('[gifScaled]split[paletteInput][gifInput]');
    filters.push('[paletteInput]palettegen=stats_mode=diff[palette]');
    filters.push('[gifInput][palette]paletteuse=dither=sierra2_4a[output]');
    args.push('-filter_complex', filters.join(';'), '-map', '[output]', '-an', '-loop', '0');
  } else {
    filters.push('[composite]format=yuv420p[output]');
    args.push('-filter_complex', filters.join(';'), '-map', '[output]');
    if (includeAudio) args.push('-map', '[audio]', '-c:a', 'aac', '-b:a', '192k');
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
    );
  }
  args.push('-progress', 'pipe:1', '-nostats', `output.${request.format}`);
  return args;
}
