import type { DatabaseRow, MainViewMode, WorkspacePage } from '../types/workspace';
import { getPrimaryColumn } from './columnOrder';

export interface DetailOriginContext {
  mainView: MainViewMode;
  activePageId: string | null;
  mainScrollTop: number;
  label: string;
}

export interface DetailTrailEntry {
  pageId: string;
  rowId: string;
  focusTick?: number;
  panelScrollTop?: number;
}

export function getOriginLabel(
  origin: Pick<DetailOriginContext, 'mainView' | 'activePageId'>,
  pages: WorkspacePage[]
): string {
  switch (origin.mainView) {
    case 'chronology':
      return 'Chronologie';
    case 'prepare':
      return 'Préparer';
    case 'stats':
      return 'Statistiques';
    case 'search':
      return 'Recherche';
    case 'trash':
      return 'Corbeille';
    case 'import':
      return 'Importer';
    case 'page': {
      const page = origin.activePageId
        ? pages.find((p) => p.id === origin.activePageId && !p.isTrashed)
        : null;
      return page?.title?.trim() || 'Page';
    }
    default:
      return 'Espace';
  }
}

export function resolveTrailEntryLabel(
  entry: Pick<DetailTrailEntry, 'pageId' | 'rowId'>,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>
): string {
  const page = pages.find((p) => p.id === entry.pageId);
  const rows = rowsByPage[entry.pageId] ?? [];
  const row = rows.find((r) => r.id === entry.rowId);
  if (!row) return 'Fiche';
  const primaryCol = page?.columns ? getPrimaryColumn(page.columns) : undefined;
  const raw = primaryCol ? row.cells[primaryCol.id] : Object.values(row.cells)[0];
  const text = typeof raw === 'string' ? raw.trim() : raw !== undefined && raw !== null ? String(raw).trim() : '';
  return text || 'Sans titre';
}

export function pushDetailTrailEntry(
  trail: DetailTrailEntry[],
  next: DetailTrailEntry,
  currentPanelScrollTop = 0
): DetailTrailEntry[] {
  if (trail.length === 0) {
    return [{ ...next, panelScrollTop: 0 }];
  }

  const existingIdx = trail.findIndex(
    (item) => item.pageId === next.pageId && item.rowId === next.rowId
  );

  if (existingIdx !== -1) {
    const truncated = trail.slice(0, existingIdx + 1);
    const target = truncated[existingIdx];
    truncated[existingIdx] = {
      ...target,
      ...(next.focusTick ? { focusTick: next.focusTick } : {}),
    };
    return truncated;
  }

  const updated = trail.map((item, idx) =>
    idx === trail.length - 1 ? { ...item, panelScrollTop: currentPanelScrollTop } : item
  );
  updated.push({ ...next, panelScrollTop: 0 });
  return updated;
}

export function truncateDetailTrailTo(
  trail: DetailTrailEntry[],
  index: number
): { nextTrail: DetailTrailEntry[]; restoredScrollTop: number } {
  if (trail.length === 0) {
    return { nextTrail: [], restoredScrollTop: 0 };
  }
  const safeIdx = Math.max(0, Math.min(index, trail.length - 1));
  const nextTrail = trail.slice(0, safeIdx + 1);
  return {
    nextTrail,
    restoredScrollTop: nextTrail[safeIdx]?.panelScrollTop ?? 0,
  };
}
