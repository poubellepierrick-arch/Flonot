import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  ExploreMessage,
  ExploreModelId,
  ExploreThread,
  ExploreTier,
  RowComment,
  ThemeMode,
  ViewSettingKind,
  WorkspacePage,
} from '../types/workspace';
import { generateId } from '../utils/id';
import { isValidEmbedToken } from '../utils/embedMode';
import type { ImportedPageDraft } from '../utils/notionImporter';
import { materializeImportedDrafts } from '../utils/notionImportMaterializer';
import { createSeedWorkspace } from '../utils/seedWorkspace';
import {
  fetchAndBuildImproEcosystem,
  IMPRO_DB_IDS,
  type ImproEcosystemDataset,
} from '../utils/improCsvLoader';
import {
  sanitizeDatabaseViewSettings,
  sanitizeExploreViewSettings,
  sanitizeNavViewSettings,
  sanitizePrepareViewSettings,
  sanitizeSearchViewSettings,
  sanitizeStatsViewSettings,
  sanitizeTableColumnOrdersMap,
  sanitizeTimelineViewSettings,
} from '../utils/viewSettings';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  buildRestDeleteWrite,
  buildRestSetWrite,
  buildRestUpdateWrite,
  FirestoreRestError,
  isWebChannelTransportError,
  restCommitWrites,
  restGetDocument,
  restRunCollectionQuery,
  type RestWriteOp,
} from './firestoreRest';

let useFirestoreRestFallback = false;

export function setFirestoreRestFallback(enabled: boolean): void {
  useFirestoreRestFallback = enabled;
}

export function isFirestoreRestFallbackActive(): boolean {
  return useFirestoreRestFallback;
}

async function runSdkOrRest<T>(sdkFn: () => Promise<T>, restFn: () => Promise<T>): Promise<T> {
  if (useFirestoreRestFallback) {
    return restFn();
  }
  try {
    return await sdkFn();
  } catch (err) {
    if (isWebChannelTransportError(err)) {
      useFirestoreRestFallback = true;
      return restFn();
    }
    throw err;
  }
}

function subscribeWithRestFallback<T>(params: {
  path: string;
  sdkQuery: ReturnType<typeof query>;
  parentRelativePath: string;
  collectionId: string;
  ownerId: string;
  mapDocs: (items: Array<{ id: string; data: Record<string, unknown> }>) => T;
  onData: (value: T) => void;
}): Unsubscribe {
  const { path, sdkQuery, parentRelativePath, collectionId, ownerId, mapDocs, onData } = params;
  let cancelled = false;
  let unsubSdk: Unsubscribe | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityHandler: (() => void) | null = null;
  let restController: AbortController | null = null;
  let pollingStarted = false;
  let hasLoadedOnce = false;
  let lastFetchAt = 0;

  const startRestPolling = () => {
    if (cancelled || pollingStarted) return;
    pollingStarted = true;
    if (unsubSdk) {
      unsubSdk();
      unsubSdk = null;
    }
    restController = new AbortController();

    const fetchOnce = async () => {
      if (cancelled) return;
      lastFetchAt = Date.now();
      try {
        const items = await restRunCollectionQuery(parentRelativePath, collectionId, ownerId, {
          signal: restController?.signal,
        });
        if (cancelled) return;
        hasLoadedOnce = true;
        onData(mapDocs(items));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!hasLoadedOnce && !isWebChannelTransportError(err)) {
          try {
            handleFirestoreError(err, OperationType.LIST, path);
          } catch {
            // Journalisé par handleFirestoreError
          }
        }
      }
    };

    void fetchOnce();

    pollTimer = setInterval(() => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchOnce();
    }, 15_000);

    if (typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (cancelled || document.visibilityState !== 'visible') return;
        if (Date.now() - lastFetchAt < 4_000) return;
        void fetchOnce();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  };

  if (useFirestoreRestFallback) {
    startRestPolling();
  } else {
    let failedSynchronously = false;
    const sub = onSnapshot(
      sdkQuery,
      (snapshot) => {
        if (cancelled) return;
        hasLoadedOnce = true;
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, unknown>,
        }));
        onData(mapDocs(items));
      },
      (error) => {
        if (cancelled) return;
        if (isWebChannelTransportError(error)) {
          useFirestoreRestFallback = true;
          failedSynchronously = true;
          startRestPolling();
          return;
        }
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    if (failedSynchronously) {
      sub();
    } else {
      unsubSdk = sub;
    }
  }

  return () => {
    cancelled = true;
    if (unsubSdk) {
      unsubSdk();
      unsubSdk = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (restController) {
      restController.abort();
      restController = null;
    }
  };
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || generateId(fallbackPrefix);
}

function sanitizeBlocks(blocks: BlockItem[]): BlockItem[] {
  return blocks.slice(0, 400).map((b, idx) => {
    const clean: BlockItem = {
      id: sanitizeId(b.id || `blk_${idx}`, 'blk'),
      type: b.type,
      content: String(b.content ?? '').slice(0, 20000),
    };
    if (typeof b.checked === 'boolean') clean.checked = b.checked;
    if (typeof b.language === 'string' && b.language) {
      clean.language = b.language.slice(0, 40);
    }
    if (typeof b.icon === 'string' && b.icon) {
      clean.icon = b.icon.slice(0, 16);
    }
    if (typeof b.isOpen === 'boolean') clean.isOpen = b.isOpen;
    if (typeof b.details === 'string') {
      clean.details = b.details.slice(0, 10000);
    }
    if (typeof b.url === 'string' && b.url) {
      clean.url = b.url.slice(0, 2000);
    }
    if (Array.isArray(b.tableRows)) {
      clean.tableRows = b.tableRows.slice(0, 100).map((r) => ({
        cells: Array.isArray(r.cells)
          ? r.cells.slice(0, 20).map((c) => String(c ?? '').slice(0, 1000))
          : [],
      }));
    }
    return clean;
  });
}

function sanitizeRowComments(comments: RowComment[]): RowComment[] {
  return comments
    .filter((c) => c && typeof c.content === 'string' && c.content.trim().length > 0)
    .slice(0, 100)
    .map((c, idx) => ({
      id: sanitizeId(c.id || `cmt_${idx}`, 'cmt'),
      authorName: String(c.authorName || 'Animateur').trim().slice(0, 80) || 'Animateur',
      content: String(c.content).trim().slice(0, 2000),
      createdAt: String(c.createdAt || new Date().toISOString()).slice(0, 64),
    }));
}

const VALID_ROLLUP_FNS = new Set([
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'values',
  'checked_count',
]);

