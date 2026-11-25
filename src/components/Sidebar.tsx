import { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Compass,
  FilePlus,
  FileText,
  ListChecks,
  LogIn,
  LogOut,
  Moon,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Star,
  Sun,
  Table2,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatFirebaseSyncError } from '../services/firebase';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { isImproDatabasePage } from '../utils/improEngine';
import { buildPageTree, type PageTreeNode } from '../utils/treeUtils';

const PLACEHOLDER_SYMBOLS = new Set(['', '▤', '◷', '◫', '◉', '⊞']);

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
}

export function Sidebar({ isOpen, onCloseMobile, desktopOpen, onToggleDesktop }: SidebarProps) {
  const {
    user,
    syncStatus,
    authError,
    theme,
    toggleTheme,
    signInGoogle,
    retryCloudSync,
    signOutUser,
    pages,
    rowsByPage,
    improModel,
    activePageId,
    mainView,
    setMainView,
    selectPage,
    createPage,
    setCommandPaletteOpen,
  } = useWorkspace();

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [notesOpen, setNotesOpen] = useState(true);

  const nonImproPages = useMemo(
    () =>
      pages.filter(
        (p) => !isImproDatabasePage(p.id) && p.parentId !== IMPRO_DB_IDS.exercices
      ),
    [pages]
  );

  const tree = useMemo(() => buildPageTree(nonImproPages), [nonImproPages]);
  const favorites = useMemo(
    () => pages.filter((p) => !isImproDatabasePage(p.id) && p.isFavorite && !p.isTrashed),
    [pages]
  );
  const trashedCount = useMemo(
    () => pages.filter((p) => p.isTrashed).length,
    [pages]
  );

  const improDbItems = [
    { id: IMPRO_DB_IDS.exercices, label: 'Biblimpro', icon: BookOpen },
    { id: IMPRO_DB_IDS.seances, label: 'Séances', icon: Calendar },
    { id: IMPRO_DB_IDS.groupes, label: 'Groupes', icon: Table2 },
    { id: IMPRO_DB_IDS.participants, label: 'Participants', icon: Users },
  ];

  const toggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectPage = (id: string) => {
    selectPage(id);
    onCloseMobile();
  };

  const renderTreeNode = (node: PageTreeNode) => {
    const { page, children, depth } = node;
    const isActive = mainView === 'page' && activePageId === page.id;
    const isExpanded = !collapsedIds.has(page.id);
    const hasChildren = children.length > 0;

    return (
      <div key={page.id}>
        <div
          className={`group flex items-center gap-1 rounded-lg pr-1.5 py-1 text-sm transition-colors ${
            isActive
              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            onClick={() => toggleExpand(page.id)}
            aria-label={isExpanded ? `Replier ${page.title}` : `Déplier ${page.title}`}
            className={`w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 ${
              hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelectPage(page.id)}
            className="flex-1 min-w-0 flex items-center gap-2 text-left py-0.5 truncate"
          >
            {page.icon && !PLACEHOLDER_SYMBOLS.has(page.icon) ? (
              <span className="w-4 h-4 flex items-center justify-center shrink-0 text-sm leading-none">
                {page.icon}
              </span>
            ) : page.type === 'database' ? (
              <Table2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
            ) : (
              <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
            )}
            <span className="truncate">{page.title || 'Sans titre'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              void createPage('document', page.id);
              onCloseMobile();
            }}
            aria-label={`Ajouter une sous-page dans ${page.title || 'Sans titre'}`}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700 shrink-0 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div>{children.map((child) => renderTreeNode(child))}</div>
        )}
      </div>
    );
  };

  const syncLabel =
    syncStatus === 'synced'
      ? 'Synchronisé'
      : syncStatus === 'syncing'
        ? 'Synchronisation'
        : syncStatus === 'error'
          ? 'Erreur synchro'
          : 'Sauvegarde locale';

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={onCloseMobile}
          className="fixed inset-0 z-20 bg-slate-950/35 lg:hidden"
        />
      )}

      <aside
        aria-label="Navigation espace de travail"
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-hidden bg-stone-100/80 dark:bg-[#0D1320] border-r border-slate-200 dark:border-slate-800/90 transition-[transform,width] duration-150 lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${desktopOpen ? 'lg:w-64' : 'lg:w-0 lg:border-r-0 lg:pointer-events-none'}`}
      >
        <div className="w-64 h-full flex flex-col">
        {/* En-tête */}
        <div className="h-12 px-3.5 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/90 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/favicon.svg?v=1"
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              className="w-6 h-6 shrink-0 rounded-md"
            />
            <span className="font-display font-bold text-base tracking-tight text-slate-950 dark:text-white whitespace-nowrap truncate">
              FlowNote
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onToggleDesktop}
              title="Replier le panneau latéral (⌘\)"
              aria-label="Replier le panneau latéral"
              className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Fermer la barre latérale"
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bouton palette rapide Cmd+K */}
        <div className="px-3 pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setCommandPaletteOpen(true);
              onCloseMobile();
            }}
            className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 flex items-center justify-between gap-2 transition-colors"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>Accès rapide…</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400 shrink-0">⌘K</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-5">
          {/* Atelier Impro */}
          <div className="space-y-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
              Atelier Impro
            </div>
            <button
              type="button"
              onClick={() => {
                setMainView('chronology');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                mainView === 'chronology'
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 opacity-75" />
                <span>Chronologie</span>
              </span>
              {improModel.ready && (
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  {improModel.realizedSeances.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMainView('prepare');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                mainView === 'prepare'
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 shrink-0 opacity-75" />
                <span>Préparer</span>
              </span>
              {improModel.plannedSeances.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400 font-medium">
                  {improModel.plannedSeances.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMainView('explore');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                mainView === 'explore'
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <Compass className="w-4 h-4 shrink-0 opacity-75" />
                <span>Explore</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainView('stats');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                mainView === 'stats'
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0 opacity-75" />
                <span>Statistiques</span>
              </span>
            </button>
          </div>

          {/* Bases Impro */}
          <div className="space-y-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
              Bases relationnelles
            </div>
            {improDbItems.map((item) => {
              const Icon = item.icon;
              const page = pages.find((p) => p.id === item.id && !p.isTrashed);
              const count = rowsByPage[item.id]?.length ?? 0;
              const isActive = mainView === 'page' && activePageId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!page}
                  onClick={() => {
                    if (page) handleSelectPage(page.id);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap disabled:opacity-45 ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {page?.icon && !PLACEHOLDER_SYMBOLS.has(page.icon) ? (
                      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-sm leading-none">
                        {page.icon}
                      </span>
                    ) : (
                      <Icon className="w-4 h-4 shrink-0 opacity-75" />
                    )}
                    <span>{item.label}</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Espace Notes & Pages */}
          <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2">
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              <span>Espace Notes</span>
              {notesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {notesOpen && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-1.5 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        void createPage('document', null);
                        onCloseMobile();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors whitespace-nowrap"
                    >
                      <FilePlus className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span>Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void createPage('database', null);
                        onCloseMobile();
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors whitespace-nowrap"
                    >
                      <Table2 className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span>Base</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMainView('search');
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                      mainView === 'search'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Search className="w-4 h-4 shrink-0 opacity-75" />
                    <span>Rechercher</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMainView('import');
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                      mainView === 'import'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Upload className="w-4 h-4 shrink-0 opacity-75" />
                    <span>Importer / Sauvegarde</span>
                  </button>
                </div>

                {favorites.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-2.5 pb-0.5 text-[11px] font-medium text-slate-400">
                      Favoris
                    </div>
                    {favorites.map((page) => {
                      const isActive = mainView === 'page' && activePageId === page.id;
                      return (
                        <button
                          key={`fav_${page.id}`}
                          type="button"
                          onClick={() => handleSelectPage(page.id)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                            isActive
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          {page.icon && !PLACEHOLDER_SYMBOLS.has(page.icon) ? (
                            <span className="w-4 h-4 flex items-center justify-center shrink-0 text-sm leading-none">
                              {page.icon}
                            </span>
                          ) : (
                            <Star className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                          )}
                          <span className="truncate">{page.title || 'Sans titre'}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {tree.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-2.5 pb-0.5 flex items-center justify-between text-[11px] font-medium text-slate-400">
                      <span>Pages</span>
                      <span className="font-mono tabular-nums">
                        {nonImproPages.filter((p) => !p.isTrashed).length}
                      </span>
                    </div>
                    {tree.map((node) => renderTreeNode(node))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMainView('trash');
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                    mainView === 'trash'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 shrink-0 opacity-75" />
                    <span>Corbeille</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">{trashedCount}</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Pied de barre : Synchro & Compte Firebase */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/90 space-y-2 shrink-0 bg-stone-100/60 dark:bg-[#0B101B]">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              ) : syncStatus === 'synced' ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CloudOff className="w-3.5 h-3.5" />
              )}
              <span>{syncLabel}</span>
            </span>
            <span className="font-mono text-[11px]">{user ? 'Cloud' : 'Local'}</span>
          </div>

          {user ? (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate min-w-0">
                {user.displayName || user.email}
              </p>
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Déconnexion"
                className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Quitter</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInGoogle()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span>Synchroniser avec Google</span>
            </button>
          )}

          {authError && (
            <div className="space-y-1.5">
              <p className="text-xs text-red-600 dark:text-red-400 break-words">
                {formatFirebaseSyncError(authError)}
              </p>
              {user && syncStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => void retryCloudSync()}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Réessayer la synchronisation</span>
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </aside>
    </>
  );
}
