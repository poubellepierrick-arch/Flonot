import { Minus, Plus } from 'lucide-react';

interface RelationActionRowProps {
  label: string;
  meta?: string;
  isLinked: boolean;
  onOpen: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}

export function RelationActionRow({
  label,
  meta,
  isLinked,
  onOpen,
  onAdd,
  onRemove,
  compact = false,
}: RelationActionRowProps) {
  const showRemove = isLinked && Boolean(onRemove);
  const showAdd = !isLinked && Boolean(onAdd);

  return (
    <div
      className={`flex items-center justify-between gap-2 ${
        compact ? 'px-2 py-1' : 'px-3 py-1.5'
      } hover:bg-slate-50 dark:hover:bg-slate-900/70 transition-colors`}
    >
      <button
        type="button"
        onClick={onOpen}
        title={`Ouvrir la fiche : ${label}`}
        className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left text-xs group"
      >
        <span className="truncate font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:underline">
          {label}
        </span>
        {meta && (
          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0 truncate max-w-[110px]">
            {meta}
          </span>
        )}
      </button>

      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${label}`}
          title={`Retirer ${label}`}
          className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-red-300 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      )}

      {showAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Ajouter ${label}`}
          title={`Ajouter ${label}`}
          className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface RelationActionChipProps {
  label: string;
  isLinked: boolean;
  onOpen: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
}

export function RelationActionChip({
  label,
  isLinked,
  onOpen,
  onAdd,
  onRemove,
}: RelationActionChipProps) {
  return (
    <span
      className={`inline-flex items-stretch rounded-md border text-xs overflow-hidden transition-colors ${
        isLinked
          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        title={`Ouvrir la fiche : ${label}`}
        className="px-2 py-1 hover:text-indigo-600 dark:hover:text-indigo-300 hover:underline whitespace-nowrap max-w-[170px] truncate"
      >
        {label}
      </button>
      {isLinked && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${label}`}
          title={`Retirer ${label}`}
          className="px-1.5 border-l border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 inline-flex items-center justify-center transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
      ) : !isLinked && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Ajouter ${label}`}
          title={`Ajouter ${label}`}
          className="px-1.5 border-l border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center justify-center transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      ) : null}
    </span>
  );
}