function sanitizeColumns(columns?: DatabaseColumn[]): DatabaseColumn[] | undefined {
  if (!columns) return undefined;
  return columns.slice(0, 100).map((c, idx) => {
    const clean: DatabaseColumn = {
      id: sanitizeId(c.id || `col_${idx}`, 'col').slice(0, 64),
      name: String(c.name || `Colonne ${idx + 1}`).slice(0, 80) || `Colonne ${idx + 1}`,
      type: c.type,
    };
    if (Array.isArray(c.options)) {
      const seen = new Set<string>();
      const opts: string[] = [];
      for (const rawOpt of c.options) {
        const opt = String(rawOpt ?? '').trim().slice(0, 120);
        if (opt && !seen.has(opt)) {
          seen.add(opt);
          opts.push(opt);
          if (opts.length >= 100) break;
        }
      }
      clean.options = opts;
    }
    if (c.relationTargetPageId === null) {
      clean.relationTargetPageId = undefined;
    } else if (typeof c.relationTargetPageId === 'string' && c.relationTargetPageId.trim()) {
      clean.relationTargetPageId = sanitizeId(c.relationTargetPageId, 'page').slice(0, 128);
    }
    if (typeof c.rollupRelationColId === 'string' && c.rollupRelationColId.trim()) {
      clean.rollupRelationColId = sanitizeId(c.rollupRelationColId, 'col').slice(0, 64);
    }
    if (typeof c.rollupTargetColId === 'string' && c.rollupTargetColId.trim()) {
      clean.rollupTargetColId = sanitizeId(c.rollupTargetColId, 'col').slice(0, 64);
    }
    if (c.rollupFn && VALID_ROLLUP_FNS.has(c.rollupFn)) {
      clean.rollupFn = c.rollupFn;
    }
    if (typeof c.formulaExpression === 'string') {
      clean.formulaExpression = c.formulaExpression.slice(0, 2000);
    }
    return clean;
  });
}

function sanitizeSortRules(rules?: DatabaseSortRule[]): DatabaseSortRule[] {
  if (!Array.isArray(rules)) return [];
  const seen = new Set<string>();
  const out: DatabaseSortRule[] = [];
  for (const r of rules) {
    if (!r || typeof r.colId !== 'string') continue;
    const colId = sanitizeId(r.colId, 'col').slice(0, 64);
    if (!colId || seen.has(colId)) continue;
    seen.add(colId);
    out.push({
      colId,
      dir: r.dir === 'desc' ? 'desc' : 'asc',
    });
    if (out.length >= 30) break;
  }
  return out;
}

function sanitizeColumnWidths(widths?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!widths || typeof widths !== 'object') return out;
  for (const [rawKey, rawVal] of Object.entries(widths).slice(0, 100)) {
    const colId = sanitizeId(rawKey, 'col').slice(0, 64);
    if (!colId) continue;
    const num = Number(rawVal);
    if (Number.isFinite(num)) {
      out[colId] = Math.max(46, Math.min(640, Math.round(num)));
    }
  }
  return out;
}

function sanitizeCells(cells: Record<string, CellValue>): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  const entries = Object.entries(cells ?? {}).slice(0, 100);
  for (const [k, v] of entries) {
    const cleanKey = sanitizeId(k, 'col').slice(0, 64);
    if (typeof v === 'boolean') {
      out[cleanKey] = v;
    } else if (typeof v === 'number') {
      out[cleanKey] = Number.isFinite(v) ? v : 0;
    } else if (Array.isArray(v)) {
      out[cleanKey] = v.slice(0, 500).map((item) => String(item ?? '').slice(0, 200));
    } else {
      out[cleanKey] = String(v ?? '').slice(0, 5000);
    }
  }
  return out;
}

function buildPageBaseFields(
  workspaceId: string,
  ownerId: string,
  page: WorkspacePage
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: sanitizeId(page.id, 'page'),
    workspaceId,
    ownerId,
    parentId: page.parentId,
    title: page.title.slice(0, 200),
    icon: page.icon.slice(0, 32),
    type: page.type,
    isFavorite: page.isFavorite,
    isTrashed: page.isTrashed,
    order: page.order,
    source: page.source,
    blocks: sanitizeBlocks(page.blocks),
  };
  if (page.columns) payload.columns = sanitizeColumns(page.columns);
  if (page.activeView) payload.activeView = page.activeView;
  if (page.sortRules && page.sortRules.length > 0) {
    payload.sortRules = sanitizeSortRules(page.sortRules);
  }
  if (page.columnWidths && Object.keys(page.columnWidths).length > 0) {
    payload.columnWidths = sanitizeColumnWidths(page.columnWidths);
  }
  return payload;
}

function buildRowBaseFields(
  workspaceId: string,
  pageId: string,
  ownerId: string,
  row: DatabaseRow
): Record<string, unknown> {
  const rowPayload: Record<string, unknown> = {
    id: sanitizeId(row.id, 'row'),
    pageId,
    workspaceId,
    ownerId,
    order: row.order,
    cells: sanitizeCells(row.cells),
    linkedPageId: row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null,
  };
  if (Array.isArray(row.blocks)) rowPayload.blocks = sanitizeBlocks(row.blocks);
  if (Array.isArray(row.comments)) rowPayload.comments = sanitizeRowComments(row.comments);
  if (typeof row.notionPageId === 'string' && /^[a-fA-F0-9-]+$/.test(row.notionPageId)) {
    rowPayload.notionPageId = row.notionPageId.slice(0, 64);
  }
  if (typeof row.notionSyncedAt === 'string' && row.notionSyncedAt) {
    rowPayload.notionSyncedAt = row.notionSyncedAt.slice(0, 64);
  }
  return rowPayload;
}

async function commitPagesAndRowsChunkedViaRest(
  workspaceId: string,
  ownerId: string,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  createWorkspaceDoc = false,
  user?: User | null
): Promise<void> {
  const writes: RestWriteOp[] = [];
  if (createWorkspaceDoc) {
    writes.push(
      buildRestSetWrite(
        `workspaces/${workspaceId}`,
        {
          id: workspaceId,
          ownerId,
          name: 'Mon espace',
        },
        ['createdAt', 'updatedAt']
      )
    );
  }
  for (const page of pages) {
    writes.push(
      buildRestSetWrite(
        `workspaces/${workspaceId}/pages/${page.id}`,
        buildPageBaseFields(workspaceId, ownerId, page),
        ['createdAt', 'updatedAt']
      )
    );
  }
  for (const page of pages) {
    const rows = rowsByPage[page.id] ?? [];
    for (const row of rows) {
      writes.push(
        buildRestSetWrite(
          `workspaces/${workspaceId}/pages/${page.id}/rows/${row.id}`,
          buildRowBaseFields(workspaceId, page.id, ownerId, row),
          ['createdAt', 'updatedAt']
        )
      );
    }
  }
  await restCommitWrites(writes, { user });
}

