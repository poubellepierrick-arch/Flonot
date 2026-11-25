import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { resolveTrailEntryLabel } from '../utils/detailTrail';

export function DetailBreadcrumbBar() {
  const {
    pages,
    rowsByPage,
    detailOrigin,
    detailTrail,
    navigateDetailTrailTo,
    returnToDetailOrigin,
  } = useWorkspace();

  if (detailTrail.length === 0) return null;

  const canGoToPreviousTrail = detailTrail.length > 1;
  const originLabel = detailOrigin?.label || 'Origine';

  const handleStepBack = () => {
    if (canGoToPreviousTrail) {
      navigateDetailTrailTo(detailTrail.length - 2);
    } else {
      returnToDetailOrigin();
    }
  };

  return (
    <div className="flex items-center gap-1.5 min-w-0 pb-1.5 border-b border-slate-200/80 dark:border-slate-800/80">
      <button
        type="button"
        onClick={handleStepBack}
        aria-label="Revenir en arrière"
        title={
          canGoToPreviousTrail
            ? 'Revenir à la fiche précédente'
            : `Revenir à ${originLabel}`
        }
        className="h-6 px-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1 shrink-0 transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        <span>Retour</span>
      </button>

      <nav
        aria-label="Fil d'Ariane de la fiche"
        className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto text-[11px] text-slate-500 dark:text-slate-400 py-0.5"
      >
        <button
          type="button"
          onClick={returnToDetailOrigin}
          title={`Revenir à ${originLabel}`}
          className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline whitespace-nowrap shrink-0 max-w-[110px] truncate"
        >
          {originLabel}
        </button>

        {detailTrail.map((entry, idx) => {
          const isLast = idx === detailTrail.length - 1;
          const title = resolveTrailEntryLabel(entry, pages, rowsByPage);
          return (
            <span
              key={`${entry.pageId}::${entry.rowId}::${idx}`}
              className="inline-flex items-center gap-1 shrink-0"
            >
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap max-w-[140px] truncate"
                >
                  {title}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateDetailTrailTo(idx)}
                  title={`Ouvrir ${title}`}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline whitespace-nowrap max-w-[120px] truncate"
                >
                  {title}
                </button>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
