import { useEffect, useState } from 'react';
import { ExternalLink, FilePlus, LogIn, RefreshCw, Table2, Upload } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatFirebaseSyncError } from '../services/firebase';
import { buildMainAppUrlFromEmbed } from '../utils/embedMode';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { isImproDatabasePage } from '../utils/improEngine';
import { loadStoredSidebarOpen, saveStoredSidebarOpen } from '../utils/localPersistence';
import { BlockEditor } from './BlockEditor';
import { CommandPalette } from './CommandPalette';
import { DatabaseView } from './DatabaseView';
import { ExploreView } from './ExploreView';
import { ImproDetailPanel } from './ImproDetailPanel';
import { ImproPrepareView } from './ImproPrepareView';
import { ImproStatsView } from './ImproStatsView';
import { ImproTimelineView } from './ImproTimelineView';
import { LiveAnimationModal } from './LiveAnimationModal';
import { NotionImportView } from './NotionImportView';
import { NotionSyncModal } from './NotionSyncModal';
import { RowDetailPanel } from './RowDetailPanel';
import { SearchView } from './SearchView';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TrashView } from './TrashView';

export function WorkspaceLayout() {
  const {
    user,
    syncStatus,
    authError,
    signInGoogle,
    retryCloudSync,
    pages,
    activePage,
    mainView,
    embedTarget,
    embedSnapshotLoading,
    embedSnapshotError,
    setMainView,
    createPage,
    improDetailTarget,
    improModel,
    improLoading,
    liveSessionId,
    closeImproDetail,
  } = useWorkspace();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState<boolean>(() =>
    loadStoredSidebarOpen()
  );

  useEffect(() => {
    saveStoredSidebarOpen(desktopSidebarOpen);
  }, [desktopSidebarOpen]);

  useEffect(() => {
    if (embedTarget !== null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setDesktopSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [embedTarget]);

  if (embedTarget === 'exercices') {
    const exercicesPage =
      pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed) ?? null;
    const mainAppUrl =
      typeof window !== 'undefined' ? buildMainAppUrlFromEmbed(window.location.href) : '/';

    return (
      <div className="h-screen w-full flex flex-col lg:flex-row bg-stone-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 overflow-hidden">
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {exercicesPage ? (
            <DatabaseView page={exercicesPage} embedMode />
          ) : embedSnapshotLoading || improLoading ? (
            <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-500 dark:text-slate-400">
              Chargement de la dernière sauvegarde cloud…
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 text-center space-y-3 shadow-sm">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {embedSnapshotError ?? 'Tableau Exercices introuvable.'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Générez ou copiez un lien embed synchronisé depuis la page Exercices en étant connecté, ou connectez-vous ici pour charger votre espace cloud.
                </p>
                {authError && (
                  <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg px-3 py-2">
                    {formatFirebaseSyncError(authError)}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {user && syncStatus === 'error' ? (
                    <button
                      type="button"
                      onClick={() => void retryCloudSync()}
                      className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Réessayer la connexion</span>
                    </button>
                  ) : (
                    !user && (
                      <button
                        type="button"
                        onClick={() => void signInGoogle()}
                        className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Se connecter avec Google</span>
                      </button>
                    )
                  )}
                  <a
                    href={mainAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ouvrir l’application</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </main>

        {improDetailTarget && (
          <>
            <div className="hidden lg:flex lg:h-full shrink-0">
              {isImproDatabasePage(improDetailTarget.pageId) && improModel.ready ? (
                <ImproDetailPanel />
              ) : (
                <RowDetailPanel />
              )}
            </div>
            <div
              className="lg:hidden fixed inset-0 z-[60] flex justify-end bg-slate-950/35"
              onClick={closeImproDetail}
            >
              <div
                className="w-full max-w-md h-full flex shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {isImproDatabasePage(improDetailTarget.pageId) && improModel.ready ? (
                  <ImproDetailPanel />
                ) : (
                  <RowDetailPanel />
                )}
              </div>
            </div>
          </>
        )}

        <LiveAnimationModal />
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-stone-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 overflow-hidden">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        desktopOpen={desktopSidebarOpen}
        onToggleDesktop={() => setDesktopSidebarOpen((prev) => !prev)}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopBar
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          desktopSidebarOpen={desktopSidebarOpen}
          onToggleDesktopSidebar={() => setDesktopSidebarOpen((prev) => !prev)}
        />

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          <main
            className={
              mainView === 'explore'
                ? 'flex-1 min-w-0 min-h-0 h-full overflow-hidden'
                : 'flex-1 min-w-0 overflow-y-auto'
            }
          >
            {mainView === 'chronology' ? (
              <ImproTimelineView />
            ) : mainView === 'prepare' ? (
              <ImproPrepareView />
            ) : mainView === 'explore' ? (
              <ExploreView />
            ) : mainView === 'stats' ? (
              <ImproStatsView />
            ) : mainView === 'import' ? (
              <NotionImportView />
            ) : mainView === 'trash' ? (
              <TrashView />
            ) : mainView === 'search' ? (
              <SearchView />
            ) : activePage ? (
              activePage.type === 'database' ? (
                <DatabaseView page={activePage} />
              ) : (
                <BlockEditor page={activePage} />
              )
            ) : (
              <div className="max-w-md mx-auto py-24 px-6 text-center space-y-5">
                <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Aucune page ouverte
                </h1>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void createPage('document', null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    <span>Nouvelle page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void createPage('database', null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Nouvelle base</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMainView('import')}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importer Notion</span>
                  </button>
                </div>
              </div>
            )}
          </main>

          {improDetailTarget && !liveSessionId &&
            (isImproDatabasePage(improDetailTarget.pageId) && improModel.ready ? (
              <ImproDetailPanel />
            ) : (
              <RowDetailPanel />
            ))}
        </div>
      </div>

      <CommandPalette />
      <LiveAnimationModal />
      <NotionSyncModal />

      {improDetailTarget && liveSessionId && (
        <div
          className="fixed inset-0 z-[60] flex items-end lg:items-stretch lg:justify-end bg-slate-950/40"
          onClick={closeImproDetail}
        >
          <div
            className="w-full lg:w-auto flex lg:h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {isImproDatabasePage(improDetailTarget.pageId) && improModel.ready ? (
              <ImproDetailPanel />
            ) : (
              <RowDetailPanel />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
