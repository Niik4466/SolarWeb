import { MinioObject } from '../models/minio';
import { SkyFrame } from '../models/sky-frame';

export function minioObjectToSkyFrame(
  o: MinioObject,
  bucket: string,
  apiBase: string
): SkyFrame | null {
  const name = (o?.name ?? '').trim();
  if (!name) return null;

  const last = name.split('/').pop() ?? '';
  let hh: string | undefined, mm: string | undefined, ss: string | undefined;

  // acepta HH[_:-]MM[_:-]SS.ext
  const m = last.match(/(\d{2})[:_-](\d{2})[:_-](\d{2})\.(jpg|jpeg|png)$/i);
  if (m) {
    hh = m[1]; mm = m[2]; ss = m[3];
  } else {
    const iso = o.last_modified ?? o.Last_modified ?? '';
    const tm = String(iso).match(/T(\d{2}):(\d{2})(?::(\d{2}))/);
    if (tm) { hh = tm[1]; mm = tm[2]; ss = tm[3] ?? '00'; }
  }

  if (!hh || !mm) return null;
  const time = `${hh}:${mm}`;

  const src = `${apiBase}/images/view` +
              `?bucket=${encodeURIComponent(bucket)}` +
              `&object_name=${encodeURIComponent(name)}`;

  return { time, src, alt: `Cielo ${time}` };
}

export function sortFramesByTime(frames: SkyFrame[]): SkyFrame[] {
  return [...frames].sort((a, b) =>
    String(a.time).localeCompare(String(b.time), 'es', { numeric: true })
  );
}
