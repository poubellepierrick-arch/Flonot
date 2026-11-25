const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function parseTimeToken(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? Math.min(86400, num) : null;
  }
  const hms = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!hms) return null;
  const h = Number(hms[1] ?? 0);
  const m = Number(hms[2] ?? 0);
  const s = Number(hms[3] ?? 0);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? Math.min(86400, total) : null;
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let candidate: string | null = null;

  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch' || url.searchParams.has('v')) {
      candidate = url.searchParams.get('v');
    } else if (
      segments.length >= 2 &&
      (segments[0] === 'embed' ||
        segments[0] === 'shorts' ||
        segments[0] === 'live' ||
        segments[0] === 'v')
    ) {
      candidate = segments[1];
    }
  }

  if (!candidate) return null;
  return YOUTUBE_ID_RE.test(candidate) ? candidate : null;
}

export function extractYouTubeStartSeconds(rawUrl: string): number | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return parseTimeToken(url.searchParams.get('t') ?? url.searchParams.get('start'));
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(rawUrl: string): string | null {
  const id = extractYouTubeVideoId(rawUrl);
  if (!id) return null;
  const start = extractYouTubeStartSeconds(rawUrl);
  const params = new URLSearchParams({ rel: '0' });
  if (start !== null) {
    params.set('start', String(start));
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function isYouTubeUrl(rawUrl: string): boolean {
  return extractYouTubeVideoId(rawUrl) !== null;
}
