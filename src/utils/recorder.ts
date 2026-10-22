/**
 * Canvas animation capture via MediaRecorder. Only formats the browser
 * actually reports as supported are offered.
 */
export interface RecorderFormat {
  mime: string;
  ext: string;
  label: string;
}

const CANDIDATES: RecorderFormat[] = [
  { mime: 'video/webm;codecs=vp9', ext: 'webm', label: 'WebM (VP9)' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm', label: 'WebM (VP8)' },
  { mime: 'video/webm', ext: 'webm', label: 'WebM' },
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4', label: 'MP4 (H.264)' },
  { mime: 'video/mp4', ext: 'mp4', label: 'MP4' },
];

export function supportedRecorderFormats(): RecorderFormat[] {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return [];
  return CANDIDATES.filter((c) => {
    try {
      return MediaRecorder.isTypeSupported(c.mime);
    } catch {
      return false;
    }
  });
}

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export function startRecording(canvas: HTMLCanvasElement, format: RecorderFormat, fps: number, bitsPerSecond = 8_000_000): Recording {
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: bitsPerSecond });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start(250);
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: format.mime.split(';')[0] }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
