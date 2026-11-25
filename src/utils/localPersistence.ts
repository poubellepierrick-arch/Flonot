import type {
  DatabaseRow,
  ExploreThread,
  ThemeMode,
  WorkspacePage,
  WorkspaceViewSettingsState,
} from '../types/workspace';
import {
  createDefaultWorkspaceViewSettings,
  sanitizeWorkspaceViewSettings,
} from './viewSettings';

export const LOCAL_WORKSPACE_STORAGE_KEY = 'flownote_workspace_v2';
export const LOCAL_THEME_STORAGE_KEY = 'flownote_theme_v2';
export const LOCAL_TABLE_ORDERS_KEY = 'flownote_table_orders_v2';
export const LOCAL_EXPLORE_THREADS_KEY = 'flownote_explore_threads_v1';
export const LOCAL_VIEW_SETTINGS_KEY = 'flownote_view_settings_v1';

export interface LocalWorkspaceSnapshot {
  version: 2;
  savedAt: string;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  activePageId?: string | null;
}

export function serializeWorkspaceSnapshot(
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  activePageId?: string | null
): string {
  const payload: LocalWorkspaceSnapshot = {
    version: 2,
    savedAt: new Date().toISOString(),
    pages,
    rowsByPage,
    activePageId: activePageId ?? null,
  };
  return JSON.stringify(payload);
}

export function parseWorkspaceSnapshot(raw: string | null): LocalWorkspaceSnapshot | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalWorkspaceSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.pages) || typeof parsed.rowsByPage !== 'object' || !parsed.rowsByPage) {
      return null;
    }
    const validPages = parsed.pages.filter(
      (p): p is WorkspacePage =>
        Boolean(p && typeof p === 'object' && typeof p.id === 'string' && typeof p.title === 'string')
    );
    if (validPages.length === 0) return null;

    const cleanRowsByPage: Record<string, DatabaseRow[]> = {};
    for (const [pageId, list] of Object.entries(parsed.rowsByPage)) {
      if (Array.isArray(list)) {
        cleanRowsByPage[pageId] = list.filter(
          (r): r is DatabaseRow =>
            Boolean(r && typeof r === 'object' && typeof r.id === 'string' && typeof r.cells === 'object')
        );
      }
    }

    return {
      version: 2,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      pages: validPages,
      rowsByPage: cleanRowsByPage,
      activePageId: typeof parsed.activePageId === 'string' ? parsed.activePageId : null,
    };
  } catch {
    return null;
  }
}

export function loadLocalWorkspaceFromStorage(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): LocalWorkspaceSnapshot | null {
  if (!storage) return null;
  try {
    return parseWorkspaceSnapshot(storage.getItem(LOCAL_WORKSPACE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLocalWorkspaceToStorage(
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  activePageId?: string | null,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      LOCAL_WORKSPACE_STORAGE_KEY,
      serializeWorkspaceSnapshot(pages, rowsByPage, activePageId)
    );
    return true;
  } catch {
    return false;
  }
}

export function clearLocalWorkspaceStorage(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.removeItem(LOCAL_WORKSPACE_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadStoredTheme(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): ThemeMode {
  if (!storage) return 'light';
  try {
    const val = storage.getItem(LOCAL_THEME_STORAGE_KEY);
    return val === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveStoredTheme(
  theme: ThemeMode,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export const LOCAL_SIDEBAR_OPEN_KEY = 'flownote_desktop_sidebar_open_v1';
export const LOCAL_DIRTY_FLAG_KEY = 'flownote_local_dirty_v1';

export function loadStoredTableOrders(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): Record<string, string[]> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LOCAL_TABLE_ORDERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map(String);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStoredTableOrders(
  orders: Record<string, string[]>,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_TABLE_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // ignore
  }
}

export function loadStoredSidebarOpen(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): boolean {
  if (!storage) return true;
  try {
    const val = storage.getItem(LOCAL_SIDEBAR_OPEN_KEY);
    return val === 'false' ? false : true;
  } catch {
    return true;
  }
}

export function saveStoredSidebarOpen(
  open: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_SIDEBAR_OPEN_KEY, open ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function loadStoredLocalDirtyFlag(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(LOCAL_DIRTY_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveStoredLocalDirtyFlag(
  dirty: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    if (dirty) storage.setItem(LOCAL_DIRTY_FLAG_KEY, '1');
    else storage.removeItem(LOCAL_DIRTY_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function loadLocalExploreThreads(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): ExploreThread[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_EXPLORE_THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ExploreThread =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string' && Array.isArray(item.messages))
    );
  } catch {
    return [];
  }
}

export function saveLocalExploreThreads(
  threads: ExploreThread[],
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_EXPLORE_THREADS_KEY, JSON.stringify(threads.slice(0, 40)));
  } catch {
    // ignore
  }
}

export function loadStoredViewSettings(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): WorkspaceViewSettingsState {
  if (!storage) return createDefaultWorkspaceViewSettings();
  try {
    const raw = storage.getItem(LOCAL_VIEW_SETTINGS_KEY);
    if (!raw) return createDefaultWorkspaceViewSettings();
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeWorkspaceViewSettings(parsed);
  } catch {
    return createDefaultWorkspaceViewSettings();
  }
}

export function saveStoredViewSettings(
  settings: WorkspaceViewSettingsState,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCAL_VIEW_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredViewSettings(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.removeItem(LOCAL_VIEW_SETTINGS_KEY);
  } catch {
    // ignore
  }
}


