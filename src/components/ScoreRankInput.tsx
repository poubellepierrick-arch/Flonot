import { useEffect, useState } from 'react';
import type { CellValue } from '../types/workspace';

interface ScoreRankInputProps {
  value: CellValue | undefined;
  maxRank: number;
  ariaLabel: string;
  highlighted?: boolean;
  onCommit: (nextRank: number) => void;
  className?: string;
}

/**
 * Champ numérique de score de classement : valide au Entrée ou au blur sans réordonner en cours de frappe.
 */
export function ScoreRankInput({
  value,
  maxRank,
  ariaLabel,
  highlighted = false,
  onCommit,
  className = '',
}: ScoreRankInputProps) {
  const canonicalStr =
    typeof value === 'number' && Number.isFinite(value)
      ? String(Math.round(value))
      : value !== undefined && value !== null && value !== ''
        ? String(value)
        : '';

  const [draft, setDraft] = useState(canonicalStr);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(canonicalStr);
    }
  }, [canonicalStr, focused]);

  const commitDraft = () => {
    const parsed = Number(draft.replace(',', '.').trim());
    if (!Number.isFinite(parsed) || draft.trim() === '') {
      setDraft(canonicalStr);
      return;
    }
    const clamped = Math.max(1, Math.min(Math.max(1, maxRank), Math.round(parsed)));
    setDraft(String(clamped));
    if (String(clamped) !== canonicalStr) {
      onCommit(clamped);
    }
  };

  return (
    <input
      type="number"
      min={1}
      max={Math.max(1, maxRank)}
      step={1}
      value={draft}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(canonicalStr);
          setFocused(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={`w-full bg-transparent text-xs sm:text-sm font-mono tabular-nums text-right text-slate-800 dark:text-slate-200 focus:outline-none rounded px-1 py-0.5 transition-colors duration-200 ${
        highlighted
          ? 'bg-indigo-100/90 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-200 font-semibold'
          : 'focus:bg-indigo-50/70 dark:focus:bg-indigo-950/40'
      } ${className}`}
    />
  );
}
