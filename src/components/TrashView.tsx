import { useMemo } from 'react';
import { FileText, RotateCcw, Table2, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export function TrashView() {
  const { pages, restoreFromTrash, deletePermanently } = useWorkspace();

  const trashedPages = useMemo(() => pages.filter((p) => p.isTrashed), [pages]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Corbeille
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Restaurez les pages supprimées ou effacez-les définitivement.
        </p>
      </div>

      {trashedPages.length === 0 ? (
        <div className="py-16 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-center text-sm text-slate-500 dark:text-slate-400">
          La corbeille est vide.
        </div>
      ) : (
        <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          {trashedPages.map((page) => (
            <div
              key={page.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 flex items-center gap-3">
                {page.icon && !['▤', '◷', '◫', '◉', '⊞'].includes(page.icon) ? (
                  <span className="w-5 h-5 flex items-center justify-center text-base leading-none shrink-0">
                    {page.icon}
                  </span>
                ) : page.type === 'database' ? (
                  <Table2 className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {page.title || 'Sans titre'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void restoreFromTrash(page.id)}
                  className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurer</span>
                </button>
                <button
                  type="button"
                  onClick={() => void deletePermanently(page.id)}
                  className="h-8 px-3 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