async function commitPagesAndRowsChunked(
  workspaceId: string,
  ownerId: string,
  pages: WorkspacePage[],
  rowsByPage: Record<string, DatabaseRow[]>,
  createWorkspaceDoc = false,
  user?: User | null
): Promise<void> {
  return runSdkOrRest(
    async () => {
      let batch = writeBatch(db);
      let opCount = 0;

      const flushIfNeeded = async (force = false) => {
        if (opCount >= 350 || (force && opCount > 0)) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      if (createWorkspaceDoc) {
        const wsRef = doc(db, 'workspaces', workspaceId);
        batch.set(wsRef, {
          id: workspaceId,
          ownerId,
          name: 'Mon espace',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        opCount++;
        await flushIfNeeded();
      }

      for (const page of pages) {
        const pageRef = doc(db, 'workspaces', workspaceId, 'pages', page.id);
        batch.set(pageRef, {
          ...buildPageBaseFields(workspaceId, ownerId, page),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        opCount++;
        await flushIfNeeded();
      }

      for (const page of pages) {
        const rows = rowsByPage[page.id] ?? [];
        for (const row of rows) {
          const rowRef = doc(db, 'workspaces', workspaceId, 'pages', page.id, 'rows', row.id);
          batch.set(rowRef, {
            ...buildRowBaseFields(workspaceId, page.id, ownerId, row),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          opCount++;
          await flushIfNeeded();
        }
      }

      await flushIfNeeded(true);
    },
    () =>
      commitPagesAndRowsChunkedViaRest(
        workspaceId,
        ownerId,
        pages,
        rowsByPage,
        createWorkspaceDoc,
        user
      )
  );
}

export function getWorkspaceIdForUser(uid: string): string {
  return sanitizeId(`ws_${uid}`, 'ws');
}

async function getDocWithNetworkRetry(ref: ReturnType<typeof doc>) {
  try {
    return await getDoc(ref);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes('target id already exists')) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return await getDoc(ref);
    }
    throw err;
  }
}

async function ensureUserAndWorkspaceViaRest(
  user: User,
  uid: string,
  workspaceId: string,
  preferredTheme: ThemeMode
): Promise<{ workspaceId: string; theme: ThemeMode }> {
  const userPath = `users/${uid}`;
  const wsPath = `workspaces/${workspaceId}`;
  let resolvedTheme: ThemeMode = preferredTheme;

  let userSnap: Awaited<ReturnType<typeof restGetDocument>>;
  try {
    userSnap = await restGetDocument(userPath, { withAuth: true, user });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  try {
    if (!userSnap.exists) {
      await restCommitWrites(
        [
          buildRestSetWrite(
            userPath,
            {
              uid,
              displayName: (user.displayName ?? 'Utilisateur').slice(0, 120),
              email: (user.email ?? '').slice(0, 200),
              photoURL: (user.photoURL ?? '').slice(0, 500),
              theme: preferredTheme,
            },
            ['updatedAt'],
            false
          ),
        ],
        { user }
      );
    } else if (userSnap.data.theme === 'dark' || userSnap.data.theme === 'light') {
      resolvedTheme = userSnap.data.theme;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  let wsSnap: Awaited<ReturnType<typeof restGetDocument>>;
  try {
    wsSnap = await restGetDocument(wsPath, { withAuth: true, user });
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, wsPath);
  }

  try {
    if (!wsSnap.exists) {
      let seed: { pages: WorkspacePage[]; rowsByPage: Record<string, DatabaseRow[]> };
      try {
        seed = await fetchAndBuildImproEcosystem(workspaceId, uid, 0);
      } catch {
        seed = createSeedWorkspace(workspaceId, uid);
      }
      await commitPagesAndRowsChunkedViaRest(workspaceId, uid, seed.pages, seed.rowsByPage, true, user);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }

  return { workspaceId, theme: resolvedTheme };
}

export async function ensureUserAndWorkspace(
  user: User,
  preferredTheme: ThemeMode = 'light'
): Promise<{ workspaceId: string; theme: ThemeMode }> {
  const uid = sanitizeId(user.uid, 'usr');
  const workspaceId = getWorkspaceIdForUser(uid);
  const userPath = `users/${uid}`;
  const wsPath = `workspaces/${workspaceId}`;

  if (useFirestoreRestFallback) {
    return ensureUserAndWorkspaceViaRest(user, uid, workspaceId, preferredTheme);
  }

  let resolvedTheme: ThemeMode = preferredTheme;

  const userRef = doc(db, 'users', uid);
  let userSnap;
  try {
    userSnap = await getDocWithNetworkRetry(userRef);
  } catch (err) {
    if (isWebChannelTransportError(err)) {
      useFirestoreRestFallback = true;
      return ensureUserAndWorkspaceViaRest(user, uid, workspaceId, preferredTheme);
    }
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  try {
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName: (user.displayName ?? 'Utilisateur').slice(0, 120),
        email: (user.email ?? '').slice(0, 200),
        photoURL: (user.photoURL ?? '').slice(0, 500),
        theme: preferredTheme,
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = userSnap.data();
      if (data.theme === 'dark' || data.theme === 'light') {
        resolvedTheme = data.theme;
      }
    }
  } catch (err) {
    if (isWebChannelTransportError(err)) {
      useFirestoreRestFallback = true;
      return ensureUserAndWorkspaceViaRest(user, uid, workspaceId, preferredTheme);
    }
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  const wsRef = doc(db, 'workspaces', workspaceId);
  let wsSnap;
  try {
    wsSnap = await getDocWithNetworkRetry(wsRef);
  } catch (err) {
    if (isWebChannelTransportError(err)) {
      useFirestoreRestFallback = true;
      return ensureUserAndWorkspaceViaRest(user, uid, workspaceId, preferredTheme);
    }
    handleFirestoreError(err, OperationType.GET, wsPath);
  }

  try {
    if (!wsSnap.exists()) {
      let seed: { pages: WorkspacePage[]; rowsByPage: Record<string, DatabaseRow[]> };
      try {
        seed = await fetchAndBuildImproEcosystem(workspaceId, uid, 0);
      } catch {
        seed = createSeedWorkspace(workspaceId, uid);
      }
      await commitPagesAndRowsChunked(workspaceId, uid, seed.pages, seed.rowsByPage, true, user);
    }
  } catch (err) {
    if (isWebChannelTransportError(err)) {
      useFirestoreRestFallback = true;
      return ensureUserAndWorkspaceViaRest(user, uid, workspaceId, preferredTheme);
    }
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }

  return { workspaceId, theme: resolvedTheme };
}

export async function updateUserThemeInFirestore(uid: string, theme: ThemeMode): Promise<void> {
  const path = `users/${uid}`;
  try {
    await runSdkOrRest(
      () =>
        updateDoc(doc(db, 'users', uid), {
          theme,
          updatedAt: serverTimestamp(),
        }),
      () => restCommitWrites([buildRestUpdateWrite(path, { theme }, ['updatedAt'])])
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

function parseWorkspacePageDoc(
  id: string,
  data: Record<string, unknown>,
  fallbackWorkspaceId: string,
  fallbackOwnerId: string
): WorkspacePage {
  return {
    id,
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : fallbackWorkspaceId,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : fallbackOwnerId,
    parentId: typeof data.parentId === 'string' ? data.parentId : null,
    title: typeof data.title === 'string' ? data.title : 'Sans titre',
    icon: typeof data.icon === 'string' ? data.icon : '📄',
    type: data.type === 'database' ? 'database' : 'document',
    isFavorite: Boolean(data.isFavorite),
    isTrashed: Boolean(data.isTrashed),
    order: typeof data.order === 'number' ? data.order : 0,
    source: data.source === 'notion_import' ? 'notion_import' : 'native',
    blocks: Array.isArray(data.blocks) ? (data.blocks as BlockItem[]) : [],
    columns: Array.isArray(data.columns) ? (data.columns as DatabaseColumn[]) : undefined,
    activeView:
      data.activeView === 'kanban' || data.activeView === 'list' ? data.activeView : 'table',
    sortRules: Array.isArray(data.sortRules)
      ? sanitizeSortRules(data.sortRules as DatabaseSortRule[])
      : undefined,
    columnWidths:
      data.columnWidths && typeof data.columnWidths === 'object'
        ? sanitizeColumnWidths(data.columnWidths as Record<string, number>)
        : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function subscribeWorkspacePages(
  workspaceId: string,
  ownerId: string,
  onData: (pages: WorkspacePage[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/pages`;
  const sdkQuery = query(
    collection(db, 'workspaces', workspaceId, 'pages'),
    where('ownerId', '==', ownerId)
  );
  return subscribeWithRestFallback({
    path,
    sdkQuery,
    parentRelativePath: `workspaces/${workspaceId}`,
    collectionId: 'pages',
    ownerId,
    mapDocs: (items) =>
      items.map((item) => parseWorkspacePageDoc(item.id, item.data, workspaceId, ownerId)),
    onData,
  });
}

function parseDatabaseRowDoc(
  id: string,
  data: Record<string, unknown>,
  fallbackWorkspaceId: string,
  fallbackPageId: string,
  fallbackOwnerId: string
): DatabaseRow {
  return {
    id,
    pageId: typeof data.pageId === 'string' ? data.pageId : fallbackPageId,
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : fallbackWorkspaceId,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : fallbackOwnerId,
    order: typeof data.order === 'number' ? data.order : 0,
    cells: (data.cells as DatabaseRow['cells']) ?? {},
    linkedPageId: typeof data.linkedPageId === 'string' ? data.linkedPageId : null,
    ...(Array.isArray(data.blocks) ? { blocks: data.blocks as BlockItem[] } : {}),
    ...(Array.isArray(data.comments) ? { comments: data.comments as RowComment[] } : {}),
    ...(typeof data.notionPageId === 'string' ? { notionPageId: data.notionPageId } : {}),
    ...(typeof data.notionSyncedAt === 'string' ? { notionSyncedAt: data.notionSyncedAt } : {}),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function subscribeDatabaseRows(
  workspaceId: string,
  pageId: string,
  ownerId: string,
  onData: (rows: DatabaseRow[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/pages/${pageId}/rows`;
  const sdkQuery = query(
    collection(db, 'workspaces', workspaceId, 'pages', pageId, 'rows'),
    where('ownerId', '==', ownerId)
  );
  return subscribeWithRestFallback({
    path,
    sdkQuery,
    parentRelativePath: `workspaces/${workspaceId}/pages/${pageId}`,
    collectionId: 'rows',
    ownerId,
    mapDocs: (items) =>
      items
        .map((item) => parseDatabaseRowDoc(item.id, item.data, workspaceId, pageId, ownerId))
        .sort((a, b) => a.order - b.order),
    onData,
  });
}

export async function createPageInFirestore(
  page: WorkspacePage,
  initialRows: DatabaseRow[] = []
): Promise<void> {
  const path = `workspaces/${page.workspaceId}/pages/${page.id}`;
  const pageBase = buildPageBaseFields(page.workspaceId, page.ownerId, page);
  const rowsBases = initialRows.map((row) => ({
    row,
    base: buildRowBaseFields(page.workspaceId, page.id, page.ownerId, row),
  }));

  try {
    await runSdkOrRest(
      async () => {
        const batch = writeBatch(db);
        const pageRef = doc(db, 'workspaces', page.workspaceId, 'pages', page.id);
        batch.set(pageRef, {
          ...pageBase,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        for (const { row, base } of rowsBases) {
          const rowRef = doc(db, 'workspaces', page.workspaceId, 'pages', page.id, 'rows', row.id);
          batch.set(rowRef, {
            ...base,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      },
      async () => {
        const writes: RestWriteOp[] = [
          buildRestSetWrite(path, pageBase, ['createdAt', 'updatedAt']),
          ...rowsBases.map(({ row, base }) =>
            buildRestSetWrite(
              `workspaces/${page.workspaceId}/pages/${page.id}/rows/${row.id}`,
              base,
              ['createdAt', 'updatedAt']
            )
          ),
        ];
        await restCommitWrites(writes);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updatePageContentInFirestore(
  workspaceId: string,
  pageId: string,
  patch: {
    title?: string;
    icon?: string;
    parentId?: string | null;
    blocks?: BlockItem[];
    columns?: DatabaseColumn[];
    activeView?: WorkspacePage['activeView'];
    sortRules?: DatabaseSortRule[];
    columnWidths?: Record<string, number>;
    order?: number;
  }
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  const patchBase: Record<string, unknown> = {};
  if (patch.title !== undefined) patchBase.title = patch.title.slice(0, 200);
  if (patch.icon !== undefined) patchBase.icon = patch.icon.slice(0, 32);
  if (patch.parentId !== undefined) patchBase.parentId = patch.parentId;
  if (patch.blocks !== undefined) patchBase.blocks = sanitizeBlocks(patch.blocks);
  if (patch.columns !== undefined) patchBase.columns = sanitizeColumns(patch.columns);
  if (patch.activeView !== undefined) patchBase.activeView = patch.activeView;
  if (patch.sortRules !== undefined) patchBase.sortRules = sanitizeSortRules(patch.sortRules);
  if (patch.columnWidths !== undefined) {
    patchBase.columnWidths = sanitizeColumnWidths(patch.columnWidths);
  }
  if (patch.order !== undefined) patchBase.order = patch.order;

  try {
    await runSdkOrRest(
      () =>
        updateDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId), {
          ...patchBase,
          updatedAt: serverTimestamp(),
        }),
      () => restCommitWrites([buildRestUpdateWrite(path, patchBase, ['updatedAt'])])
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updatePageFlagsInFirestore(
  workspaceId: string,
  pageId: string,
  flags: { isFavorite?: boolean; isTrashed?: boolean }
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  const patchBase: Record<string, unknown> = {};
  if (flags.isFavorite !== undefined) patchBase.isFavorite = flags.isFavorite;
  if (flags.isTrashed !== undefined) patchBase.isTrashed = flags.isTrashed;
  try {
    await runSdkOrRest(
      () =>
        updateDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId), {
          ...patchBase,
          updatedAt: serverTimestamp(),
        }),
      () => restCommitWrites([buildRestUpdateWrite(path, patchBase, ['updatedAt'])])
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePagePermanentlyInFirestore(
  workspaceId: string,
  pageId: string,
  ownerId: string
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}`;
  try {
    await runSdkOrRest(
      async () => {
        const rowsQ = query(
          collection(db, 'workspaces', workspaceId, 'pages', pageId, 'rows'),
          where('ownerId', '==', ownerId)
        );
        const rowsSnap = await getDocs(rowsQ);
        const batch = writeBatch(db);
        rowsSnap.docs.forEach((d) => batch.delete(d.ref));
        batch.delete(doc(db, 'workspaces', workspaceId, 'pages', pageId));
        await batch.commit();
      },
      async () => {
        const rows = await restRunCollectionQuery(
          `workspaces/${workspaceId}/pages/${pageId}`,
          'rows',
          ownerId
        );
        const writes: RestWriteOp[] = rows.map((r) =>
          buildRestDeleteWrite(`workspaces/${workspaceId}/pages/${pageId}/rows/${r.id}`)
        );
        writes.push(buildRestDeleteWrite(path));
        await restCommitWrites(writes);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

function buildRowPatchFields(row: DatabaseRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    order: row.order,
    cells: sanitizeCells(row.cells),
    linkedPageId: row.linkedPageId ? sanitizeId(row.linkedPageId, 'page') : null,
  };
  if (Array.isArray(row.blocks)) payload.blocks = sanitizeBlocks(row.blocks);
  if (Array.isArray(row.comments)) payload.comments = sanitizeRowComments(row.comments);
  if (typeof row.notionPageId === 'string' && /^[a-fA-F0-9-]+$/.test(row.notionPageId)) {
    payload.notionPageId = row.notionPageId.slice(0, 64);
  }
  if (typeof row.notionSyncedAt === 'string' && row.notionSyncedAt) {
    payload.notionSyncedAt = row.notionSyncedAt.slice(0, 64);
  }
  return payload;
}

export async function upsertRowInFirestore(row: DatabaseRow, isNew: boolean): Promise<void> {
  const path = `workspaces/${row.workspaceId}/pages/${row.pageId}/rows/${row.id}`;
  try {
    await runSdkOrRest(
      async () => {
        const ref = doc(db, 'workspaces', row.workspaceId, 'pages', row.pageId, 'rows', row.id);
        if (isNew) {
          await setDoc(ref, {
            ...buildRowBaseFields(row.workspaceId, row.pageId, row.ownerId, row),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            ...buildRowPatchFields(row),
            updatedAt: serverTimestamp(),
          });
        }
      },
      async () => {
        const write = isNew
          ? buildRestSetWrite(
              path,
              buildRowBaseFields(row.workspaceId, row.pageId, row.ownerId, row),
              ['createdAt', 'updatedAt']
            )
          : buildRestUpdateWrite(path, buildRowPatchFields(row), ['updatedAt']);
        await restCommitWrites([write]);
      }
    );
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function seedImproDatabasesToFirestore(
  workspaceId: string,
  ownerId: string,
  dataset: ImproEcosystemDataset
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages`;
  try {
    await commitPagesAndRowsChunked(workspaceId, ownerId, dataset.pages, dataset.rowsByPage, false);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function batchUpsertRowsInFirestore(
  rows: DatabaseRow[],
  newRowKeys: Set<string> = new Set()
): Promise<void> {
  if (rows.length === 0) return;
  const first = rows[0];
  const path = `workspaces/${first.workspaceId}/pages/${first.pageId}/rows/${first.id}`;
  try {
    await runSdkOrRest(
      async () => {
        let batch = writeBatch(db);
        let opCount = 0;

        const flush = async (force = false) => {
          if (opCount >= 350 || (force && opCount > 0)) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        };

        for (const row of rows) {
          const ref = doc(db, 'workspaces', row.workspaceId, 'pages', row.pageId, 'rows', row.id);
          const key = `${row.pageId}::${row.id}`;
          if (newRowKeys.has(key)) {
            batch.set(ref, {
              ...buildRowBaseFields(row.workspaceId, row.pageId, row.ownerId, row),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            batch.update(ref, {
              ...buildRowPatchFields(row),
              updatedAt: serverTimestamp(),
            });
          }
          opCount++;
          await flush();
        }

        await flush(true);
      },
      async () => {
        const writes: RestWriteOp[] = rows.map((row) => {
          const rowPath = `workspaces/${row.workspaceId}/pages/${row.pageId}/rows/${row.id}`;
          const key = `${row.pageId}::${row.id}`;
          if (newRowKeys.has(key)) {
            return buildRestSetWrite(
              rowPath,
              buildRowBaseFields(row.workspaceId, row.pageId, row.ownerId, row),
              ['createdAt', 'updatedAt']
            );
          }
          return buildRestUpdateWrite(rowPath, buildRowPatchFields(row), ['updatedAt']);
        });
        await restCommitWrites(writes);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteRowInFirestore(
  workspaceId: string,
  pageId: string,
  rowId: string
): Promise<void> {
  const path = `workspaces/${workspaceId}/pages/${pageId}/rows/${rowId}`;
  try {
    await runSdkOrRest(
      () => deleteDoc(doc(db, 'workspaces', workspaceId, 'pages', pageId, 'rows', rowId)),
      () => restCommitWrites([buildRestDeleteWrite(path)])
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteRowsInFirestore(
  workspaceId: string,
  pageId: string,
  rowIds: string[]
): Promise<void> {
  if (rowIds.length === 0) return;
  const uniqueIds = Array.from(new Set(rowIds));
  if (uniqueIds.length === 1) {
    await deleteRowInFirestore(workspaceId, pageId, uniqueIds[0]);
    return;
  }
  const path = `workspaces/${workspaceId}/pages/${pageId}/rows`;
  try {
    await runSdkOrRest(
      async () => {
        let batch = writeBatch(db);
        let opCount = 0;
        for (const rowId of uniqueIds) {
          batch.delete(doc(db, 'workspaces', workspaceId, 'pages', pageId, 'rows', rowId));
          opCount++;
          if (opCount >= 350) {
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
        if (opCount > 0) {
          await batch.commit();
        }
      },
      async () => {
        const writes = uniqueIds.map((rowId) =>
          buildRestDeleteWrite(`workspaces/${workspaceId}/pages/${pageId}/rows/${rowId}`)
        );
        await restCommitWrites(writes);
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function importNotionPagesToFirestore(
  workspaceId: string,
  ownerId: string,
  drafts: ImportedPageDraft[],
  startOrder: number,
  targetParentId: string | null = null
): Promise<string[]> {
  const { pages, rowsByPage } = materializeImportedDrafts(
    drafts,
    workspaceId,
    ownerId,
    startOrder,
    targetParentId
  );

  const createdIds = pages.map((p) => p.id);

  try {
    await commitPagesAndRowsChunked(workspaceId, ownerId, pages, rowsByPage, false);
    return createdIds;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/pages`);
  }
}

const VALID_EXPLORE_MODELS = new Set<ExploreModelId>([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);
const VALID_EXPLORE_TIERS = new Set<ExploreTier>(['standard', 'plan', 'max']);

function sanitizeExploreModelId(raw: unknown): ExploreModelId {
  return typeof raw === 'string' && VALID_EXPLORE_MODELS.has(raw as ExploreModelId)
    ? (raw as ExploreModelId)
    : 'gemini-4-hydrogen';
}

function sanitizeExploreTier(raw: unknown): ExploreTier {
  return typeof raw === 'string' && VALID_EXPLORE_TIERS.has(raw as ExploreTier)
    ? (raw as ExploreTier)
    : 'plan';
}

function sanitizeExploreMessages(messages: ExploreMessage[]): ExploreMessage[] {
  return messages.slice(-60).map((m, idx) => {
    const clean: ExploreMessage = {
      id: sanitizeId(m.id || `msg_${idx}`, 'msg'),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, 20000),
      createdAt: String(m.createdAt || new Date().toISOString()).slice(0, 64),
    };
    if (m.modelId) clean.modelId = sanitizeExploreModelId(m.modelId);
    if (m.tier) clean.tier = sanitizeExploreTier(m.tier);
    if (typeof m.useWebSearch === 'boolean') clean.useWebSearch = m.useWebSearch;
    if (Array.isArray(m.webSources) && m.webSources.length > 0) {
      clean.webSources = m.webSources
        .filter((s) => s && typeof s.url === 'string' && s.url.trim())
        .slice(0, 20)
        .map((s) => ({
          title: String(s.title ?? s.url).slice(0, 160),
          url: String(s.url).slice(0, 1000),
        }));
    }
    if (Array.isArray(m.suggestedExercises) && m.suggestedExercises.length > 0) {
      clean.suggestedExercises = m.suggestedExercises.slice(0, 12).map((ex, i) => ({
        id: sanitizeId(ex.id || `sug_ex_${i}`, 'sug_ex'),
        nom: String(ex.nom ?? '').slice(0, 140),
        etape: String(ex.etape ?? '').slice(0, 80),
        tags: Array.isArray(ex.tags)
          ? ex.tags.slice(0, 8).map((t) => String(t ?? '').slice(0, 40))
          : [],
        description: String(ex.description ?? '').slice(0, 800),
        durationMin: Math.max(1, Math.min(240, Math.round(Number(ex.durationMin) || 15))),
        note: String(ex.note ?? '').slice(0, 240),
        ...(ex.existingExerciceId
          ? { existingExerciceId: sanitizeId(ex.existingExerciceId, 'row') }
          : {}),
        ...(ex.addedToBiblimproId
          ? { addedToBiblimproId: sanitizeId(ex.addedToBiblimproId, 'row') }
          : {}),
      }));
    }
    if (Array.isArray(m.suggestedSessions) && m.suggestedSessions.length > 0) {
      clean.suggestedSessions = m.suggestedSessions.slice(0, 4).map((sess, i) => ({
        id: sanitizeId(sess.id || `sug_sea_${i}`, 'sug_sea'),
        titre: String(sess.titre ?? '').slice(0, 140),
        objectif: String(sess.objectif ?? '').slice(0, 300),
        dureeTotaleMin: Math.max(5, Math.min(360, Math.round(Number(sess.dureeTotaleMin) || 90))),
        steps: Array.isArray(sess.steps)
          ? sess.steps.slice(0, 24).map((st) => ({
              kind: st.kind === 'custom' ? 'custom' : 'exercise',
              nom: String(st.nom ?? '').slice(0, 140),
              ...(st.etape ? { etape: String(st.etape).slice(0, 80) } : {}),
              ...(Array.isArray(st.tags)
                ? { tags: st.tags.slice(0, 8).map((t) => String(t ?? '').slice(0, 40)) }
                : {}),
              ...(st.description ? { description: String(st.description).slice(0, 600) } : {}),
              durationMin: Math.max(1, Math.min(240, Math.round(Number(st.durationMin) || 15))),
              note: String(st.note ?? '').slice(0, 240),
              ...(st.existingExerciceId
                ? { existingExerciceId: sanitizeId(st.existingExerciceId, 'row') }
                : {}),
              ...(st.addedToBiblimproId
                ? { addedToBiblimproId: sanitizeId(st.addedToBiblimproId, 'row') }
                : {}),
            }))
          : [],
        ...(sess.createdSeanceId
          ? { createdSeanceId: sanitizeId(sess.createdSeanceId, 'row') }
          : {}),
      }));
    }
    if (typeof m.error === 'string' && m.error) {
      clean.error = m.error.slice(0, 1000);
    }
    return clean;
  });
}

function parseExploreThreadDoc(
  id: string,
  data: Record<string, unknown>,
  fallbackWorkspaceId: string,
  fallbackOwnerId: string
): ExploreThread {
  return {
    id,
    workspaceId: typeof data.workspaceId === 'string' ? data.workspaceId : fallbackWorkspaceId,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : fallbackOwnerId,
    title: String(data.title ?? 'Nouvelle exploration').slice(0, 160),
    groupId: typeof data.groupId === 'string' ? data.groupId : '',
    thematique: typeof data.thematique === 'string' ? data.thematique : '',
    modelId: sanitizeExploreModelId(data.modelId),
    tier: sanitizeExploreTier(data.tier),
    useWebSearch: typeof data.useWebSearch === 'boolean' ? data.useWebSearch : true,
    messages: Array.isArray(data.messages) ? (data.messages as ExploreMessage[]) : [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function subscribeExploreThreads(
  workspaceId: string,
  ownerId: string,
  onData: (threads: ExploreThread[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/exploreThreads`;
  const sdkQuery = query(
    collection(db, 'workspaces', workspaceId, 'exploreThreads'),
    where('ownerId', '==', ownerId)
  );
  return subscribeWithRestFallback({
    path,
    sdkQuery,
    parentRelativePath: `workspaces/${workspaceId}`,
    collectionId: 'exploreThreads',
    ownerId,
    mapDocs: (items) =>
      items.map((item) => parseExploreThreadDoc(item.id, item.data, workspaceId, ownerId)),
    onData,
  });
}

export async function upsertExploreThreadInFirestore(
  thread: ExploreThread,
  isNew: boolean
): Promise<void> {
  const cleanId = sanitizeId(thread.id, 'exp');
  const path = `workspaces/${thread.workspaceId}/exploreThreads/${cleanId}`;
  const cleanTitle =
    (thread.title || 'Nouvelle exploration').trim().slice(0, 160) || 'Nouvelle exploration';
  const cleanGroupId = String(thread.groupId ?? '').slice(0, 128);
  const cleanThematique = String(thread.thematique ?? '').slice(0, 300);
  const cleanModelId = sanitizeExploreModelId(thread.modelId);
  const cleanTier = sanitizeExploreTier(thread.tier);
  const cleanMessages = sanitizeExploreMessages(thread.messages ?? []);

  const updateFields: Record<string, unknown> = {
    title: cleanTitle,
    groupId: cleanGroupId,
    thematique: cleanThematique,
    modelId: cleanModelId,
    tier: cleanTier,
    useWebSearch: Boolean(thread.useWebSearch),
    messages: cleanMessages,
  };

  try {
    await runSdkOrRest(
      async () => {
        const ref = doc(db, 'workspaces', thread.workspaceId, 'exploreThreads', cleanId);
        if (isNew) {
          await setDoc(ref, {
            id: cleanId,
            workspaceId: thread.workspaceId,
            ownerId: thread.ownerId,
            ...updateFields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            ...updateFields,
            updatedAt: serverTimestamp(),
          });
        }
      },
      async () => {
        const write = isNew
          ? buildRestSetWrite(
              path,
              {
                id: cleanId,
                workspaceId: thread.workspaceId,
                ownerId: thread.ownerId,
                ...updateFields,
              },
              ['createdAt', 'updatedAt']
            )
          : buildRestUpdateWrite(path, updateFields, ['updatedAt']);
        await restCommitWrites([write]);
      }
    );
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteExploreThreadInFirestore(
  workspaceId: string,
  threadId: string
): Promise<void> {
  const cleanId = sanitizeId(threadId, 'exp');
  const path = `workspaces/${workspaceId}/exploreThreads/${cleanId}`;
  try {
    await runSdkOrRest(
      () => deleteDoc(doc(db, 'workspaces', workspaceId, 'exploreThreads', cleanId)),
      () => restCommitWrites([buildRestDeleteWrite(path)])
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export interface ViewSettingRecord {
  id: string;
  kind: ViewSettingKind;
  settings: Record<string, unknown>;
}

const VALID_VIEW_SETTING_KINDS = new Set<ViewSettingKind>([
  'nav',
  'database',
  'prepare',
  'timeline',
  'stats',
  'explore',
  'search',
  'table_orders',
]);

function sanitizeViewSettingPayloadByKind(
  kind: ViewSettingKind,
  rawSettings: unknown
): Record<string, unknown> {
  switch (kind) {
    case 'nav':
      return sanitizeNavViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'database':
      return sanitizeDatabaseViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'prepare':
      return sanitizePrepareViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'timeline':
      return sanitizeTimelineViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'stats':
      return sanitizeStatsViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'explore':
      return sanitizeExploreViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'search':
      return sanitizeSearchViewSettings(rawSettings) as unknown as Record<string, unknown>;
    case 'table_orders': {
      const rec =
        rawSettings && typeof rawSettings === 'object'
          ? (rawSettings as Record<string, unknown>)
          : {};
      return { orders: sanitizeTableColumnOrdersMap(rec.orders ?? rec) };
    }
  }
}

export function subscribeViewSettings(
  workspaceId: string,
  ownerId: string,
  onData: (records: ViewSettingRecord[]) => void
): Unsubscribe {
  const path = `workspaces/${workspaceId}/viewSettings`;
  const sdkQuery = query(
    collection(db, 'workspaces', workspaceId, 'viewSettings'),
    where('ownerId', '==', ownerId)
  );
  return subscribeWithRestFallback({
    path,
    sdkQuery,
    parentRelativePath: `workspaces/${workspaceId}`,
    collectionId: 'viewSettings',
    ownerId,
    mapDocs: (items) => {
      const records: ViewSettingRecord[] = [];
      for (const item of items) {
        const kind = item.data.kind;
        if (typeof kind !== 'string' || !VALID_VIEW_SETTING_KINDS.has(kind as ViewSettingKind)) {
          continue;
        }
        records.push({
          id: item.id,
          kind: kind as ViewSettingKind,
          settings: sanitizeViewSettingPayloadByKind(
            kind as ViewSettingKind,
            item.data.settings
          ),
        });
      }
      return records;
    },
    onData,
  });
}

export async function upsertViewSettingInFirestore(
  workspaceId: string,
  ownerId: string,
  settingId: string,
  kind: ViewSettingKind,
  settings: unknown,
  isKnownExisting: boolean
): Promise<void> {
  const cleanId = sanitizeId(settingId, 'vs');
  const path = `workspaces/${workspaceId}/viewSettings/${cleanId}`;
  const cleanSettings = sanitizeViewSettingPayloadByKind(kind, settings);

  let exists = isKnownExisting;
  if (!exists) {
    try {
      exists = await runSdkOrRest(
        async () => {
          const snap = await getDoc(doc(db, 'workspaces', workspaceId, 'viewSettings', cleanId));
          return snap.exists();
        },
        async () => {
          const snap = await restGetDocument(path, { withAuth: true });
          return snap.exists;
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  try {
    await runSdkOrRest(
      async () => {
        const ref = doc(db, 'workspaces', workspaceId, 'viewSettings', cleanId);
        if (exists) {
          await updateDoc(ref, {
            settings: cleanSettings,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id: cleanId,
            workspaceId,
            ownerId,
            kind,
            settings: cleanSettings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      },
      async () => {
        const write = exists
          ? buildRestUpdateWrite(path, { settings: cleanSettings }, ['updatedAt'])
          : buildRestSetWrite(
              path,
              {
                id: cleanId,
                workspaceId,
                ownerId,
                kind,
                settings: cleanSettings,
              },
              ['createdAt', 'updatedAt']
            );
        await restCommitWrites([write]);
      }
    );
  } catch (err) {
    handleFirestoreError(err, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export interface SharedEmbedSnapshot {
  id: string;
  workspaceId: string;
  ownerId: string;
  target: 'exercices';
  active: boolean;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  tableOrders?: Record<string, string[]>;
  updatedAt?: unknown;
}

const SHARED_EMBED_IMPRO_PAGE_IDS = [
  IMPRO_DB_IDS.exercices,
  IMPRO_DB_IDS.seances,
  IMPRO_DB_IDS.groupes,
  IMPRO_DB_IDS.participants,
] as const;

function sanitizeSharedEmbedRow(
  row: DatabaseRow,
  pageId: string,
  includeBlocks: boolean,
  includeComments: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: sanitizeId(row.id, 'row'),
    pageId,
    order: typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0,
    cells: sanitizeCells(row.cells),
  };
  if (includeBlocks && Array.isArray(row.blocks) && row.blocks.length > 0) {
    out.blocks = sanitizeBlocks(row.blocks);
  }
  if (includeComments && Array.isArray(row.comments) && row.comments.length > 0) {
    out.comments = sanitizeRowComments(row.comments);
  }
  if (typeof row.notionPageId === 'string' && /^[a-fA-F0-9-]+$/.test(row.notionPageId)) {
    out.notionPageId = row.notionPageId.slice(0, 64);
  }
  if (typeof row.notionSyncedAt === 'string' && row.notionSyncedAt) {
    out.notionSyncedAt = row.notionSyncedAt.slice(0, 64);
  }
  return out;
}

function estimateUtf8ByteSize(obj: unknown): number {
  try {
    const str = JSON.stringify(obj);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return str.length * 2;
  } catch {
    return 0;
  }
}

export async function upsertSharedEmbedInFirestore(params: {
  embedToken: string;
  workspaceId: string;
  ownerId: string;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  tableOrders?: Record<string, string[]>;
}): Promise<void> {
  const { embedToken, workspaceId, ownerId, pages, rowsByPage, tableOrders } = params;
  if (!isValidEmbedToken(embedToken)) {
    throw new Error('Jeton embed invalide.');
  }
  const cleanWorkspaceId = sanitizeId(workspaceId, 'ws');
  const cleanOwnerId = sanitizeId(ownerId, 'usr');
  const path = `sharedEmbeds/${embedToken}`;

  const sharedPages = SHARED_EMBED_IMPRO_PAGE_IDS.map((pid, idx) => {
    const page = pages.find((p) => p.id === pid && !p.isTrashed && p.type === 'database');
    if (!page) return null;
    const cleanPage: Record<string, unknown> = {
      id: page.id,
      title: String(page.title ?? 'Sans titre').slice(0, 200),
      icon: String(page.icon ?? '🗂️').slice(0, 32),
      type: 'database',
      order: typeof page.order === 'number' && Number.isFinite(page.order) ? page.order : idx,
    };
    if (page.columns) cleanPage.columns = sanitizeColumns(page.columns);
    if (page.activeView) cleanPage.activeView = page.activeView;
    if (page.sortRules && page.sortRules.length > 0) {
      cleanPage.sortRules = sanitizeSortRules(page.sortRules);
    }
    if (page.columnWidths && Object.keys(page.columnWidths).length > 0) {
      cleanPage.columnWidths = sanitizeColumnWidths(page.columnWidths);
    }
    return cleanPage;
  }).filter((p): p is Record<string, unknown> => p !== null);

  if (!sharedPages.some((p) => p.id === IMPRO_DB_IDS.exercices)) {
    return;
  }

  const buildRowsMap = (includeBlocks: boolean, includeComments: boolean) => {
    const out: Record<string, Record<string, unknown>[]> = {
      [IMPRO_DB_IDS.exercices]: (rowsByPage[IMPRO_DB_IDS.exercices] ?? [])
        .slice(0, 2000)
        .map((r) => sanitizeSharedEmbedRow(r, IMPRO_DB_IDS.exercices, includeBlocks, includeComments)),
    };
    for (const pid of [IMPRO_DB_IDS.seances, IMPRO_DB_IDS.groupes, IMPRO_DB_IDS.participants]) {
      const list = rowsByPage[pid];
      if (Array.isArray(list)) {
        out[pid] = list.slice(0, 2000).map((r) => sanitizeSharedEmbedRow(r, pid, false, false));
      }
    }
    return out;
  };

  let cleanRowsByPage = buildRowsMap(true, true);
  if (estimateUtf8ByteSize(cleanRowsByPage) > 740_000) {
    cleanRowsByPage = buildRowsMap(false, true);
  }
  if (estimateUtf8ByteSize(cleanRowsByPage) > 820_000) {
    cleanRowsByPage = buildRowsMap(false, false);
  }

  const cleanTableOrders = sanitizeTableColumnOrdersMap(
    tableOrders?.[IMPRO_DB_IDS.exercices]
      ? { [IMPRO_DB_IDS.exercices]: tableOrders[IMPRO_DB_IDS.exercices] }
      : {}
  );

  let exists = false;
  try {
    exists = await runSdkOrRest(
      async () => {
        const snap = await getDoc(doc(db, 'sharedEmbeds', embedToken));
        return snap.exists();
      },
      async () => {
        const snap = await restGetDocument(path, { withAuth: true });
        return snap.exists;
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  const updateFields: Record<string, unknown> = {
    active: true,
    pages: sharedPages,
    rowsByPage: cleanRowsByPage,
    tableOrders: cleanTableOrders,
  };

  try {
    await runSdkOrRest(
      async () => {
        const ref = doc(db, 'sharedEmbeds', embedToken);
        if (exists) {
          await updateDoc(ref, {
            ...updateFields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id: embedToken,
            workspaceId: cleanWorkspaceId,
            ownerId: cleanOwnerId,
            target: 'exercices',
            ...updateFields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      },
      async () => {
        const write = exists
          ? buildRestUpdateWrite(path, updateFields, ['updatedAt'])
          : buildRestSetWrite(
              path,
              {
                id: embedToken,
                workspaceId: cleanWorkspaceId,
                ownerId: cleanOwnerId,
                target: 'exercices',
                ...updateFields,
              },
              ['createdAt', 'updatedAt']
            );
        await restCommitWrites([write]);
      }
    );
  } catch (err) {
    handleFirestoreError(err, exists ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

function parseSharedEmbedDocument(
  embedToken: string,
  data: Record<string, unknown>
): SharedEmbedSnapshot {
  const wsId = typeof data.workspaceId === 'string' ? data.workspaceId : 'shared';
  const ownId = typeof data.ownerId === 'string' ? data.ownerId : 'shared';
  const rawPages = Array.isArray(data.pages) ? data.pages : [];
  const parsedPages: WorkspacePage[] = rawPages
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
    .map((p, idx): WorkspacePage => ({
      id: String(p.id ?? ''),
      workspaceId: wsId,
      ownerId: ownId,
      parentId: null,
      title: String(p.title ?? 'Sans titre'),
      icon: String(p.icon ?? '🗂️'),
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: typeof p.order === 'number' ? p.order : idx,
      source: 'native',
      blocks: [],
      columns: Array.isArray(p.columns) ? (p.columns as DatabaseColumn[]) : undefined,
      activeView:
        p.activeView === 'kanban' || p.activeView === 'list' ? p.activeView : 'table',
      sortRules: Array.isArray(p.sortRules)
        ? sanitizeSortRules(p.sortRules as DatabaseSortRule[])
        : undefined,
      columnWidths:
        p.columnWidths && typeof p.columnWidths === 'object'
          ? sanitizeColumnWidths(p.columnWidths as Record<string, number>)
          : undefined,
    }))
    .filter((p) => Boolean(p.id));

  const rawRowsMap =
    data.rowsByPage && typeof data.rowsByPage === 'object'
      ? (data.rowsByPage as Record<string, unknown>)
      : {};
  const parsedRowsByPage: Record<string, DatabaseRow[]> = {};
  for (const pid of SHARED_EMBED_IMPRO_PAGE_IDS) {
    const rawList = rawRowsMap[pid];
    if (!Array.isArray(rawList)) continue;
    parsedRowsByPage[pid] = rawList
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
      .map((r, idx): DatabaseRow => ({
        id: String(r.id ?? `row_${idx}`),
        pageId: pid,
        workspaceId: wsId,
        ownerId: ownId,
        order: typeof r.order === 'number' ? r.order : idx,
        cells:
          r.cells && typeof r.cells === 'object' ? (r.cells as DatabaseRow['cells']) : {},
        linkedPageId: null,
        ...(Array.isArray(r.blocks) ? { blocks: r.blocks as BlockItem[] } : {}),
        ...(Array.isArray(r.comments) ? { comments: r.comments as RowComment[] } : {}),
        ...(typeof r.notionPageId === 'string' ? { notionPageId: r.notionPageId } : {}),
        ...(typeof r.notionSyncedAt === 'string'
          ? { notionSyncedAt: r.notionSyncedAt }
          : {}),
      }))
      .sort((a, b) => a.order - b.order);
  }

  const parsedOrders =
    data.tableOrders && typeof data.tableOrders === 'object'
      ? sanitizeTableColumnOrdersMap(data.tableOrders)
      : undefined;

  return {
    id: embedToken,
    workspaceId: wsId,
    ownerId: ownId,
    target: 'exercices',
    active: Boolean(data.active),
    pages: parsedPages,
    rowsByPage: parsedRowsByPage,
    tableOrders: parsedOrders,
    updatedAt: data.updatedAt,
  };
}

async function fetchSharedEmbedViaRest(
  embedToken: string,
  signal?: AbortSignal
): Promise<
  | { status: 'ok'; snapshot: SharedEmbedSnapshot }
  | { status: 'missing' | 'network'; message: string }
> {
  try {
    const res = await restGetDocument(`sharedEmbeds/${embedToken}`, { withAuth: false, signal });
    if (!res.exists) {
      return {
        status: 'missing',
        message: 'Sauvegarde cloud introuvable pour ce lien embed.',
      };
    }
    return {
      status: 'ok',
      snapshot: parseSharedEmbedDocument(embedToken, res.data),
    };
  } catch (err) {
    if (err instanceof FirestoreRestError && (err.status === 404 || err.status === 403)) {
      return {
        status: 'missing',
        message: 'Ce lien embed n’est pas encore synchronisé avec le cloud ou a été désactivé.',
      };
    }
    return {
      status: 'network',
      message: 'Impossible de joindre le cloud (vérifiez votre connexion internet).',
    };
  }
}

export function subscribeSharedEmbed(
  embedToken: string,
  onData: (snapshotData: SharedEmbedSnapshot) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (!isValidEmbedToken(embedToken)) {
    onError('Jeton d’intégration invalide.');
    return () => {};
  }

  let cancelled = false;
  let hasData = false;
  let snapshotHealthy = false;
  const controller = new AbortController();

  const runRestFetch = async () => {
    const res = await fetchSharedEmbedViaRest(embedToken, controller.signal);
    if (cancelled) return;
    if (res.status === 'ok') {
      hasData = true;
      onData(res.snapshot);
    } else if (!hasData) {
      onError(res.message);
    }
  };

  void runRestFetch();

  let unsubSnapshot: Unsubscribe | null = null;
  if (!useFirestoreRestFallback) {
    const ref = doc(db, 'sharedEmbeds', embedToken);
    unsubSnapshot = onSnapshot(
      ref,
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          if (!hasData) {
            onError('Ce lien embed n’est pas encore synchronisé avec le cloud.');
          }
          return;
        }
        snapshotHealthy = true;
        hasData = true;
        onData(parseSharedEmbedDocument(snap.id, snap.data()));
      },
      () => {
        if (cancelled || hasData) return;
        // En cas d'échec WebChannel initial, le fetch REST ci-dessus prend le relais
      }
    );
  }

  const pollTimer = setInterval(() => {
    if (cancelled || snapshotHealthy) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void runRestFetch();
  }, 20000);

  return () => {
    cancelled = true;
    controller.abort();
    clearInterval(pollTimer);
    if (unsubSnapshot) unsubSnapshot();
  };
}
