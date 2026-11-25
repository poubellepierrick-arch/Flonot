import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatAudioTime } from '../utils/audio';

interface AudioPlayerBarProps {
  src: string;
  title?: string;
}

export function AudioPlayerBar({ src, title }: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || loadError) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setLoadError(true);
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const handleSeek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return (
    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 px-3 py-2 space-y-1.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
          setLoadError(false);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onError={() => {
          setPlaying(false);
          setLoadError(true);
        }}
      />

      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={loadError}
          aria-label={playing ? 'Mettre en pause' : 'Lire l’audio'}
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-700 dark:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <input
          type="range"
          min={0}
          max={safeDuration || 100}
          step={0.1}
          value={safeDuration > 0 ? Math.min(currentTime, safeDuration) : 0}
          disabled={safeDuration <= 0 || loadError}
          onChange={(e) => handleSeek(Number(e.target.value))}
          aria-label="Position de lecture audio"
          className="flex-1 min-w-0 h-1.5 accent-indigo-600 dark:accent-indigo-400 cursor-pointer disabled:cursor-default"
        />

        <span className="font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300 shrink-0 whitespace-nowrap">
          {formatAudioTime(currentTime)} / {formatAudioTime(safeDuration)}
        </span>

        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Réactiver le son' : 'Couper le son'}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
        >
          {muted || volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (v > 0 && muted) setMuted(false);
          }}
          aria-label="Volume audio"
          className="hidden sm:block w-16 h-1.5 accent-indigo-600 dark:accent-indigo-400 cursor-pointer shrink-0"
        />
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-700 dark:text-amber-400 pt-0.5">
          <span>Flux audio direct non lisible ici (vérifiez un lien .mp3, .wav, .ogg ou .m4a).</span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
          >
            <span>Ouvrir le lien audio</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {!loadError && title && title.trim() && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-0.5">
          {title}
        </div>
      )}
    </div>
  );
}
