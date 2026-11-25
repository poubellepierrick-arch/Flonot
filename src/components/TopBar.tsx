import { useState } from 'react';
import { ChevronRight, Download, Menu, PanelLeftOpen, Search, Star, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { DatabaseColumn, DatabaseRow } from '../types/workspace';
import { isImproDatabasePage } from '../utils/improEngine';
import { exportPageToMarkdown } from '../utils/notionImporter';
import { getPageBreadcrumbs } from '../utils/treeUtils';
import { EnvSwitchButton } from './EnvSwitchButton';

function escapeCsvCell(raw: string): string {
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function exportDatabaseToCsv(columns: DatabaseColumn[], rows: DatabaseRow[]): string {
  const header = columns.map((c) => escapeCsvCell(c.name)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const v = row.cells[col.id];
        if (Array.isArray(v)) return escapeCsvCell(v.join(', '));
        if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
        return escapeCsvCell(String(v ?? ''));
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
}

interface TopBarProps {
  onOpenMobileSidebar: () => void;
  desktopSidebarOpen: boolean;
  onToggleDesktopSidebar: () => void;
}

export function TopBar({
  onOpenMobileSidebar,
  desktopSidebarOpen,
  onToggleDesktopSidebar,
}: TopBarProps) {
  const {
    pages,
    rowsByPage,
    activePage,
    mainView,
    selectPage,
    toggleFavorite,
    moveToTrash,
    pendingLocalDraftsCount,
    migrateLocalPagesToCloud,
    dismissLocalMigration,
    setCommandPaletteOpen,
  } = useWorkspace();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const breadcrumbs = activePage ? getPageBreadcrumbs(pages, activePage.id) : [];
  const isCoreImproDb = activePage ? isImproDatabasePage(activePage.id) : false;

  const viewTitle =
    mainView === 'chronology'
      ? 'Chronologie des séances'
      : mainView === 'prepare'
        ? 'Préparer une séance'
        : mainView === 'explore'
          ? 'Explore · Conseiller IA'
          : mainView === 'stats'
            ? 'Statistiques & Analyse'
            : mainView === 'import'
              ? 'Importer & Sauvegarde'
              : mainView === 'trash'
                ? 'Corbeille'
                : mainView === 'search'
                  ? 'Recherche'
                  : null;

  const handleExport = () => {
    if (!activePage) return;
    const isDb = activePage.type === 'database';
    const content = isDb
      ? exportDatabaseToCsv(activePage.columns ?? [], rowsByPage[activePage.id] ?? [])
      : exportPageToMarkdown(activePage);
    const ext = isDb ? 'csv' : 'md';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(activePage.title || 'page').replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_')}.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shrink-0">
      <header className="h-12 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B0F19] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Ouvrir le menu"
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          {!desktopSidebarOpen && (
            <button
              type="button"
              onClick={onToggleDesktopSidebar}
              title="Déplier le panneau latéral (⌘\)"
              aria-label="Déplier le panneau latéral"
              className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}

          {viewTitle ? (
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {viewTitle}
            </span>
          ) : breadcrumbs.length > 0 ? (
            <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 min-w-0 text-sm">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const hasCustomEmoji =
                  crumb.icon && !['▤', '◷', '◫', '◉', '⊞'].includes(crumb.icon);
                return (
                  <div key={crumb.id} className="flex items-center gap-1 min-w-0">
                    {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                    <button
                      type="button"
                      onClick={() => selectPage(crumb.id)}
                      className={`px-1.5 py-0.5 rounded-md truncate max-w-[210px] inline-flex items-center gap-1.5 transition-colors ${
                        isLast
                          ? 'text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {hasCustomEmoji && <span className="text-sm leading-none shrink-0">{crumb.icon}</span>}
                      <span className="truncate">{crumb.title || 'Sans titre'}</span>
                    </button>
                  </div>
                );
              })}
            </nav>
          ) : (
            <span className="text-sm text-slate-500">Espace de travail</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <EnvSwitchButton />

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label="Ouvrir la recherche rapide"
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Rechercher</span>
            <span className="hidden md:inline font-mono text-[10px] text-slate-400">⌘K</span>
          </button>

          {mainView === 'page' && activePage && (
            <>
              <button
                type="button"
                onClick={() => void toggleFavorite(activePage.id)}
                aria-label={activePage.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  activePage.isFavorite
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Favori</span>
              </button>

              <button
                type="button"
                onClick={handleExport}
                aria-label="Exporter la page"
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exporter</span>
              </button>

              {!isCoreImproDb &&
                (confirmDelete ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        void moveToTrash(activePage.id);
                        setConfirmDelete(false);
                      }}
                      className="h-8 px-2.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 whitespace-nowrap shrink-0"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Supprimer la page"
                    className="h-8 px-2.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Supprimer</span>
                  </button>
                ))}
            </>
          )}
        </div>
      </header>

      {pendingLocalDraftsCount > 0 && (
        <div className="px-4 sm:px-6 py-2 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-200/70 dark:border-indigo-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-700 dark:text-slate-300">
            <span className="tabular-nums font-semibold">{pendingLocalDraftsCount}</span> pages locales prêtes à être transférées vers le cloud
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void migrateLocalPagesToCloud()}
              className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 whitespace-nowrap"
            >
              Transférer
            </button>
            <button
              type="button"
              onClick={dismissLocalMigration}
              className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
