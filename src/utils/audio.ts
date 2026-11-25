const DIRECT_AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)(?:[?#].*)?$/i;

export function isValidAudioUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  if (trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('blob:')) return true;
  return /^https?:\/\/\S+$/i.test(trimmed);
}

export function isDirectAudioFileUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!isValidAudioUrl(trimmed)) return false;
  if (trimmed.startsWith('blob:')) return false;
  return DIRECT_AUDIO_EXT_RE.test(trimmed);
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
