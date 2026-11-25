import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  Compass,
  FilePlus,
  FileText,
  ListChecks,
  Moon,
  Search,
  Sparkles,
  Sun,
  Table2,
  Users,
  X,
} from 'lucide-react';
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

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    pages,
    rowsByPage,
    improModel,
    selectPage,
    openImproDetail,
    setMainView,
    createPage,
    theme,
    toggleTheme,
  } = useWorkspace();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [commandPaletteOpen]);

  const results = useMemo(
    () => searchGlobalWorkspace(query, pages, improModel, 18, rowsByPage),
    [query, pages, improModel, rowsByPage]
  );

  const quickActions = useMemo(
    () => [
      {
        id: 'act_chronology',
        label: 'Aller à Chronologie',
        icon: Clock,
        run: () => setMainView('chronology'),
      },
      {
        id: 'act_prepare',
        label: 'Aller à Préparer une séance',
        icon: ListChecks,
        run: () => setMainView('prepare'),
      },
      {
        id: 'act_explore',
        label: 'Aller à Explore (Conseiller IA)',
        icon: Compass,
        run: () => setMainView('explore'),
      },
      {
        id: 'act_stats',
        label: 'Aller à Statistiques',
        icon: BarChart3,
        run: () => setMainView('stats'),
      },
      {
        id: 'act_new_page',
        label: 'Créer une nouvelle page',
        icon: FilePlus,
        run: () => void createPage('document', null),
      },
      {
        id: 'act_new_db',
        label: 'Créer une nouvelle base de données',
        icon: Table2,
        run: () => void createPage('database', null),
      },
      {
        id: 'act_theme',
        label: theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => toggleTheme(),
      },
    ],
    [setMainView, createPage, theme, toggleTheme]
  );

  const visibleActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter((a) => a.label.toLowerCase().includes(q));
  }, [query, quickActions]);

  const totalItems = results.length + visibleActions.length;

  useEffect(() => {
    setSelectedIndex((prev) => (totalItems === 0 ? 0 : Math.min(prev, totalItems - 1)));
  }, [totalItems]);

  if (!commandPaletteOpen) return null;

  const activateResult = (item: GlobalSearchItem) => {
    if (item.targetRowId) {
      selectPage(item.targetPageId);
      openImproDetail(item.targetPageId, item.targetRowId);
    } else {
      selectPage(item.targetPageId);
    }
    setCommandPaletteOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalItems > 0) setSelectedIndex((prev) => (prev + 1) % totalItems);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalItems > 0) setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < results.length) {
        const item = results[selectedIndex];
        if (item) activateResult(item);
      } else {
        const act = visibleActions[selectedIndex - results.length];
        if (act) {
          act.run();
          setCommandPaletteOpen(false);
        }
      }
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-950/45 backdrop-blur-[2px]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher un exercice, une séance, un participant, une page..."
            aria-label="Recherche rapide globale"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            aria-label="Fermer la recherche rapide"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length > 0 && (
            <div className="px-2 pb-2">
              <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                Résultats ({results.length})
              </div>
              <div className="space-y-0.5">
                {results.map((item, idx) => {
                  const isActive = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => activateResult(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {renderIcon(item.kind)}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                        {KIND_LABELS[item.kind]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {visibleActions.length > 0 && (
            <div className="px-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="px-2.5 py-1 text-[11px] font-medium text-slate-400">
                Actions rapides
              </div>
              <div className="space-y-0.5">
                {visibleActions.map((act, idx) => {
                  const globalIdx = results.length + idx;
                  const isActive = globalIdx === selectedIndex;
                  const Icon = act.icon;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => {
                        act.run();
                        setCommandPaletteOpen(false);
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{act.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {totalItems === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Aucun résultat pour « {query} ».
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between text-[11px] text-slate-400">
          <span>↑↓ pour naviguer · Entrée pour ouvrir</span>
          <span>Échap pour fermer</span>
        </div>
      </div>
    </div>
  );
}
