import type {
  ExportJob,
  ExportRequest,
  MediaAsset,
  VideoImportJob,
} from '../../shared/editor.types';

export async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body as T;
}

export function uploadVideo(
  file: File,
  onProgress: (progress: number) => void,
): Promise<MediaAsset> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/media');
    request.responseType = 'json';
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error('Could not reach the local server. Check that it is running.'));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve(request.response)
        : reject(new Error(request.response?.error || 'The video could not be imported.'));
    const data = new FormData();
    data.append('video', file);
    request.send(data);
  });
}

export function startVideoImport(url: string) {
  return requestJson<VideoImportJob>('/api/media/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export function getVideoImport(id: string) {
  return requestJson<VideoImportJob>(`/api/media/imports/${id}`);
}

export function cancelVideoImport(id: string) {
  return requestJson<VideoImportJob>(`/api/media/imports/${id}`, { method: 'DELETE' });
}

export function startExport(body: ExportRequest) {
  return requestJson<ExportJob>('/api/exports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function downloadTextFile(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/x-subrip;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
