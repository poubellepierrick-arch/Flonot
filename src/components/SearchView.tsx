import { useMemo } from 'react';
import { Calendar, FileText, Search, Sparkles, Table2, Users } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { searchGlobalWorkspace, type GlobalSearchItem } from '../utils/globalSearch';

const KIND_LABELS: Record<GlobalSearchItem['kind'], string> = {
  exercise: 'Exercice',
  seance: 'Séance',
  group: 'Groupe',
  participant: 'Participant',
  row: 'Fiche',
  page: 'Page',
  database: 'Base',
};

export function SearchView() {
  const {
    pages,
    rowsByPage,
    improModel,
    selectPage,
    openImproDetail,
    viewSettings,
    updateSearchViewSettings,
  } = useWorkspace();
  const query = viewSettings.search.query;
  const setQuery = (val: string) => updateSearchViewSettings({ query: val });

  const results = useMemo(
    () => searchGlobalWorkspace(query, pages, improModel, 48, rowsByPage),
    [query, pages, improModel, rowsByPage]
  );

  const handleOpen = (item: GlobalSearchItem) => {
    selectPage(item.targetPageId);
    if (item.targetRowId) {
      openImproDetail(item.targetPageId, item.targetRowId);
    }
  };

  const renderIcon = (kind: GlobalSearchItem['kind']) => {
    if (kind === 'seance') return <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />;
    if (kind === 'exercise') return <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    if (kind === 'participant' || kind === 'group') return <Users className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    if (kind === 'database' || kind === 'row') return <Table2 className="w-4 h-4 text-slate-500 shrink-0" />;
    return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Recherche globale
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Explorez vos exercices Biblimpro, séances, groupes, participants et pages.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par titre, étape, tag, participant ou contenu..."
          aria-label="Rechercher dans l'espace de travail"
          autoFocus
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
        {results.length === 0 ? (
          <div className="py-12 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucun élément ne correspond à cette recherche.
          </div>
        ) : (
          results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleOpen(item)}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4"
            >
              <div className="min-w-0 flex items-center gap-3">
                {renderIcon(item.kind)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-400 shrink-0">
                {KIND_LABELS[item.kind]}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
