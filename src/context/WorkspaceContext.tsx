import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  DatabaseViewSettings,
  DatabaseViewType,
  ExploreModelId,
  ExploreSuggestedExercise,
  ExploreSuggestedSession,
  ExploreThread,
  ExploreTier,
  ExploreViewSettings,
  ImproPlanStep,
  ImproPrepareDraftConfig,
  ImproTimelineFilterPreset,
  MainViewMode,
  PageType,
  PrepareViewSettings,
  RowComment,
  SearchViewSettings,
  StatsViewSettings,
  SyncStatus,
  ThemeMode,
  TimelineViewSettings,
  ViewSettingKind,
  WorkspacePage,
  WorkspaceViewSettingsState,
} from '../types/workspace';
import {
  buildInitialRowCells,
  computeBottomRowOrder,
  computeTopRowOrder,
} from '../utils/databaseRowDraft';
import {
  getOriginLabel,
  pushDetailTrailEntry,
  truncateDetailTrailTo,
  type DetailOriginContext,
  type DetailTrailEntry,
} from '../utils/detailTrail';
import {
  AUTH_POPUP_MESSAGE_TYPE,
  buildAuthPopupUrl,
  generateAuthNonce,
  generateEmbedToken,
  isValidEmbedToken,
  parseEmbedTargetFromSearch,
  parseEmbedTokenFromSearch,
  type EmbedTarget,
} from '../utils/embedMode';
import { generateId } from '../utils/id';
import {
  fetchAndBuildImproEcosystem,
  IMPRO_COL_IDS,
  IMPRO_DB_IDS,
  type ImproEcosystemDataset,
} from '../utils/improCsvLoader';
import {
  computeBidirectionalRowPatches,
  computeDeleteRowsMirrorCleanup,
  computeImproEcosystem,
  getGroupMemberIds,
  isImproDatabasePage,
  normalizeSessionStatus,
  parseSessionPlan,
  serializeSessionPlan,
  type ImproEcosystemModel,
} from '../utils/improEngine';
import {
  clearLocalWorkspaceStorage,
  clearStoredViewSettings,
  loadLocalExploreThreads,
  loadLocalWorkspaceFromStorage,
  loadStoredLocalDirtyFlag,
  loadStoredTableOrders,
  loadStoredTheme,
  loadStoredViewSettings,
  parseWorkspaceSnapshot,
  saveLocalExploreThreads,
  saveLocalWorkspaceToStorage,
  saveStoredLocalDirtyFlag,
  saveStoredTableOrders,
  saveStoredTheme,
  saveStoredViewSettings,
  serializeWorkspaceSnapshot,
} from '../utils/localPersistence';
import {
  createDefaultWorkspaceViewSettings,
  extractDatabasePageIdFromDocId,
  getDatabaseSettingDocId,
  sanitizeDatabaseViewSettings,
  sanitizeExploreViewSettings,
  sanitizeNavViewSettings,
  sanitizePrepareViewSettings,
  sanitizeSearchViewSettings,
  sanitizeStatsViewSettings,
  sanitizeTableColumnOrdersMap,
  sanitizeTimelineViewSettings,
} from '../utils/viewSettings';
import type { ImportedPageDraft } from '../utils/notionImporter';
import { materializeImportedDrafts } from '../utils/notionImportMaterializer';
import { createSeedWorkspace } from '../utils/seedWorkspace';
import {
  createExerciseContentBlocks,
  type ExercisePageTemplateMode,
} from '../utils/exerciseContentTemplate';
import {
  hasValidContinuousExerciseScores,
  insertExerciseWithRank,
  moveExerciseRelativeToTarget,
  normalizeExerciseScores,
  setExerciseScoreDirect,
  stepExerciseInVisibleList,
  type ExerciseRankMutationResult,
  type ScoreSortDirection,
} from '../utils/exerciseRanking';
import { getPrimaryColumn } from '../utils/columnOrder';
import { getDescendantIds } from '../utils/treeUtils';
import { auth, ensureFirestoreNetwork, googleProvider } from '../services/firebase';
import {
  mergeBiblimproNotionBatch,
  type NotionExerciseSyncPayload,
  type NotionSyncMergeSummary,
} from '../utils/notionApiSync';
import {
  streamBiblimproFromNotion,
  syncSingleNotionExercise,
  type NotionBiblimproSyncProgress,
} from '../services/notionSyncService';
import {
  batchUpsertRowsInFirestore,
  createPageInFirestore,
  deleteExploreThreadInFirestore,
  deletePagePermanentlyInFirestore,
  deleteRowsInFirestore,
  ensureUserAndWorkspace,
  importNotionPagesToFirestore,
  seedImproDatabasesToFirestore,
  setFirestoreRestFallback,
  subscribeDatabaseRows,
  subscribeExploreThreads,
  subscribeSharedEmbed,
  subscribeViewSettings,
  subscribeWorkspacePages,
  updatePageContentInFirestore,
  updatePageFlagsInFirestore,
  updateUserThemeInFirestore,
  upsertExploreThreadInFirestore,
  upsertRowInFirestore,
  upsertSharedEmbedInFirestore,
  upsertViewSettingInFirestore,
} from '../services/workspaceService';

export type ImproDetailTarget = DetailTrailEntry;

interface WorkspaceContextValue {
  user: User | null;
  authReady: boolean;
  authError: string | null;
  syncStatus: SyncStatus;
  theme: ThemeMode;
  toggleTheme: () => void;
  signInGoogle: () => Promise<void>;
  retryCloudSync: () => Promise<void>;
  signOutUser: () => Promise<void>;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  activePageId: string | null;
  activePage: WorkspacePage | null;
  mainView: MainViewMode;
  embedTarget: EmbedTarget | null;
  urlEmbedToken: string | null;
  exercicesEmbedToken: string | null;
  embedSnapshotActive: boolean;
  embedSnapshotLoading: boolean;
  embedSnapshotError: string | null;
  embedSyncing: boolean;
  embedLastSyncedAt: string | null;
  embedReadOnlyNotice: string | null;
  dismissEmbedReadOnlyNotice: () => void;
  ensureExercicesEmbedLink: () => Promise<string | null>;
  syncExercicesSharedEmbedNow: () => Promise<string | null>;
  setMainView: (view: MainViewMode) => void;
  selectPage: (pageId: string) => void;
  createPage: (type: PageType, parentId?: string | null) => Promise<string>;
  updatePageTitle: (pageId: string, title: string) => void;
  updatePageIcon: (pageId: string, icon: string) => void;
  updatePageBlocks: (pageId: string, blocks: BlockItem[]) => void;
  updateDatabaseColumns: (pageId: string, columns: DatabaseColumn[]) => void;
  updateDatabaseView: (pageId: string, view: DatabaseViewType) => void;
  databaseSorts: Record<string, DatabaseSortRule[]>;
  setDatabaseSorts: (pageId: string, rules: DatabaseSortRule[]) => void;
  columnWidths: Record<string, Record<string, number>>;
  setColumnWidth: (pageId: string, colId: string, width: number) => void;
  resetColumnWidth: (pageId: string, colId?: string) => void;
  tableColumnOrders: Record<string, string[]>;
  setTableColumnOrder: (tableKey: string, order: string[]) => void;
  toggleFavorite: (pageId: string) => Promise<void>;
  moveToTrash: (pageId: string) => Promise<void>;
  restoreFromTrash: (pageId: string) => Promise<void>;
  deletePermanently: (pageId: string) => Promise<void>;
  addDatabaseRow: (
    pageId: string,
    initialCells?: Record<string, CellValue>,
    options?: { insertAt?: 'top' | 'bottom' }
  ) => Promise<string | undefined>;
  updateDatabaseRow: (
    pageId: string,
    rowId: string,
    cells: Record<string, CellValue>,
    linkedPageId?: string | null
  ) => void;
  updateRowBlocks: (pageId: string, rowId: string, blocks: BlockItem[]) => void;
  updateRowComments: (pageId: string, rowId: string, comments: RowComment[]) => void;
  deleteDatabaseRow: (pageId: string, rowId: string) => Promise<void>;
  deleteDatabaseRows: (pageId: string, rowIds: string[]) => Promise<void>;
  openOrCreateRowPage: (
    dbPageId: string,
    rowId: string,
    options?: { navigate?: boolean; template?: ExercisePageTemplateMode }
  ) => Promise<string | null>;
  importNotionDrafts: (drafts: ImportedPageDraft[], targetParentId?: string | null) => Promise<string[]>;
  pendingLocalDraftsCount: number;
  migrateLocalPagesToCloud: () => Promise<void>;
  dismissLocalMigration: () => void;
  exportWorkspaceJson: () => string;
  importWorkspaceJson: (jsonText: string) => boolean;
  resetToDemoWorkspace: () => Promise<void>;
  // Command Palette & Live Animation
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  liveSessionId: string | null;
  openLiveAnimation: (seanceId: string) => void;
  closeLiveAnimation: () => void;
  // Écosystème Impro
  improModel: ImproEcosystemModel;
  improLoading: boolean;
  improError: string | null;
  improDetailTarget: ImproDetailTarget | null;
  detailTrail: DetailTrailEntry[];
  detailOrigin: DetailOriginContext | null;
  openImproDetail: (pageId: string, rowId: string, focusInput?: boolean) => void;
  navigateDetailTrailTo: (index: number) => void;
  returnToDetailOrigin: () => void;
  closeImproDetail: () => void;
  prefillSeanceFromGroup: (seanceRowId: string, mode?: 'merge' | 'replace') => void;
  toggleSeanceStatus: (seanceRowId: string) => void;
  toggleSeanceParticipant: (seanceRowId: string, participantId: string) => void;
  timelinePreset: ImproTimelineFilterPreset | null;
  navigateToTimeline: (preset?: ImproTimelineFilterPreset) => void;
  clearTimelinePreset: () => void;
  prepareDraft: ImproPrepareDraftConfig | null;
  navigateToPrepare: (config?: ImproPrepareDraftConfig) => void;
  clearPrepareDraft: () => void;
  loadImproDatabases: () => Promise<void>;
  moveExerciseRank: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
    options?: { scoreSortDir?: ScoreSortDirection }
  ) => void;
  stepExerciseRank: (
    visibleRowIds: string[],
    sourceId: string,
    delta: -1 | 1,
    options?: { scoreSortDir?: ScoreSortDirection }
  ) => void;
  setExerciseScore: (rowId: string, desiredScore: CellValue | undefined) => void;
  // Explore (Conseiller IA)
  exploreThreads: ExploreThread[];
  activeExploreThreadId: string | null;
  createExploreThread: (initial?: {
    title?: string;
    groupId?: string;
    thematique?: string;
    modelId?: ExploreModelId;
    tier?: ExploreTier;
    useWebSearch?: boolean;
  }) => Promise<ExploreThread>;
  selectExploreThread: (threadId: string) => void;
  updateExploreThread: (
    threadId: string,
    patch: Partial<
      Pick<
        ExploreThread,
        'title' | 'groupId' | 'thematique' | 'modelId' | 'tier' | 'useWebSearch' | 'messages'
      >
    >
  ) => Promise<void>;
  deleteExploreThread: (threadId: string) => Promise<void>;
  addSuggestedExerciseToBiblimpro: (
    suggestion: ExploreSuggestedExercise,
    contextMeta?: { threadId?: string; messageId?: string }
  ) => Promise<string | undefined>;
  addExerciseToPlannedSeance: (
    exerciceId: string,
    seanceId: string,
    options?: { durationMin?: number; note?: string }
  ) => void;
  createSessionInPrepareFromExplore: (
    session: ExploreSuggestedSession,
    groupId: string,
    contextMeta?: { threadId?: string; messageId?: string }
  ) => Promise<void>;
  // Synchronisation directe API Notion (Biblimpro)
  notionSyncModalOpen: boolean;
  setNotionSyncModalOpen: (open: boolean) => void;
  syncBiblimproFromNotion: (options?: {
    mode?: 'missing' | 'all';
    databaseId?: string;
    signal?: AbortSignal;
    onProgress?: (progress: NotionBiblimproSyncProgress) => void;
  }) => Promise<{
    summary: NotionSyncMergeSummary;
    databaseTitle: string;
    skippedCount: number;
    warnings: string[];
  }>;
  syncSingleExerciseFromNotion: (
    rowId: string,
    databaseId?: string
  ) => Promise<{
    updated: boolean;
    blocksCount: number;
    commentsCount: number;
    warning?: string;
  }>;
  // Réglages persistés par vue/page
  viewSettings: WorkspaceViewSettingsState;
  updateDatabaseViewSettings: (
    pageId: string,
    patch:
      | Partial<DatabaseViewSettings>
      | ((prev: DatabaseViewSettings) => DatabaseViewSettings)
  ) => void;
  updatePrepareSettings: (
    patch: Partial<PrepareViewSettings> | ((prev: PrepareViewSettings) => PrepareViewSettings)
  ) => void;
  updateTimelineSettings: (
    patch: Partial<TimelineViewSettings> | ((prev: TimelineViewSettings) => TimelineViewSettings)
  ) => void;
  updateStatsSettings: (
    patch: Partial<StatsViewSettings> | ((prev: StatsViewSettings) => StatsViewSettings)
  ) => void;
  updateExploreViewSettings: (
    patch: Partial<ExploreViewSettings> | ((prev: ExploreViewSettings) => ExploreViewSettings)
  ) => void;
  updateSearchViewSettings: (
    patch: Partial<SearchViewSettings> | ((prev: SearchViewSettings) => SearchViewSettings)
  ) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function asIdList(val: CellValue | undefined): string[] {
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const initialStored = useMemo(() => loadLocalWorkspaceFromStorage(), []);
  const initialSeed = useMemo(() => createSeedWorkspace('local', 'local'), []);
  const initialViewSettings = useMemo(() => loadStoredViewSettings(), []);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>('local');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [theme, setTheme] = useState<ThemeMode>(() => loadStoredTheme());

  const embedTarget = useMemo<EmbedTarget | null>(
    () => (typeof window !== 'undefined' ? parseEmbedTargetFromSearch(window.location.search) : null),
    []
  );
  const urlEmbedToken = useMemo<string | null>(
    () => (typeof window !== 'undefined' ? parseEmbedTokenFromSearch(window.location.search) : null),
    []
  );
  const usesSharedEmbedSnapshotOnBoot = embedTarget === 'exercices' && urlEmbedToken !== null;

  const [pages, setPages] = useState<WorkspacePage[]>(() =>
    usesSharedEmbedSnapshotOnBoot ? [] : initialStored?.pages ?? initialSeed.pages
  );
  const [rowsByPage, setRowsByPage] = useState<Record<string, DatabaseRow[]>>(() =>
    usesSharedEmbedSnapshotOnBoot ? {} : initialStored?.rowsByPage ?? initialSeed.rowsByPage
  );
  const [activePageId, setActivePageId] = useState<string | null>(() => {
    if (embedTarget === 'exercices') return IMPRO_DB_IDS.exercices;
    return (
      initialStored?.activePageId ??
      initialViewSettings.nav.activePageId ??
      initialSeed.pages[0]?.id ??
      null
    );
  });
  const [mainView, setMainViewState] = useState<MainViewMode>(() =>
    embedTarget === 'exercices' ? 'page' : initialViewSettings.nav.mainView
  );
  const [viewSettings, setViewSettings] = useState<WorkspaceViewSettingsState>(
    () => initialViewSettings
  );
  const [localDirtyPages, setLocalDirtyPages] = useState<WorkspacePage[]>([]);
  const [hasLocalEdits, setHasLocalEdits] = useState<boolean>(() => loadStoredLocalDirtyFlag());
  const [improLoading, setImproLoading] = useState<boolean>(() =>
    usesSharedEmbedSnapshotOnBoot ? true : !initialStored
  );
  const [improError, setImproError] = useState<string | null>(null);
  const [embedSnapshotActive, setEmbedSnapshotActive] = useState<boolean>(false);
  const [embedSnapshotLoading, setEmbedSnapshotLoading] = useState<boolean>(
    () => usesSharedEmbedSnapshotOnBoot
  );
  const [embedSnapshotError, setEmbedSnapshotError] = useState<string | null>(null);
  const [embedSyncing, setEmbedSyncing] = useState<boolean>(false);
  const [embedLastSyncedAt, setEmbedLastSyncedAt] = useState<string | null>(null);
  const [embedReadOnlyNotice, setEmbedReadOnlyNotice] = useState<string | null>(null);
  const [detailTrail, setDetailTrail] = useState<DetailTrailEntry[]>([]);
  const [detailOrigin, setDetailOrigin] = useState<DetailOriginContext | null>(null);
  const improDetailTarget: ImproDetailTarget | null =
    detailTrail.length > 0 ? detailTrail[detailTrail.length - 1] : null;
  const [timelinePreset, setTimelinePreset] = useState<ImproTimelineFilterPreset | null>(null);
  const [prepareDraft, setPrepareDraft] = useState<ImproPrepareDraftConfig | null>(null);
  const [tableColumnOrders, setTableColumnOrders] = useState<Record<string, string[]>>(() =>
    loadStoredTableOrders()
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [notionSyncModalOpen, setNotionSyncModalOpen] = useState(false);
  const [exploreThreads, setExploreThreads] = useState<ExploreThread[]>(() =>
    loadLocalExploreThreads()
  );
  const [activeExploreThreadId, setActiveExploreThreadId] = useState<string | null>(
    () => initialViewSettings.explore.activeThreadId ?? loadLocalExploreThreads()[0]?.id ?? null
  );

  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const rowsRef = useRef(rowsByPage);
  rowsRef.current = rowsByPage;
  const mainViewRef = useRef(mainView);
  mainViewRef.current = mainView;
  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;
  const viewSettingsRef = useRef(viewSettings);
  viewSettingsRef.current = viewSettings;
  const tableColumnOrdersRef = useRef(tableColumnOrders);
  tableColumnOrdersRef.current = tableColumnOrders;
  const prepareDraftRef = useRef(prepareDraft);
  prepareDraftRef.current = prepareDraft;
  const exploreThreadsRef = useRef(exploreThreads);
  exploreThreadsRef.current = exploreThreads;
  const activeExploreThreadIdRef = useRef(activeExploreThreadId);
  activeExploreThreadIdRef.current = activeExploreThreadId;
  const detailOriginRef = useRef(detailOrigin);
  detailOriginRef.current = detailOrigin;
  const focusTickCounterRef = useRef(1);
  const userRef = useRef(user);
  userRef.current = user;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const hasLocalEditsRef = useRef(hasLocalEdits);
  hasLocalEditsRef.current = hasLocalEdits;
  const improCsvCacheRef = useRef<ImproEcosystemDataset | null>(null);
  const backfilledCheckboxesKeyRef = useRef<string | null>(null);
  const backfilledScoreKeyRef = useRef<string | null>(null);
  const backfilledSeanceMetaKeyRef = useRef<string | null>(null);
  const navTouchedByUserRef = useRef(false);
  const cloudPagesLoadedRef = useRef(false);
  const exercicesRowsLoadedRef = useRef(false);
  const pagesUnsubRef = useRef<(() => void) | null>(null);
  const embedSnapshotActiveRef = useRef(embedSnapshotActive);
  embedSnapshotActiveRef.current = embedSnapshotActive;

  const exercicesEmbedToken = useMemo<string | null>(() => {
    const t = viewSettings.databaseByPageId[IMPRO_DB_IDS.exercices]?.embedToken;
    return isValidEmbedToken(t) ? t : null;
  }, [viewSettings.databaseByPageId]);

  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPagePatchesRef = useRef<
    Map<string, Parameters<typeof updatePageContentInFirestore>[2]>
  >(new Map());
  const pendingRowBatchRef = useRef<Map<string, DatabaseRow>>(new Map());
  const rowBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewSettingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingViewSettingPayloadsRef = useRef<
    Map<string, { kind: ViewSettingKind; settings: unknown }>
  >(new Map());
  const pendingViewSettingKeysRef = useRef<Set<string>>(new Set());
  const knownViewSettingIdsRef = useRef<Set<string>>(new Set());
  const sharedEmbedSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authRelayCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      authRelayCleanupRef.current?.();
      authRelayCleanupRef.current = null;
    };
  }, []);

  // Raccourci global Cmd+K / Ctrl+K pour la palette de commandes (désactivé en mode embed)
  useEffect(() => {
    if (embedTarget !== null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [embedTarget]);

  // Synchroniser la classe CSS .dark sur <html> et persister le thème
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveStoredTheme(theme);
  }, [theme]);

  // Sauvegarder les ordres de colonnes localement
  useEffect(() => {
    saveStoredTableOrders(tableColumnOrders);
  }, [tableColumnOrders]);

  // Sauvegarder les derniers réglages de vue localement (cache immédiat)
  useEffect(() => {
    saveStoredViewSettings(viewSettings);
  }, [viewSettings]);

  // Persister le drapeau d'éditions locales réelles
  useEffect(() => {
    if (user || workspaceId !== 'local' || embedSnapshotActive || usesSharedEmbedSnapshotOnBoot) {
      return;
    }
    saveStoredLocalDirtyFlag(hasLocalEdits);
  }, [hasLocalEdits, user, workspaceId, embedSnapshotActive, usesSharedEmbedSnapshotOnBoot]);

  // Sauvegarde automatique locale en mode hors-connexion / local
  useEffect(() => {
    if (user || workspaceId !== 'local' || embedSnapshotActive || usesSharedEmbedSnapshotOnBoot) {
      return;
    }
    if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    localSaveTimerRef.current = setTimeout(() => {
      saveLocalWorkspaceToStorage(pages, rowsByPage, activePageId);
    }, 220);
    return () => {
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    };
  }, [pages, rowsByPage, activePageId, user, workspaceId, embedSnapshotActive, usesSharedEmbedSnapshotOnBoot]);

  useEffect(() => {
    if (user || workspaceId !== 'local' || embedSnapshotActive || usesSharedEmbedSnapshotOnBoot) {
      return;
    }
    saveLocalExploreThreads(exploreThreads);
  }, [exploreThreads, user, workspaceId, embedSnapshotActive, usesSharedEmbedSnapshotOnBoot]);

  // Charger les 4 CSV Impro en mémoire locale si aucune sauvegarde locale existante (ignoré en embed par jeton cloud)
  useEffect(() => {
    if (usesSharedEmbedSnapshotOnBoot) return;
    let cancelled = false;
    if (initialStored && hasImproInSnapshot(initialStored.pages)) {
      setImproLoading(false);
      return;
    }
    setImproLoading(true);
    setImproError(null);
    fetchAndBuildImproEcosystem('local', 'local', 0)
      .then((dataset) => {
        if (cancelled) return;
        improCsvCacheRef.current = dataset;
        if (!userRef.current && !hasLocalEditsRef.current && !initialStored) {
          setPages(dataset.pages);
          setRowsByPage(dataset.rowsByPage);
          setActivePageId((prev) =>
            prev && dataset.pages.some((p) => p.id === prev && !p.isTrashed)
              ? prev
              : dataset.pages[0]?.id ?? null
          );
        }
        setImproLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setImproLoading(false);
        setImproError(err instanceof Error ? err.message : 'Erreur chargement CSV');
      });
    return () => {
      cancelled = true;
    };
  }, [initialStored, usesSharedEmbedSnapshotOnBoot]);

  const connectUserCloudSession = useCallback(
    async (nextUser: User) => {
      if (pagesUnsubRef.current) {
        pagesUnsubRef.current();
        pagesUnsubRef.current = null;
      }
      cloudPagesLoadedRef.current = false;
      exercicesRowsLoadedRef.current = false;
      setEmbedSnapshotActive(false);
      setEmbedSnapshotLoading(false);
      setEmbedSnapshotError(null);
      setEmbedReadOnlyNotice(null);
      setUser(nextUser);
      setAuthError(null);
      setSyncStatus('syncing');
      if (hasLocalEditsRef.current) {
        setLocalDirtyPages(
          pagesRef.current.filter((p) => !p.isTrashed && !isImproDatabasePage(p.id))
        );
      }

      try {
        const res = await ensureUserAndWorkspace(nextUser, themeRef.current);
        if (userRef.current?.uid !== nextUser.uid) return;
        setWorkspaceId(res.workspaceId);
        setTheme(res.theme);

        pagesUnsubRef.current = subscribeWorkspacePages(
          res.workspaceId,
          nextUser.uid,
          (cloudPages) => {
            cloudPagesLoadedRef.current = true;
            const mergedPages = cloudPages.map((cp) => {
              const pending = pendingPagePatchesRef.current.get(cp.id);
              return pending ? { ...cp, ...pending } : cp;
            });
            setPages(mergedPages);
            setSyncStatus('synced');
            setActivePageId((prev) => {
              if (
                embedTarget === 'exercices' &&
                mergedPages.some((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed)
              ) {
                return IMPRO_DB_IDS.exercices;
              }
              if (prev && mergedPages.some((p) => p.id === prev && !p.isTrashed)) {
                return prev;
              }
              const firstActive = mergedPages.find((p) => !p.isTrashed);
              return firstActive?.id ?? null;
            });
          }
        );
      } catch (err) {
        setSyncStatus('error');
        setAuthError(err instanceof Error ? err.message : 'Erreur de synchronisation');
      } finally {
        setAuthReady(true);
      }
    },
    [embedTarget]
  );

  // Suivi Firebase Auth
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (pagesUnsubRef.current) {
        pagesUnsubRef.current();
        pagesUnsubRef.current = null;
      }
      if (!nextUser) {
        setFirestoreRestFallback(false);
        cloudPagesLoadedRef.current = false;
        exercicesRowsLoadedRef.current = false;
        setUser(null);
        setWorkspaceId('local');
        setSyncStatus('local');
        if (usesSharedEmbedSnapshotOnBoot) {
          setEmbedSnapshotLoading(true);
        }
        setAuthReady(true);
        return;
      }
      await connectUserCloudSession(nextUser);
    });

    return () => {
      unsubAuth();
      if (pagesUnsubRef.current) {
        pagesUnsubRef.current();
        pagesUnsubRef.current = null;
      }
    };
  }, [connectUserCloudSession, usesSharedEmbedSnapshotOnBoot]);

  // Abonnement temps réel à la sauvegarde cloud partagée via ?embed=exercices&token=emb_... lorsque déconnecté
  useEffect(() => {
    if (!authReady || user || !usesSharedEmbedSnapshotOnBoot || !urlEmbedToken) return;
    setEmbedSnapshotLoading(true);
    setEmbedSnapshotError(null);
    const unsub = subscribeSharedEmbed(
      urlEmbedToken,
      (snap) => {
        pagesRef.current = snap.pages;
        setPages(snap.pages);
        rowsRef.current = snap.rowsByPage;
        setRowsByPage(snap.rowsByPage);
        if (snap.tableOrders && Object.keys(snap.tableOrders).length > 0) {
          const nextOrders = { ...tableColumnOrdersRef.current, ...snap.tableOrders };
          tableColumnOrdersRef.current = nextOrders;
          setTableColumnOrders(nextOrders);
        }
        setActivePageId(IMPRO_DB_IDS.exercices);
        setEmbedSnapshotActive(true);
        setEmbedSnapshotLoading(false);
        setEmbedSnapshotError(null);
        setImproLoading(false);
      },
      (errMessage) => {
        setEmbedSnapshotActive(false);
        setEmbedSnapshotLoading(false);
        setEmbedSnapshotError(errMessage);
        setImproLoading(false);
      }
    );
    return () => unsub();
  }, [authReady, user, usesSharedEmbedSnapshotOnBoot, urlEmbedToken]);

  const activeDbIdsKey = useMemo(
    () =>
      pages
        .filter((p) => p.type === 'database' && !p.isTrashed)
        .map((p) => p.id)
        .sort()
        .join(','),
    [pages]
  );

  // Abonnement temps réel aux lignes des bases de données lorsque connecté
  useEffect(() => {
    if (!user || workspaceId === 'local' || !activeDbIdsKey) return;
    const dbIds = activeDbIdsKey.split(',').filter(Boolean);
    const unsubs = dbIds.map((dbPageId) =>
      subscribeDatabaseRows(workspaceId, dbPageId, user.uid, (rows) => {
        if (dbPageId === IMPRO_DB_IDS.exercices) {
          exercicesRowsLoadedRef.current = true;
        }
        setRowsByPage((prev) => ({ ...prev, [dbPageId]: rows }));
      })
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, workspaceId, activeDbIdsKey]);

  // Abonnement temps réel aux fils Explore lorsque connecté
  useEffect(() => {
    if (!user || workspaceId === 'local') return;
    const unsub = subscribeExploreThreads(workspaceId, user.uid, (cloudThreads) => {
      const sorted = [...cloudThreads].sort((a, b) => {
        const lastA = a.messages[a.messages.length - 1]?.createdAt ?? '';
        const lastB = b.messages[b.messages.length - 1]?.createdAt ?? '';
        return lastB.localeCompare(lastA);
      });
      setExploreThreads(sorted);
      setActiveExploreThreadId((prev) => {
        if (prev && sorted.some((t) => t.id === prev)) return prev;
        const preferred = viewSettingsRef.current.explore.activeThreadId;
        if (preferred && sorted.some((t) => t.id === preferred)) return preferred;
        return sorted[0]?.id ?? null;
      });
    });
    return () => unsub();
  }, [user, workspaceId]);

  // Abonnement temps réel aux réglages de vue lorsque connecté
  useEffect(() => {
    if (!user || workspaceId === 'local') return;
    const unsub = subscribeViewSettings(workspaceId, user.uid, (records) => {
      knownViewSettingIdsRef.current = new Set(records.map((r) => r.id));
      const pendingKeys = pendingViewSettingKeysRef.current;
      let nextTableOrders: Record<string, string[]> | null = null;
      let hydratedNav: ReturnType<typeof sanitizeNavViewSettings> | null = null;
      let hydratedExploreActiveId: string | null = null;

      setViewSettings((prev) => {
        let next = prev;
        const ensureCopy = () => {
          if (next === prev) {
            next = { ...prev, databaseByPageId: { ...prev.databaseByPageId } };
          }
        };

        for (const rec of records) {
          if (pendingKeys.has(rec.id)) continue;
          switch (rec.kind) {
            case 'nav': {
              if (navTouchedByUserRef.current) break;
              const navVal = sanitizeNavViewSettings(rec.settings);
              ensureCopy();
              next.nav = navVal;
              hydratedNav = navVal;
              break;
            }
            case 'database': {
              const pageId = extractDatabasePageIdFromDocId(rec.id);
              if (!pageId) break;
              ensureCopy();
              next.databaseByPageId[pageId] = sanitizeDatabaseViewSettings(rec.settings);
              break;
            }
            case 'prepare': {
              if (prepareDraftRef.current) break;
              ensureCopy();
              next.prepare = sanitizePrepareViewSettings(rec.settings);
              break;
            }
            case 'timeline': {
              ensureCopy();
              next.timeline = sanitizeTimelineViewSettings(rec.settings);
              break;
            }
            case 'stats': {
              ensureCopy();
              next.stats = sanitizeStatsViewSettings(rec.settings);
              break;
            }
            case 'explore': {
              const expVal = sanitizeExploreViewSettings(rec.settings);
              ensureCopy();
              next.explore = expVal;
              hydratedExploreActiveId = expVal.activeThreadId;
              break;
            }
            case 'search': {
              ensureCopy();
              next.search = sanitizeSearchViewSettings(rec.settings);
              break;
            }
            case 'table_orders': {
              const rawOrders = (rec.settings as Record<string, unknown>).orders ?? rec.settings;
              nextTableOrders = sanitizeTableColumnOrdersMap(rawOrders);
              break;
            }
          }
        }
        viewSettingsRef.current = next;
        return next;
      });

      if (hydratedNav && embedTarget === null) {
        const nav = hydratedNav as ReturnType<typeof sanitizeNavViewSettings>;
        setMainViewState(nav.mainView);
        if (nav.activePageId) {
          if (
            !cloudPagesLoadedRef.current ||
            pagesRef.current.some((p) => p.id === nav.activePageId && !p.isTrashed)
          ) {
            setActivePageId(nav.activePageId);
          }
        }
      }
      if (hydratedExploreActiveId) {
        setActiveExploreThreadId((cur) => {
          if (
            exploreThreadsRef.current.length === 0 ||
            exploreThreadsRef.current.some((t) => t.id === hydratedExploreActiveId)
          ) {
            return hydratedExploreActiveId;
          }
          return cur;
        });
      }
      if (nextTableOrders && !pendingKeys.has('table_orders')) {
        setTableColumnOrders(nextTableOrders);
      }
    });
    return () => unsub();
  }, [user, workspaceId]);

  // Rattrapage non destructif des 3 colonnes à cocher (1, 2, V)
  useEffect(() => {
    if (embedSnapshotActive || (usesSharedEmbedSnapshotOnBoot && !user)) return;
    const exPage = pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed);
    const exRows = rowsByPage[IMPRO_DB_IDS.exercices];
    if (!exPage || !exRows || exRows.length === 0) return;

    const requiredIds = [
      IMPRO_COL_IDS.exercices.check1,
      IMPRO_COL_IDS.exercices.check2,
      IMPRO_COL_IDS.exercices.checkV,
    ];
    const existingColIds = new Set((exPage.columns ?? []).map((c) => c.id));
    const missingColIds = requiredIds.filter((id) => !existingColIds.has(id));
    if (missingColIds.length === 0) return;

    const backfillKey = `${workspaceId}:${user?.uid ?? 'local'}`;
    if (backfilledCheckboxesKeyRef.current === backfillKey) return;
    backfilledCheckboxesKeyRef.current = backfillKey;

    let cancelled = false;
    (async () => {
      try {
        const csvDataset =
          improCsvCacheRef.current ??
          (await fetchAndBuildImproEcosystem(workspaceId, user?.uid ?? 'local', 0));
        if (cancelled) return;
        improCsvCacheRef.current = csvDataset;

        const csvExPage = csvDataset.pages.find((p) => p.id === IMPRO_DB_IDS.exercices);
        const csvCheckCols = (csvExPage?.columns ?? []).filter((c) =>
          missingColIds.includes(c.id as (typeof requiredIds)[number])
        );
        if (csvCheckCols.length === 0) return;

        const currentCols = exPage.columns ?? [];
        const insertAfterIdx = currentCols.findIndex((c) => c.id === IMPRO_COL_IDS.exercices.nom);
        const pivot = insertAfterIdx >= 0 ? insertAfterIdx + 1 : 1;
        const mergedCols = [
          ...currentCols.slice(0, pivot),
          ...csvCheckCols,
          ...currentCols.slice(pivot),
        ];

        const csvExRows = csvDataset.rowsByPage[IMPRO_DB_IDS.exercices] ?? [];
        const csvById = new Map(csvExRows.map((r) => [r.id, r]));
        const csvByName = new Map(
          csvExRows.map((r) => [
            String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase(),
            r,
          ])
        );

        const patchedRows: DatabaseRow[] = [];
        const nextExRows = exRows.map((row) => {
          const rowName = String(row.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase();
          const sourceRow = csvById.get(row.id) ?? csvByName.get(rowName);
          let changed = false;
          const nextCells = { ...row.cells };
          for (const cid of requiredIds) {
            if (!(cid in nextCells)) {
              nextCells[cid] = Boolean(sourceRow?.cells[cid]);
              changed = true;
            }
          }
          if (!changed) return row;
          const updatedRow: DatabaseRow = { ...row, cells: nextCells };
          patchedRows.push(updatedRow);
          return updatedRow;
        });

        setPages((prev) =>
          prev.map((p) => (p.id === IMPRO_DB_IDS.exercices ? { ...p, columns: mergedCols } : p))
        );
        if (patchedRows.length > 0) {
          setRowsByPage((prev) => ({ ...prev, [IMPRO_DB_IDS.exercices]: nextExRows }));
        }

        if (user && workspaceId !== 'local') {
          await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.exercices, {
            columns: mergedCols,
          });
          if (patchedRows.length > 0) {
            await batchUpsertRowsInFirestore(patchedRows);
          }
        }
      } catch {
        // Rattrapage silencieux
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pages, rowsByPage, user, workspaceId]);

  // Rattrapage non destructif de la colonne Score (rang continu 1..N) sur Biblimpro
  useEffect(() => {
    if (embedSnapshotActive || (usesSharedEmbedSnapshotOnBoot && !user)) return;
    const exPage = pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed);
    const exRows = rowsByPage[IMPRO_DB_IDS.exercices];
    if (!exPage || !exRows) return;

    const existingColIds = new Set((exPage.columns ?? []).map((c) => c.id));
    const missingScoreCol = !existingColIds.has(IMPRO_COL_IDS.exercices.score);
    const needsRowScoreNormalization =
      exRows.length > 0 && !hasValidContinuousExerciseScores(exRows);

    if (!missingScoreCol && !needsRowScoreNormalization) return;

    const backfillKey = `${workspaceId}:${user?.uid ?? 'local'}:${exRows.length}`;
    if (backfilledScoreKeyRef.current === backfillKey) return;
    backfilledScoreKeyRef.current = backfillKey;

    const currentCols = exPage.columns ?? [];
    let mergedCols = currentCols;
    if (missingScoreCol) {
      const insertAfterIdx = currentCols.findIndex((c) => c.id === IMPRO_COL_IDS.exercices.nom);
      const pivot = insertAfterIdx >= 0 ? insertAfterIdx + 1 : 1;
      const scoreCol: DatabaseColumn = {
        id: IMPRO_COL_IDS.exercices.score,
        name: 'Score',
        type: 'number',
      };
      mergedCols = [
        ...currentCols.slice(0, pivot),
        scoreCol,
        ...currentCols.slice(pivot),
      ];
      setPages((prev) =>
        prev.map((p) => (p.id === IMPRO_DB_IDS.exercices ? { ...p, columns: mergedCols } : p))
      );
    }

    let patchedRows: DatabaseRow[] = [];
    if (needsRowScoreNormalization) {
      const norm = normalizeExerciseScores(exRows);
      patchedRows = norm.changedRows;
      rowsRef.current = { ...rowsRef.current, [IMPRO_DB_IDS.exercices]: norm.nextRows };
      setRowsByPage((prev) => ({ ...prev, [IMPRO_DB_IDS.exercices]: norm.nextRows }));
    }

    if (user && workspaceId !== 'local') {
      void (async () => {
        try {
          if (missingScoreCol) {
            await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.exercices, {
              columns: mergedCols,
            });
          }
          if (patchedRows.length > 0) {
            await batchUpsertRowsInFirestore(patchedRows);
          }
        } catch {
          // Rattrapage silencieux
        }
      })();
    }
  }, [pages, rowsByPage, user, workspaceId]);

  // Rattrapage non destructif des colonnes Statut et Notes sur la base Séances
  useEffect(() => {
    if (embedSnapshotActive || (usesSharedEmbedSnapshotOnBoot && !user)) return;
    const seaPage = pages.find((p) => p.id === IMPRO_DB_IDS.seances && !p.isTrashed);
    const seaRows = rowsByPage[IMPRO_DB_IDS.seances];
    if (!seaPage || !seaRows) return;

    const existingColIds = new Set((seaPage.columns ?? []).map((c) => c.id));
    const missingStatut = !existingColIds.has(IMPRO_COL_IDS.seances.statut);
    const missingNotes = !existingColIds.has(IMPRO_COL_IDS.seances.notes);
    if (!missingStatut && !missingNotes) return;

    const backfillKey = `${workspaceId}:${user?.uid ?? 'local'}`;
    if (backfilledSeanceMetaKeyRef.current === backfillKey) return;
    backfilledSeanceMetaKeyRef.current = backfillKey;

    const nextCols = [...(seaPage.columns ?? [])];
    if (missingStatut) {
      const dateIdx = nextCols.findIndex((c) => c.id === IMPRO_COL_IDS.seances.date);
      const statutCol: DatabaseColumn = {
        id: IMPRO_COL_IDS.seances.statut,
        name: 'Statut',
        type: 'select',
        options: ['Réalisée', 'Préparée'],
      };
      if (dateIdx >= 0) nextCols.splice(dateIdx + 1, 0, statutCol);
      else nextCols.push(statutCol);
    }
    if (missingNotes) {
      nextCols.push({ id: IMPRO_COL_IDS.seances.notes, name: 'Notes', type: 'text' });
    }

    const patchedRows: DatabaseRow[] = [];
    const nextSeaRows = seaRows.map((row) => {
      if (IMPRO_COL_IDS.seances.statut in row.cells) return row;
      const updatedRow: DatabaseRow = {
        ...row,
        cells: {
          ...row.cells,
          [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
          ...(IMPRO_COL_IDS.seances.notes in row.cells ? {} : { [IMPRO_COL_IDS.seances.notes]: '' }),
        },
      };
      patchedRows.push(updatedRow);
      return updatedRow;
    });

    setPages((prev) =>
      prev.map((p) => (p.id === IMPRO_DB_IDS.seances ? { ...p, columns: nextCols } : p))
    );
    if (patchedRows.length > 0) {
      setRowsByPage((prev) => ({ ...prev, [IMPRO_DB_IDS.seances]: nextSeaRows }));
    }

    if (user && workspaceId !== 'local') {
      void (async () => {
        try {
          await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.seances, {
            columns: nextCols,
          });
          if (patchedRows.length > 0) {
            await batchUpsertRowsInFirestore(patchedRows);
          }
        } catch {
          // Rattrapage silencieux
        }
      })();
    }
  }, [pages, rowsByPage, user, workspaceId]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      if (user) {
        void updateUserThemeInFirestore(user.uid, next);
      }
      return next;
    });
  }, [user]);

  const signInGoogle = useCallback(async () => {
    setAuthError(null);
    const isInIframe = (() => {
      if (typeof window === 'undefined') return false;
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    if (isInIframe && typeof window !== 'undefined') {
      authRelayCleanupRef.current?.();
      authRelayCleanupRef.current = null;

      const nonce = generateAuthNonce();
      const popupUrl = buildAuthPopupUrl(window.location.href, nonce);
      const popup = window.open(
        popupUrl,
        'flownote_google_auth',
        'popup=yes,width=520,height=660'
      );

      if (!popup) {
        setAuthError('auth/popup-blocked');
        return;
      }

      await new Promise<void>((resolve) => {
        let finished = false;
        let closedTimer: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
          if (finished) return;
          finished = true;
          window.removeEventListener('message', onMessage);
          if (closedTimer) {
            clearInterval(closedTimer);
            closedTimer = null;
          }
          if (authRelayCleanupRef.current === cleanup) {
            authRelayCleanupRef.current = null;
          }
          resolve();
        };

        const onMessage = async (ev: MessageEvent) => {
          if (ev.origin !== window.location.origin) return;
          if (ev.source !== popup) return;
          const data = ev.data as {
            type?: unknown;
            nonce?: unknown;
            idToken?: unknown;
            accessToken?: unknown;
          } | null;
          if (!data || data.type !== AUTH_POPUP_MESSAGE_TYPE || data.nonce !== nonce) return;

          const idToken = typeof data.idToken === 'string' && data.idToken ? data.idToken : null;
          const accessToken =
            typeof data.accessToken === 'string' && data.accessToken ? data.accessToken : null;
          if (!idToken && !accessToken) return;

          cleanup();
          try {
            const credential = GoogleAuthProvider.credential(idToken, accessToken);
            await signInWithCredential(auth, credential);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Connexion annulée';
            setAuthError(msg);
          }
        };

        window.addEventListener('message', onMessage);
        closedTimer = setInterval(() => {
          try {
            if (popup.closed) {
              cleanup();
              if (!auth.currentUser) {
                setAuthError('auth/popup-closed-by-user');
              }
            }
          } catch {
            // Ignore si accès bloqué
          }
        }, 450);

        authRelayCleanupRef.current = cleanup;
      });
      return;
    }

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connexion annulée';
      setAuthError(msg);
    }
  }, []);

  const retryCloudSync = useCallback(async () => {
    const activeAuthUser = auth.currentUser ?? userRef.current;
    if (!activeAuthUser) {
      await signInGoogle();
      return;
    }
    setFirestoreRestFallback(false);
    await ensureFirestoreNetwork();
    await connectUserCloudSession(activeAuthUser);
  }, [connectUserCloudSession, signInGoogle]);

  const scheduleViewSettingSave = useCallback(
    (settingId: string, kind: ViewSettingKind, settings: unknown) => {
      const currentUser = userRef.current;
      const currentWsId = workspaceIdRef.current;
      if (!currentUser || currentWsId === 'local') return;

      pendingViewSettingKeysRef.current.add(settingId);
      pendingViewSettingPayloadsRef.current.set(settingId, { kind, settings });
      const existingTimer = viewSettingTimersRef.current.get(settingId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        viewSettingTimersRef.current.delete(settingId);
        const payload = pendingViewSettingPayloadsRef.current.get(settingId);
        pendingViewSettingPayloadsRef.current.delete(settingId);
        if (!payload) {
          pendingViewSettingKeysRef.current.delete(settingId);
          return;
        }
        const isKnown = knownViewSettingIdsRef.current.has(settingId);
        try {
          await upsertViewSettingInFirestore(
            currentWsId,
            currentUser.uid,
            settingId,
            payload.kind,
            payload.settings,
            isKnown
          );
          knownViewSettingIdsRef.current.add(settingId);
        } catch {
          // Journalisé par handleFirestoreError
        } finally {
          if (!pendingViewSettingPayloadsRef.current.has(settingId)) {
            pendingViewSettingKeysRef.current.delete(settingId);
          }
        }
      }, 320);

      viewSettingTimersRef.current.set(settingId, timer);
    },
    []
  );

  const updateNavSetting = useCallback(
    (nextMainView: MainViewMode, nextActivePageId?: string | null) => {
      if (embedTarget !== null) return;
      navTouchedByUserRef.current = true;
      const resolvedPageId =
        nextActivePageId !== undefined ? nextActivePageId : activePageIdRef.current;
      const nextNav = sanitizeNavViewSettings({
        mainView: nextMainView,
        activePageId: resolvedPageId,
      });
      viewSettingsRef.current = { ...viewSettingsRef.current, nav: nextNav };
      setViewSettings((prev) => ({ ...prev, nav: nextNav }));
      scheduleViewSettingSave('nav', 'nav', nextNav);
    },
    [embedTarget, scheduleViewSettingSave]
  );

  const setMainView = useCallback(
    (view: MainViewMode) => {
      setMainViewState(view);
      updateNavSetting(view);
    },
    [updateNavSetting]
  );

  const selectPage = useCallback(
    (pageId: string) => {
      setActivePageId(pageId);
      setMainViewState('page');
      updateNavSetting('page', pageId);
    },
    [updateNavSetting]
  );

  const updateDatabaseViewSettings = useCallback(
    (
      pageId: string,
      patch:
        | Partial<DatabaseViewSettings>
        | ((prev: DatabaseViewSettings) => DatabaseViewSettings)
    ) => {
      const prevSlice =
        viewSettingsRef.current.databaseByPageId[pageId] ??
        sanitizeDatabaseViewSettings(undefined);
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizeDatabaseViewSettings(rawNext);
      const nextMap = {
        ...viewSettingsRef.current.databaseByPageId,
        [pageId]: nextSlice,
      };
      viewSettingsRef.current = {
        ...viewSettingsRef.current,
        databaseByPageId: nextMap,
      };
      setViewSettings((prev) => ({
        ...prev,
        databaseByPageId: {
          ...prev.databaseByPageId,
          [pageId]: nextSlice,
        },
      }));
      scheduleViewSettingSave(getDatabaseSettingDocId(pageId), 'database', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const updatePrepareSettings = useCallback(
    (
      patch: Partial<PrepareViewSettings> | ((prev: PrepareViewSettings) => PrepareViewSettings)
    ) => {
      const prevSlice = viewSettingsRef.current.prepare;
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizePrepareViewSettings(rawNext);
      viewSettingsRef.current = { ...viewSettingsRef.current, prepare: nextSlice };
      setViewSettings((prev) => ({ ...prev, prepare: nextSlice }));
      scheduleViewSettingSave('prepare', 'prepare', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const updateTimelineSettings = useCallback(
    (
      patch: Partial<TimelineViewSettings> | ((prev: TimelineViewSettings) => TimelineViewSettings)
    ) => {
      const prevSlice = viewSettingsRef.current.timeline;
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizeTimelineViewSettings(rawNext);
      viewSettingsRef.current = { ...viewSettingsRef.current, timeline: nextSlice };
      setViewSettings((prev) => ({ ...prev, timeline: nextSlice }));
      scheduleViewSettingSave('timeline', 'timeline', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const updateStatsSettings = useCallback(
    (patch: Partial<StatsViewSettings> | ((prev: StatsViewSettings) => StatsViewSettings)) => {
      const prevSlice = viewSettingsRef.current.stats;
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizeStatsViewSettings(rawNext);
      viewSettingsRef.current = { ...viewSettingsRef.current, stats: nextSlice };
      setViewSettings((prev) => ({ ...prev, stats: nextSlice }));
      scheduleViewSettingSave('stats', 'stats', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const updateExploreViewSettings = useCallback(
    (patch: Partial<ExploreViewSettings> | ((prev: ExploreViewSettings) => ExploreViewSettings)) => {
      const prevSlice = viewSettingsRef.current.explore;
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizeExploreViewSettings(rawNext);
      viewSettingsRef.current = { ...viewSettingsRef.current, explore: nextSlice };
      setViewSettings((prev) => ({ ...prev, explore: nextSlice }));
      scheduleViewSettingSave('explore', 'explore', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const updateSearchViewSettings = useCallback(
    (patch: Partial<SearchViewSettings> | ((prev: SearchViewSettings) => SearchViewSettings)) => {
      const prevSlice = viewSettingsRef.current.search;
      const rawNext =
        typeof patch === 'function' ? patch(prevSlice) : { ...prevSlice, ...patch };
      const nextSlice = sanitizeSearchViewSettings(rawNext);
      viewSettingsRef.current = { ...viewSettingsRef.current, search: nextSlice };
      setViewSettings((prev) => ({ ...prev, search: nextSlice }));
      scheduleViewSettingSave('search', 'search', nextSlice);
    },
    [scheduleViewSettingSave]
  );

  const signOutUser = useCallback(async () => {
    for (const timer of saveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    saveTimersRef.current.clear();
    pendingPagePatchesRef.current.clear();
    for (const timer of viewSettingTimersRef.current.values()) {
      clearTimeout(timer);
    }
    viewSettingTimersRef.current.clear();
    pendingViewSettingPayloadsRef.current.clear();
    pendingViewSettingKeysRef.current.clear();
    knownViewSettingIdsRef.current.clear();
    navTouchedByUserRef.current = false;

    setFirestoreRestFallback(false);
    await signOut(auth);
    setHasLocalEdits(false);
    saveStoredLocalDirtyFlag(false);
    setLocalDirtyPages([]);
    setDetailTrail([]);
    setDetailOrigin(null);
    const localSettings = loadStoredViewSettings();
    viewSettingsRef.current = localSettings;
    setViewSettings(localSettings);
    setMainViewState(localSettings.nav.mainView);
    const localThreads = loadLocalExploreThreads();
    setExploreThreads(localThreads);
    setActiveExploreThreadId(
      localSettings.explore.activeThreadId ?? localThreads[0]?.id ?? null
    );
    const stored = loadLocalWorkspaceFromStorage();
    if (stored && hasImproInSnapshot(stored.pages)) {
      setPages(stored.pages);
      setRowsByPage(stored.rowsByPage);
      setActivePageId(
        stored.activePageId ?? localSettings.nav.activePageId ?? stored.pages[0]?.id ?? null
      );
      return;
    }
    try {
      const dataset = await fetchAndBuildImproEcosystem('local', 'local', 0);
      setPages(dataset.pages);
      setRowsByPage(dataset.rowsByPage);
      setActivePageId(dataset.pages[0]?.id ?? null);
    } catch {
      const seed = createSeedWorkspace('local', 'local');
      setPages(seed.pages);
      setRowsByPage(seed.rowsByPage);
      setActivePageId(seed.pages[0]?.id ?? null);
    }
  }, []);

  const openImproDetail = useCallback((pageId: string, rowId: string, focusInput = false) => {
    const focusTick = focusInput ? (focusTickCounterRef.current += 1) : undefined;
    const panelScrollEl = document.querySelector<HTMLElement>('[data-detail-scroll="true"]');
    const currentPanelScrollTop = panelScrollEl?.scrollTop ?? 0;

    setDetailTrail((prev) => {
      if (prev.length === 0) {
        const mainEl = document.querySelector<HTMLElement>('main');
        const originView = mainViewRef.current;
        const originPageId = activePageIdRef.current;
        setDetailOrigin({
          mainView: originView,
          activePageId: originPageId,
          mainScrollTop: mainEl?.scrollTop ?? 0,
          label: getOriginLabel(
            { mainView: originView, activePageId: originPageId },
            pagesRef.current
          ),
        });
      }
      return pushDetailTrailEntry(
        prev,
        {
          pageId,
          rowId,
          ...(focusTick !== undefined ? { focusTick } : {}),
        },
        currentPanelScrollTop
      );
    });
  }, []);

  const returnToDetailOrigin = useCallback(() => {
    const origin = detailOriginRef.current;
    setDetailTrail([]);
    setDetailOrigin(null);
    if (!origin) return;
    if (embedTarget === null) {
      if (origin.mainView === 'page' && origin.activePageId) {
        selectPage(origin.activePageId);
      } else {
        setMainView(origin.mainView);
      }
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const mainEl = document.querySelector<HTMLElement>('main');
        if (mainEl) mainEl.scrollTop = origin.mainScrollTop;
      });
    });
  }, [embedTarget, selectPage, setMainView]);

  const navigateDetailTrailTo = useCallback(
    (index: number) => {
      if (index < 0) {
        returnToDetailOrigin();
        return;
      }
      let restoredTop = 0;
      setDetailTrail((prev) => {
        const res = truncateDetailTrailTo(prev, index);
        restoredTop = res.restoredScrollTop;
        return res.nextTrail;
      });
      window.requestAnimationFrame(() => {
        const panelScrollEl = document.querySelector<HTMLElement>('[data-detail-scroll="true"]');
        if (panelScrollEl) panelScrollEl.scrollTop = restoredTop;
      });
    },
    [returnToDetailOrigin]
  );

  const closeImproDetail = useCallback(() => {
    setDetailTrail([]);
    setDetailOrigin(null);
  }, []);

  const openLiveAnimation = useCallback((seanceId: string) => {
    setLiveSessionId(seanceId);
  }, []);

  const closeLiveAnimation = useCallback(() => {
    setLiveSessionId(null);
  }, []);

  const navigateToTimeline = useCallback(
    (preset?: ImproTimelineFilterPreset) => {
      setTimelinePreset(preset ?? null);
      setMainView('chronology');
    },
    [setMainView]
  );

  const clearTimelinePreset = useCallback(() => {
    setTimelinePreset(null);
  }, []);

  const navigateToPrepare = useCallback(
    (config?: ImproPrepareDraftConfig) => {
      setPrepareDraft((prev) => {
        if (!config) return null;
        if (
          config.addExerciseIds &&
          !config.seanceId &&
          !config.duplicateFromId &&
          !config.groupId
        ) {
          const merged = Array.from(
            new Set([...(prev?.addExerciseIds ?? []), ...config.addExerciseIds])
          );
          return { ...(prev ?? {}), addExerciseIds: merged };
        }
        return config;
      });
      setMainView('prepare');
    },
    [setMainView]
  );

  const clearPrepareDraft = useCallback(() => {
    setPrepareDraft(null);
  }, []);

  const dismissEmbedReadOnlyNotice = useCallback(() => {
    setEmbedReadOnlyNotice(null);
  }, []);

  const blockIfReadOnlyEmbed = useCallback((): boolean => {
    if (!embedSnapshotActiveRef.current) return false;
    setEmbedReadOnlyNotice(
      'Lecture seule (instantané cloud). Connectez-vous avec Google pour modifier et enregistrer.'
    );
    return true;
  }, []);

  const syncExercicesSharedEmbedNow = useCallback(async (): Promise<string | null> => {
    const currentUser = userRef.current;
    const currentWsId = workspaceIdRef.current;
    if (!currentUser || currentWsId === 'local') {
      throw new Error('Connectez-vous au cloud pour synchroniser le lien embed.');
    }
    if (!cloudPagesLoadedRef.current) {
      throw new Error('Chargement de votre espace cloud en cours, réessayez dans un instant.');
    }
    const existingToken = viewSettingsRef.current.databaseByPageId[IMPRO_DB_IDS.exercices]?.embedToken;
    let token = isValidEmbedToken(existingToken) ? existingToken : null;
    if (!token) {
      token = generateEmbedToken();
      updateDatabaseViewSettings(IMPRO_DB_IDS.exercices, { embedToken: token });
    }
    setEmbedSyncing(true);
    try {
      await upsertSharedEmbedInFirestore({
        embedToken: token,
        workspaceId: currentWsId,
        ownerId: currentUser.uid,
        pages: pagesRef.current,
        rowsByPage: rowsRef.current,
        tableOrders: tableColumnOrdersRef.current,
      });
      setEmbedLastSyncedAt(new Date().toISOString());
      return token;
    } finally {
      setEmbedSyncing(false);
    }
  }, [updateDatabaseViewSettings]);

  const ensureExercicesEmbedLink = useCallback(async (): Promise<string | null> => {
    return syncExercicesSharedEmbedNow();
  }, [syncExercicesSharedEmbedNow]);

  // Synchronisation automatique du miroir /sharedEmbeds/{token} quand le compte connecté modifie les données
  useEffect(() => {
    if (
      !user ||
      workspaceId === 'local' ||
      !exercicesEmbedToken ||
      !cloudPagesLoadedRef.current ||
      !exercicesRowsLoadedRef.current
    ) {
      return;
    }
    if (sharedEmbedSyncTimerRef.current) {
      clearTimeout(sharedEmbedSyncTimerRef.current);
    }
    sharedEmbedSyncTimerRef.current = setTimeout(() => {
      sharedEmbedSyncTimerRef.current = null;
      void syncExercicesSharedEmbedNow().catch(() => {
        // Silencieux en arrière-plan ; l'utilisateur peut relancer manuellement
      });
    }, 1200);
    return () => {
      if (sharedEmbedSyncTimerRef.current) {
        clearTimeout(sharedEmbedSyncTimerRef.current);
        sharedEmbedSyncTimerRef.current = null;
      }
    };
  }, [user, workspaceId, exercicesEmbedToken, pages, rowsByPage, tableColumnOrders, syncExercicesSharedEmbedNow]);

  const schedulePageSave = useCallback(
    (pageId: string, patch: Parameters<typeof updatePageContentInFirestore>[2]) => {
      if (blockIfReadOnlyEmbed()) return;
      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
        return;
      }
      setSyncStatus('syncing');
      const prevPatch = pendingPagePatchesRef.current.get(pageId) ?? {};
      pendingPagePatchesRef.current.set(pageId, { ...prevPatch, ...patch });
      const existingTimer = saveTimersRef.current.get(pageId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(async () => {
        saveTimersRef.current.delete(pageId);
        const mergedPatch = pendingPagePatchesRef.current.get(pageId);
        pendingPagePatchesRef.current.delete(pageId);
        if (!mergedPatch) return;
        try {
          await updatePageContentInFirestore(workspaceId, pageId, mergedPatch);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      }, 280);
      saveTimersRef.current.set(pageId, timer);
    },
    [user, workspaceId]
  );

  const queueRowsBatchSave = useCallback(
    (rowsToSave: DatabaseRow[]) => {
      if (blockIfReadOnlyEmbed()) return;
      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
        return;
      }
      setSyncStatus('syncing');
      for (const r of rowsToSave) {
        pendingRowBatchRef.current.set(`${r.pageId}::${r.id}`, r);
      }
      if (rowBatchTimerRef.current) clearTimeout(rowBatchTimerRef.current);
      rowBatchTimerRef.current = setTimeout(async () => {
        const batchList = Array.from(pendingRowBatchRef.current.values());
        pendingRowBatchRef.current.clear();
        rowBatchTimerRef.current = null;
        if (batchList.length === 0) return;
        try {
          await batchUpsertRowsInFirestore(batchList);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      }, 350);
    },
    [user, workspaceId]
  );

  const applyMirrorPatchesToRowsMap = (
    prev: Record<string, DatabaseRow[]>,
    patches: DatabaseRow[]
  ): Record<string, DatabaseRow[]> => {
    if (patches.length === 0) return prev;
    const next = { ...prev };
    const byPage = new Map<string, Map<string, DatabaseRow>>();
    for (const p of patches) {
      const m = byPage.get(p.pageId) ?? new Map<string, DatabaseRow>();
      m.set(p.id, p);
      byPage.set(p.pageId, m);
    }
    for (const [pid, patchMap] of byPage.entries()) {
      next[pid] = (next[pid] ?? []).map((r) => patchMap.get(r.id) ?? r);
    }
    return next;
  };

  const createPage = useCallback(
    async (type: PageType, parentId: string | null = null): Promise<string> => {
      const ownerId = user?.uid ?? 'local';
      const id = generateId('page');
      const order = pagesRef.current.length;
      const defaultColumns: DatabaseColumn[] = [
        { id: 'col_titre', name: 'Nom', type: 'text' },
        { id: 'col_statut', name: 'Statut', type: 'select', options: ['À faire', 'En cours', 'Terminé'] },
        { id: 'col_date', name: 'Date', type: 'date' },
        { id: 'col_ok', name: 'Fait', type: 'checkbox' },
      ];
      const newPage: WorkspacePage = {
        id,
        workspaceId,
        ownerId,
        parentId,
        title: type === 'database' ? 'Nouvelle base' : 'Sans titre',
        icon: type === 'database' ? '🗂️' : '📄',
        type,
        isFavorite: false,
        isTrashed: false,
        order,
        source: 'native',
        blocks: type === 'document' ? [{ id: generateId('blk'), type: 'paragraph', content: '' }] : [],
        ...(type === 'database' ? { columns: defaultColumns, activeView: 'table' as const } : {}),
      };
      const initialRows: DatabaseRow[] =
        type === 'database'
          ? [
              {
                id: generateId('row'),
                pageId: id,
                workspaceId,
                ownerId,
                order: 0,
                cells: {
                  col_titre: 'Premier élément',
                  col_statut: 'À faire',
                  col_date: '',
                  col_ok: false,
                },
              },
            ]
          : [];

      setPages((prev) => [...prev, newPage]);
      if (type === 'database') {
        setRowsByPage((prev) => ({ ...prev, [id]: initialRows }));
      }
      selectPage(id);

      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
      } else {
        setSyncStatus('syncing');
        await createPageInFirestore(newPage, initialRows);
        setSyncStatus('synced');
      }
      return id;
    },
    [user, workspaceId, selectPage]
  );

  const updatePageTitle = useCallback(
    (pageId: string, title: string) => {
      const clamped = title.slice(0, 200);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, title: clamped } : p)));
      schedulePageSave(pageId, { title: clamped });

      for (const [dbId, rows] of Object.entries(rowsRef.current)) {
        const linkedRow = rows.find((r) => r.linkedPageId === pageId);
        if (!linkedRow) continue;
        const dbPage = pagesRef.current.find((p) => p.id === dbId);
        const primaryColId = getPrimaryColumn(dbPage?.columns ?? [])?.id;
        if (!primaryColId) continue;
        if (String(linkedRow.cells[primaryColId] ?? '') === clamped) break;
        const updatedRow: DatabaseRow = {
          ...linkedRow,
          cells: { ...linkedRow.cells, [primaryColId]: clamped },
        };
        setRowsByPage((prev) => ({
          ...prev,
          [dbId]: (prev[dbId] ?? []).map((r) => (r.id === linkedRow.id ? updatedRow : r)),
        }));
        queueRowsBatchSave([updatedRow]);
        break;
      }
    },
    [queueRowsBatchSave, schedulePageSave]
  );

  const updatePageIcon = useCallback(
    (pageId: string, icon: string) => {
      const clamped = icon.slice(0, 32);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, icon: clamped } : p)));
      schedulePageSave(pageId, { icon: clamped });
    },
    [schedulePageSave]
  );

  const updatePageBlocks = useCallback(
    (pageId: string, blocks: BlockItem[]) => {
      const clamped = blocks.slice(0, 400);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, blocks: clamped } : p)));
      schedulePageSave(pageId, { blocks: clamped });
    },
    [schedulePageSave]
  );

  const updateDatabaseColumns = useCallback(
    (pageId: string, columns: DatabaseColumn[]) => {
      const clamped = columns.slice(0, 100);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, columns: clamped } : p)));
      schedulePageSave(pageId, { columns: clamped });
    },
    [schedulePageSave]
  );

  const updateDatabaseView = useCallback(
    (pageId: string, activeView: DatabaseViewType) => {
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, activeView } : p)));
      schedulePageSave(pageId, { activeView });
    },
    [schedulePageSave]
  );

  const setDatabaseSorts = useCallback(
    (pageId: string, rules: DatabaseSortRule[]) => {
      if (blockIfReadOnlyEmbed()) return;
      const clamped = rules.slice(0, 30);
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, sortRules: clamped } : p)));
      schedulePageSave(pageId, { sortRules: clamped });
    },
    [blockIfReadOnlyEmbed, schedulePageSave]
  );

  const setColumnWidth = useCallback(
    (pageId: string, colId: string, width: number) => {
      if (blockIfReadOnlyEmbed()) return;
      const clamped = Math.max(46, Math.min(640, Math.round(width)));
      const target = pagesRef.current.find((p) => p.id === pageId);
      const nextWidths = {
        ...(target?.columnWidths ?? {}),
        [colId]: clamped,
      };
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? {
                ...p,
                columnWidths: {
                  ...(p.columnWidths ?? {}),
                  [colId]: clamped,
                },
              }
            : p
        )
      );
      schedulePageSave(pageId, { columnWidths: nextWidths });
    },
    [blockIfReadOnlyEmbed, schedulePageSave]
  );

  const resetColumnWidth = useCallback(
    (pageId: string, colId?: string) => {
      if (blockIfReadOnlyEmbed()) return;
      const target = pagesRef.current.find((p) => p.id === pageId);
      const current = target?.columnWidths;
      if (!current) return;
      const nextWidths: Record<string, number> = colId ? { ...current } : {};
      if (colId) delete nextWidths[colId];
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, columnWidths: nextWidths } : p))
      );
      schedulePageSave(pageId, { columnWidths: nextWidths });
    },
    [blockIfReadOnlyEmbed, schedulePageSave]
  );

  const setTableColumnOrder = useCallback(
    (tableKey: string, order: string[]) => {
      if (blockIfReadOnlyEmbed()) return;
      const next = { ...tableColumnOrdersRef.current, [tableKey]: order };
      tableColumnOrdersRef.current = next;
      setTableColumnOrders(next);
      scheduleViewSettingSave('table_orders', 'table_orders', { orders: next });
    },
    [blockIfReadOnlyEmbed, scheduleViewSettingSave]
  );

  const toggleFavorite = useCallback(
    async (pageId: string) => {
      const target = pagesRef.current.find((p) => p.id === pageId);
      if (!target) return;
      const nextFav = !target.isFavorite;
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, isFavorite: nextFav } : p)));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await updatePageFlagsInFirestore(workspaceId, pageId, { isFavorite: nextFav });
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const moveToTrash = useCallback(
    async (pageId: string) => {
      const ids = getDescendantIds(pagesRef.current, pageId);
      const idSet = new Set(ids);
      setPages((prev) =>
        prev.map((p) => (idSet.has(p.id) ? { ...p, isTrashed: true, isFavorite: false } : p))
      );
      setActivePageId((prevActive) => {
        if (!prevActive || idSet.has(prevActive)) {
          const remaining = pagesRef.current.find((p) => !idSet.has(p.id) && !p.isTrashed);
          return remaining?.id ?? null;
        }
        return prevActive;
      });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        for (const id of ids) {
          await updatePageFlagsInFirestore(workspaceId, id, { isTrashed: true, isFavorite: false });
        }
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const restoreFromTrash = useCallback(
    async (pageId: string) => {
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, isTrashed: false } : p)));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await updatePageFlagsInFirestore(workspaceId, pageId, { isTrashed: false });
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const deletePermanently = useCallback(
    async (pageId: string) => {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      setRowsByPage((prev) => {
        const next = { ...prev };
        delete next[pageId];
        return next;
      });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await deletePagePermanentlyInFirestore(workspaceId, pageId, user.uid);
        setSyncStatus('synced');
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const addDatabaseRow = useCallback(
    async (
      pageId: string,
      initialCells: Record<string, CellValue> = {},
      options: { insertAt?: 'top' | 'bottom' } = {}
    ): Promise<string | undefined> => {
      if (blockIfReadOnlyEmbed()) return undefined;
      const page = pagesRef.current.find((p) => p.id === pageId);
      if (!page) return undefined;
      const currentRows = rowsRef.current[pageId] ?? [];
      const rowId = generateId('row');
      const ownerId = user?.uid ?? 'local';
      const insertAt = options.insertAt ?? 'top';
      const cells = buildInitialRowCells(page.columns ?? [], initialCells);
      if (pageId === IMPRO_DB_IDS.seances) {
        const groupeIds = asIdList(cells[IMPRO_COL_IDS.seances.groupe]);
        const participantIds = asIdList(cells[IMPRO_COL_IDS.seances.participants]);
        if (groupeIds.length > 0 && participantIds.length === 0) {
          cells[IMPRO_COL_IDS.seances.participants] = getGroupMemberIds(groupeIds, rowsRef.current);
        }
      }
      if (pageId === IMPRO_DB_IDS.exercices) {
        const provisionalRow: DatabaseRow = {
          id: rowId,
          pageId,
          workspaceId,
          ownerId,
          order: 0,
          cells,
          linkedPageId: null,
        };
        const rankRes = insertExerciseWithRank(currentRows, provisionalRow, insertAt);
        const insertedRow = rankRes.nextRows.find((r) => r.id === rowId) ?? provisionalRow;
        const mirrorPatches = computeBidirectionalRowPatches(
          pageId,
          rowId,
          {},
          insertedRow.cells,
          rowsRef.current
        );
        const nextMap = applyMirrorPatchesToRowsMap(
          {
            ...rowsRef.current,
            [pageId]: rankRes.nextRows,
          },
          mirrorPatches
        );
        rowsRef.current = nextMap;
        setRowsByPage((prev) => {
          const updated = {
            ...prev,
            [pageId]: rankRes.nextRows,
          };
          return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
        });
        if (user && workspaceId !== 'local') {
          setSyncStatus('syncing');
          const newKeys = new Set([`${pageId}::${rowId}`]);
          try {
            const changedToPersist = rankRes.changedRows.some((r) => r.id === rowId)
              ? rankRes.changedRows
              : [insertedRow, ...rankRes.changedRows];
            await batchUpsertRowsInFirestore([...changedToPersist, ...mirrorPatches], newKeys);
            setSyncStatus('synced');
          } catch {
            setSyncStatus('error');
          }
        } else {
          setHasLocalEdits(true);
        }
        return rowId;
      }

      const order =
        insertAt === 'bottom'
          ? computeBottomRowOrder(currentRows)
          : computeTopRowOrder(currentRows);
      const newRow: DatabaseRow = {
        id: rowId,
        pageId,
        workspaceId,
        ownerId,
        order,
        cells,
        linkedPageId: null,
      };
      const mirrorPatches = computeBidirectionalRowPatches(pageId, rowId, {}, cells, rowsRef.current);
      setRowsByPage((prev) => {
        const existing = prev[pageId] ?? [];
        const updated = {
          ...prev,
          [pageId]: insertAt === 'bottom' ? [...existing, newRow] : [newRow, ...existing],
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
      });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        const newKeys = new Set([`${pageId}::${rowId}`]);
        try {
          await batchUpsertRowsInFirestore([newRow, ...mirrorPatches], newKeys);
          setSyncStatus('synced');
        } catch {
          setSyncStatus('error');
        }
      } else {
        setHasLocalEdits(true);
      }
      return rowId;
    },
    [user, workspaceId]
  );

  const applyExerciseRankResult = useCallback(
    (result: ExerciseRankMutationResult) => {
      if (result.changedRows.length === 0) return;
      rowsRef.current = {
        ...rowsRef.current,
        [IMPRO_DB_IDS.exercices]: result.nextRows,
      };
      setRowsByPage((prev) => ({
        ...prev,
        [IMPRO_DB_IDS.exercices]: result.nextRows,
      }));
      queueRowsBatchSave(result.changedRows);
    },
    [queueRowsBatchSave]
  );

  const moveExerciseRank = useCallback(
    (
      sourceId: string,
      targetId: string,
      position: 'before' | 'after',
      options?: { scoreSortDir?: ScoreSortDirection }
    ) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentExRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
      const res = moveExerciseRelativeToTarget(currentExRows, sourceId, targetId, position, options);
      applyExerciseRankResult(res);
    },
    [applyExerciseRankResult, blockIfReadOnlyEmbed]
  );

  const stepExerciseRank = useCallback(
    (
      visibleRowIds: string[],
      sourceId: string,
      delta: -1 | 1,
      options?: { scoreSortDir?: ScoreSortDirection }
    ) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentExRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
      const res = stepExerciseInVisibleList(currentExRows, visibleRowIds, sourceId, delta, options);
      applyExerciseRankResult(res);
    },
    [applyExerciseRankResult, blockIfReadOnlyEmbed]
  );

  const setExerciseScore = useCallback(
    (rowId: string, desiredScore: CellValue | undefined) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentExRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
      const res = setExerciseScoreDirect(currentExRows, rowId, desiredScore);
      applyExerciseRankResult(res);
    },
    [applyExerciseRankResult, blockIfReadOnlyEmbed]
  );

  const updateDatabaseRow = useCallback(
    (
      pageId: string,
      rowId: string,
      cells: Record<string, CellValue>,
      linkedPageId?: string | null
    ) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentRows = rowsRef.current[pageId] ?? [];
      const existing = currentRows.find((r) => r.id === rowId);
      if (!existing) return;

      let nextCells = { ...cells };
      if (pageId === IMPRO_DB_IDS.seances) {
        const prevGrps = asIdList(existing.cells[IMPRO_COL_IDS.seances.groupe]);
        const nextGrps = asIdList(nextCells[IMPRO_COL_IDS.seances.groupe]);
        const prevPars = asIdList(existing.cells[IMPRO_COL_IDS.seances.participants]);
        const nextPars = asIdList(nextCells[IMPRO_COL_IDS.seances.participants]);
        if (
          !sameStringArray(prevGrps, nextGrps) &&
          nextGrps.length > 0 &&
          prevPars.length === 0 &&
          nextPars.length === 0
        ) {
          nextCells = {
            ...nextCells,
            [IMPRO_COL_IDS.seances.participants]: getGroupMemberIds(nextGrps, rowsRef.current),
          };
        }
      }

      const scoreColId = IMPRO_COL_IDS.exercices.score;
      const isExerciseScoreEdit =
        pageId === IMPRO_DB_IDS.exercices &&
        nextCells[scoreColId] !== existing.cells[scoreColId];
      const desiredScoreValue = nextCells[scoreColId];
      if (isExerciseScoreEdit) {
        // Garde l'ancien score avant réindexation pour garantir une permutation propre
        nextCells[scoreColId] = existing.cells[scoreColId];
      }

      const updatedRow: DatabaseRow = {
        ...existing,
        cells: nextCells,
        ...(linkedPageId !== undefined ? { linkedPageId } : {}),
      };

      const mirrorPatches = computeBidirectionalRowPatches(
        pageId,
        rowId,
        existing.cells,
        nextCells,
        rowsRef.current
      );

      if (isExerciseScoreEdit) {
        const baseRows = currentRows.map((r) => (r.id === rowId ? updatedRow : r));
        const rankRes = setExerciseScoreDirect(baseRows, rowId, desiredScoreValue);
        const rowsToSave = Array.from(
          new Map<string, DatabaseRow>(
            [updatedRow, ...rankRes.changedRows, ...mirrorPatches].map((r) => [
              `${r.pageId}::${r.id}`,
              r,
            ])
          ).values()
        );
        rowsRef.current = applyMirrorPatchesToRowsMap(
          {
            ...rowsRef.current,
            [pageId]: rankRes.nextRows,
          },
          mirrorPatches
        );
        setRowsByPage((prev) => {
          const updated = {
            ...prev,
            [pageId]: rankRes.nextRows,
          };
          return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
        });
        queueRowsBatchSave(rowsToSave);
      } else {
        setRowsByPage((prev) => {
          const updated = {
            ...prev,
            [pageId]: (prev[pageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
          };
          return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
        });
        queueRowsBatchSave([updatedRow, ...mirrorPatches]);
      }

      const resolvedLinkedPageId =
        linkedPageId !== undefined ? linkedPageId : existing.linkedPageId;
      if (resolvedLinkedPageId) {
        const dbPage = pagesRef.current.find((p) => p.id === pageId);
        const primaryColId = getPrimaryColumn(dbPage?.columns ?? [])?.id;
        if (primaryColId) {
          const nextTitle = String(nextCells[primaryColId] ?? '').trim().slice(0, 200);
          const linkedPage = pagesRef.current.find((p) => p.id === resolvedLinkedPageId);
          if (linkedPage && nextTitle && linkedPage.title !== nextTitle) {
            setPages((prev) =>
              prev.map((p) => (p.id === resolvedLinkedPageId ? { ...p, title: nextTitle } : p))
            );
            schedulePageSave(resolvedLinkedPageId, { title: nextTitle });
          }
        }
      }
    },
    [queueRowsBatchSave, schedulePageSave]
  );

  const updateRowBlocks = useCallback(
    (pageId: string, rowId: string, blocks: BlockItem[]) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentRows = rowsRef.current[pageId] ?? [];
      const existing = currentRows.find((r) => r.id === rowId);
      if (!existing) return;
      const clamped = blocks.slice(0, 400);
      const updatedRow: DatabaseRow = {
        ...existing,
        blocks: clamped,
      };
      setRowsByPage((prev) => ({
        ...prev,
        [pageId]: (prev[pageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
      }));
      queueRowsBatchSave([updatedRow]);
    },
    [blockIfReadOnlyEmbed, queueRowsBatchSave]
  );

  const updateRowComments = useCallback(
    (pageId: string, rowId: string, comments: RowComment[]) => {
      if (blockIfReadOnlyEmbed()) return;
      const currentRows = rowsRef.current[pageId] ?? [];
      const existing = currentRows.find((r) => r.id === rowId);
      if (!existing) return;
      const clamped = comments.slice(0, 100);
      const updatedRow: DatabaseRow = {
        ...existing,
        comments: clamped,
      };
      setRowsByPage((prev) => ({
        ...prev,
        [pageId]: (prev[pageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
      }));
      queueRowsBatchSave([updatedRow]);
    },
    [blockIfReadOnlyEmbed, queueRowsBatchSave]
  );

  const prefillSeanceFromGroup = useCallback(
    (seanceRowId: string, mode: 'merge' | 'replace' = 'merge') => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const groupeIds = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.groupe]);
      if (groupeIds.length === 0) return;
      const memberIds = getGroupMemberIds(groupeIds, rowsRef.current);
      const currentPars = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.participants]);
      const nextPars =
        mode === 'replace' ? memberIds : Array.from(new Set([...currentPars, ...memberIds]));
      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.participants]: nextPars,
      });
    },
    [updateDatabaseRow]
  );

  const toggleSeanceStatus = useCallback(
    (seanceRowId: string) => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const currentStatus = normalizeSessionStatus(seanceRow.cells[IMPRO_COL_IDS.seances.statut]);
      const nextStatus = currentStatus === 'Préparée' ? 'Réalisée' : 'Préparée';
      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.statut]: nextStatus,
      });
    },
    [updateDatabaseRow]
  );

  const toggleSeanceParticipant = useCallback(
    (seanceRowId: string, participantId: string) => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceRowId
      );
      if (!seanceRow) return;
      const currentPars = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.participants]);
      const nextPars = currentPars.includes(participantId)
        ? currentPars.filter((id) => id !== participantId)
        : [...currentPars, participantId];
      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceRowId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.participants]: nextPars,
      });
    },
    [updateDatabaseRow]
  );

  const deleteDatabaseRows = useCallback(
    async (pageId: string, rowIds: string[]) => {
      if (blockIfReadOnlyEmbed()) return;
      const uniqueIds = Array.from(new Set(rowIds.filter(Boolean)));
      if (uniqueIds.length === 0) return;
      const idSet = new Set(uniqueIds);
      const currentPageRows = rowsRef.current[pageId] ?? [];
      const deletedRows = currentPageRows.filter((r) => idSet.has(r.id));
      const mirrorCleanup =
        deletedRows.length > 0
          ? computeDeleteRowsMirrorCleanup(pageId, deletedRows, rowsRef.current)
          : [];

      const filteredForPage = currentPageRows.filter((r) => !idSet.has(r.id));
      let nextRowsForPage = filteredForPage;
      let rankChangedRows: DatabaseRow[] = [];
      if (pageId === IMPRO_DB_IDS.exercices) {
        const norm = normalizeExerciseScores(filteredForPage);
        nextRowsForPage = norm.nextRows;
        rankChangedRows = norm.changedRows;
      }

      rowsRef.current = applyMirrorPatchesToRowsMap(
        {
          ...rowsRef.current,
          [pageId]: nextRowsForPage,
        },
        mirrorCleanup
      );

      setRowsByPage((prev) => {
        const remaining = (prev[pageId] ?? []).filter((r) => !idSet.has(r.id));
        const normalized =
          pageId === IMPRO_DB_IDS.exercices ? normalizeExerciseScores(remaining).nextRows : remaining;
        const updated = {
          ...prev,
          [pageId]: normalized,
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorCleanup);
      });

      setDetailTrail((prev) => {
        const filtered = prev.filter((item) => !(item.pageId === pageId && idSet.has(item.rowId)));
        if (filtered.length === 0) setDetailOrigin(null);
        return filtered;
      });

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        try {
          await deleteRowsInFirestore(workspaceId, pageId, uniqueIds);
          const extraUpserts = [...rankChangedRows, ...mirrorCleanup];
          if (extraUpserts.length > 0) {
            await batchUpsertRowsInFirestore(extraUpserts);
          }
          setSyncStatus('synced');
        } catch (err) {
          setSyncStatus('error');
          throw err;
        }
      } else {
        setHasLocalEdits(true);
      }
    },
    [user, workspaceId]
  );

  const deleteDatabaseRow = useCallback(
    async (pageId: string, rowId: string) => {
      await deleteDatabaseRows(pageId, [rowId]);
    },
    [deleteDatabaseRows]
  );

  const loadImproDatabases = useCallback(async () => {
    const ownerId = user?.uid ?? 'local';
    setImproLoading(true);
    setImproError(null);
    try {
      const dataset = await fetchAndBuildImproEcosystem(
        workspaceId,
        ownerId,
        pagesRef.current.length
      );
      const improIdSet = new Set<string>(Object.values(IMPRO_DB_IDS));
      setPages((prev) => [...prev.filter((p) => !improIdSet.has(p.id)), ...dataset.pages]);
      setRowsByPage((prev) => ({ ...prev, ...dataset.rowsByPage }));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await seedImproDatabasesToFirestore(workspaceId, user.uid, dataset);
        setSyncStatus('synced');
      }
      setMainView('chronology');
    } catch (err) {
      setImproError(err instanceof Error ? err.message : 'Erreur de chargement');
      if (user && workspaceId !== 'local') setSyncStatus('error');
    } finally {
      setImproLoading(false);
    }
  }, [user, workspaceId, setMainView]);

  const resetToDemoWorkspace = useCallback(async () => {
    clearLocalWorkspaceStorage();
    clearStoredViewSettings();
    const defaultSettings = createDefaultWorkspaceViewSettings();
    viewSettingsRef.current = defaultSettings;
    setViewSettings(defaultSettings);
    setHasLocalEdits(false);
    saveStoredLocalDirtyFlag(false);
    setDetailTrail([]);
    setDetailOrigin(null);
    setLiveSessionId(null);
    setImproLoading(true);
    setImproError(null);
    try {
      const dataset = await fetchAndBuildImproEcosystem('local', user?.uid ?? 'local', 0);
      improCsvCacheRef.current = dataset;
      setPages(dataset.pages);
      setRowsByPage(dataset.rowsByPage);
      const firstId = dataset.pages[0]?.id ?? null;
      setActivePageId(firstId);
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await seedImproDatabasesToFirestore(workspaceId, user.uid, dataset);
        setSyncStatus('synced');
      }
      setMainViewState('chronology');
      updateNavSetting('chronology', firstId);
    } catch (err) {
      setImproError(err instanceof Error ? err.message : 'Erreur réinitialisation');
    } finally {
      setImproLoading(false);
    }
  }, [user, workspaceId, updateNavSetting]);

  const exportWorkspaceJson = useCallback((): string => {
    return serializeWorkspaceSnapshot(pagesRef.current, rowsRef.current, activePageId);
  }, [activePageId]);

  const importWorkspaceJson = useCallback((jsonText: string): boolean => {
    const snapshot = parseWorkspaceSnapshot(jsonText);
    if (!snapshot) return false;
    setPages(snapshot.pages);
    setRowsByPage(snapshot.rowsByPage);
    setActivePageId(snapshot.activePageId ?? snapshot.pages[0]?.id ?? null);
    setHasLocalEdits(true);
    saveLocalWorkspaceToStorage(snapshot.pages, snapshot.rowsByPage, snapshot.activePageId);
    return true;
  }, []);

  const openOrCreateRowPage = useCallback(
    async (
      dbPageId: string,
      rowId: string,
      options: { navigate?: boolean; template?: ExercisePageTemplateMode } = {}
    ): Promise<string | null> => {
      const navigate = options.navigate ?? true;
      const dbPage = pagesRef.current.find((p) => p.id === dbPageId && !p.isTrashed);
      const row = (rowsRef.current[dbPageId] ?? []).find((r) => r.id === rowId);
      if (!dbPage || !row) return null;

      if (row.linkedPageId) {
        const existingLinked = pagesRef.current.find(
          (p) => p.id === row.linkedPageId && !p.isTrashed
        );
        if (existingLinked) {
          if (navigate) {
            selectPage(existingLinked.id);
          }
          return existingLinked.id;
        }
      }

      const ownerId = user?.uid ?? 'local';
      const primaryColId = getPrimaryColumn(dbPage.columns ?? [])?.id;
      const rowTitle = primaryColId ? String(row.cells[primaryColId] ?? '').trim() : '';
      const isExercise = dbPageId === IMPRO_DB_IDS.exercices;
      const templateMode: ExercisePageTemplateMode =
        options.template ?? (isExercise ? 'template' : 'blank');
      const newPageId = generateId('page');
      const newPage: WorkspacePage = {
        id: newPageId,
        workspaceId,
        ownerId,
        parentId: dbPageId,
        title: (rowTitle || 'Fiche sans titre').slice(0, 200),
        icon: isExercise ? '🎭' : '📄',
        type: 'document',
        isFavorite: false,
        isTrashed: false,
        order: pagesRef.current.length,
        source: 'native',
        blocks: isExercise
          ? createExerciseContentBlocks(templateMode)
          : [{ id: generateId('blk'), type: 'paragraph', content: '' }],
      };
      const updatedRow: DatabaseRow = { ...row, linkedPageId: newPageId };

      setPages((prev) => [...prev, newPage]);
      setRowsByPage((prev) => ({
        ...prev,
        [dbPageId]: (prev[dbPageId] ?? []).map((r) => (r.id === rowId ? updatedRow : r)),
      }));
      if (navigate) {
        selectPage(newPageId);
      }

      if (!user || workspaceId === 'local') {
        setHasLocalEdits(true);
      } else {
        setSyncStatus('syncing');
        await createPageInFirestore(newPage);
        await upsertRowInFirestore(updatedRow, false);
        setSyncStatus('synced');
      }
      return newPageId;
    },
    [user, workspaceId, selectPage]
  );

  const importNotionDrafts = useCallback(
    async (
      drafts: ImportedPageDraft[],
      targetParentId: string | null = null
    ): Promise<string[]> => {
      if (drafts.length === 0) return [];
      const ownerId = user?.uid ?? 'local';
      const startOrder = pagesRef.current.length;

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        const createdIds = await importNotionPagesToFirestore(
          workspaceId,
          user.uid,
          drafts,
          startOrder,
          targetParentId
        );
        setSyncStatus('synced');
        if (createdIds[0]) {
          selectPage(createdIds[0]);
        }
        return createdIds;
      }

      const { pages: newPages, rowsByPage: newRows } = materializeImportedDrafts(
        drafts,
        workspaceId,
        ownerId,
        startOrder,
        targetParentId
      );
      setPages((prev) => [...prev, ...newPages]);
      setRowsByPage((prev) => ({ ...prev, ...newRows }));
      setHasLocalEdits(true);
      if (newPages[0]) {
        selectPage(newPages[0].id);
      }
      return newPages.map((p) => p.id);
    },
    [user, workspaceId, selectPage]
  );

  const migrateLocalPagesToCloud = useCallback(async () => {
    if (!user || workspaceId === 'local' || localDirtyPages.length === 0) return;
    const drafts: ImportedPageDraft[] = localDirtyPages.map((p) => {
      const pageRows = rowsRef.current[p.id] ?? [];
      return {
        tempId: p.id,
        parentTempId: p.parentId,
        title: p.title,
        icon: p.icon,
        type: p.type,
        blocks: p.blocks,
        columns: p.columns,
        rows: pageRows.map((r) => r.cells),
        rowMeta: pageRows.map((r) => ({
          tempId: r.id,
          linkedPageTempId: r.linkedPageId ?? null,
        })),
      };
    });
    await importNotionPagesToFirestore(workspaceId, user.uid, drafts, pagesRef.current.length);
    setLocalDirtyPages([]);
    setHasLocalEdits(false);
    saveStoredLocalDirtyFlag(false);
  }, [user, workspaceId, localDirtyPages]);

  const dismissLocalMigration = useCallback(() => {
    setLocalDirtyPages([]);
    setHasLocalEdits(false);
    saveStoredLocalDirtyFlag(false);
  }, []);

  const databaseSorts = useMemo(() => {
    const out: Record<string, DatabaseSortRule[]> = {};
    for (const p of pages) {
      if (p.sortRules && p.sortRules.length > 0) {
        out[p.id] = p.sortRules;
      }
    }
    return out;
  }, [pages]);

  const columnWidths = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const p of pages) {
      if (p.columnWidths && Object.keys(p.columnWidths).length > 0) {
        out[p.id] = p.columnWidths;
      }
    }
    return out;
  }, [pages]);

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId && !p.isTrashed) ?? null,
    [pages, activePageId]
  );

  const improModel = useMemo(
    () => computeImproEcosystem(pages, rowsByPage),
    [pages, rowsByPage]
  );

  const createExploreThread = useCallback(
    async (initial?: {
      title?: string;
      groupId?: string;
      thematique?: string;
      modelId?: ExploreModelId;
      tier?: ExploreTier;
      useWebSearch?: boolean;
    }): Promise<ExploreThread> => {
      const ownerId = user?.uid ?? 'local';
      const newThread: ExploreThread = {
        id: generateId('exp'),
        workspaceId,
        ownerId,
        title: (initial?.title ?? 'Nouvelle exploration').trim().slice(0, 160) || 'Nouvelle exploration',
        groupId: initial?.groupId ?? '',
        thematique: (initial?.thematique ?? '').slice(0, 300),
        modelId: initial?.modelId ?? 'gemini-4-hydrogen',
        tier: initial?.tier ?? 'plan',
        useWebSearch: initial?.useWebSearch ?? false,
        messages: [],
      };
      setExploreThreads((prev) => [newThread, ...prev]);
      setActiveExploreThreadId(newThread.id);
      updateExploreViewSettings({ activeThreadId: newThread.id });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await upsertExploreThreadInFirestore(newThread, true);
        setSyncStatus('synced');
      }
      return newThread;
    },
    [user, workspaceId, updateExploreViewSettings]
  );

  const selectExploreThread = useCallback(
    (threadId: string) => {
      setActiveExploreThreadId(threadId);
      updateExploreViewSettings({ activeThreadId: threadId || null });
    },
    [updateExploreViewSettings]
  );

  const updateExploreThread = useCallback(
    async (
      threadId: string,
      patch: Partial<
        Pick<
          ExploreThread,
          'title' | 'groupId' | 'thematique' | 'modelId' | 'tier' | 'useWebSearch' | 'messages'
        >
      >
    ) => {
      const existing = exploreThreadsRef.current.find((t) => t.id === threadId);
      if (!existing) return;
      const updated: ExploreThread = {
        ...existing,
        ...patch,
      };
      setExploreThreads((prev) => prev.map((t) => (t.id === threadId ? updated : t)));
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await upsertExploreThreadInFirestore(updated, false);
        setSyncStatus('synced');
      }
    },
    [user, workspaceId]
  );

  const deleteExploreThread = useCallback(
    async (threadId: string) => {
      const remaining = exploreThreadsRef.current.filter((t) => t.id !== threadId);
      const nextSelected =
        activeExploreThreadIdRef.current === threadId
          ? remaining[0]?.id ?? null
          : activeExploreThreadIdRef.current;
      setExploreThreads(remaining);
      setActiveExploreThreadId(nextSelected);
      updateExploreViewSettings({ activeThreadId: nextSelected });
      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        await deleteExploreThreadInFirestore(workspaceId, threadId);
        setSyncStatus('synced');
      }
    },
    [user, workspaceId, updateExploreViewSettings]
  );

  const addSuggestedExerciseToBiblimpro = useCallback(
    async (
      suggestion: ExploreSuggestedExercise,
      contextMeta?: { threadId?: string; messageId?: string }
    ): Promise<string | undefined> => {
      if (suggestion.addedToBiblimproId) return suggestion.addedToBiblimproId;
      if (suggestion.existingExerciceId) return suggestion.existingExerciceId;

      const existingRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
      const normalizedNom = suggestion.nom.trim().toLowerCase();
      const duplicate = existingRows.find(
        (r) => String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase() === normalizedNom
      );
      const targetId =
        duplicate?.id ??
        (await addDatabaseRow(IMPRO_DB_IDS.exercices, {
          [IMPRO_COL_IDS.exercices.nom]: suggestion.nom.trim().slice(0, 140),
          [IMPRO_COL_IDS.exercices.etape]: suggestion.etape ? [suggestion.etape] : [],
          [IMPRO_COL_IDS.exercices.tags]: suggestion.tags ?? [],
          [IMPRO_COL_IDS.exercices.description]: suggestion.description ?? '',
        }));

      if (targetId && contextMeta?.threadId && contextMeta?.messageId) {
        const thread = exploreThreadsRef.current.find((t) => t.id === contextMeta.threadId);
        if (thread) {
          const nextMessages = thread.messages.map((m) =>
            m.id === contextMeta.messageId
              ? {
                  ...m,
                  suggestedExercises: m.suggestedExercises?.map((ex) =>
                    ex.id === suggestion.id ? { ...ex, addedToBiblimproId: targetId } : ex
                  ),
                }
              : m
          );
          await updateExploreThread(thread.id, { messages: nextMessages });
        }
      }
      return targetId;
    },
    [addDatabaseRow, updateExploreThread]
  );

  const addExerciseToPlannedSeance = useCallback(
    (
      exerciceId: string,
      seanceId: string,
      options?: { durationMin?: number; note?: string }
    ) => {
      const seanceRow = (rowsRef.current[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === seanceId
      );
      if (!seanceRow) return;
      const currentExIds = asIdList(seanceRow.cells[IMPRO_COL_IDS.seances.exercices]);
      const currentSteps = parseSessionPlan(
        seanceRow.cells[IMPRO_COL_IDS.seances.deroule],
        currentExIds
      );
      const alreadyPresent = currentSteps.some(
        (st) => st.kind === 'exercise' && st.exerciceId === exerciceId
      );
      const nextSteps: ImproPlanStep[] = alreadyPresent
        ? currentSteps
        : [
            ...currentSteps,
            {
              id: generateId('step'),
              kind: 'exercise',
              exerciceId,
              durationMin: options?.durationMin ?? 15,
              note: options?.note ?? '',
            },
          ];
      const nextExIds = currentExIds.includes(exerciceId)
        ? currentExIds
        : [...currentExIds, exerciceId];

      updateDatabaseRow(IMPRO_DB_IDS.seances, seanceId, {
        ...seanceRow.cells,
        [IMPRO_COL_IDS.seances.exercices]: nextExIds,
        [IMPRO_COL_IDS.seances.deroule]: serializeSessionPlan(nextSteps),
      });
    },
    [updateDatabaseRow]
  );

  const createSessionInPrepareFromExplore = useCallback(
    async (
      session: ExploreSuggestedSession,
      groupId: string,
      contextMeta?: { threadId?: string; messageId?: string }
    ) => {
      const steps: ImproPlanStep[] = [];
      const createdByName = new Map<string, string>();

      for (const rawStep of session.steps) {
        if (rawStep.kind === 'custom') {
          steps.push({
            id: generateId('step'),
            kind: 'custom',
            label: rawStep.nom,
            durationMin: rawStep.durationMin,
            note: rawStep.note,
          });
          continue;
        }

        let exId = rawStep.existingExerciceId || rawStep.addedToBiblimproId;
        if (!exId) {
          const normalizedName = rawStep.nom.trim().toLowerCase();
          const existingRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
          const matchedRow = existingRows.find(
            (r) =>
              String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim().toLowerCase() ===
              normalizedName
          );
          exId = matchedRow?.id ?? createdByName.get(normalizedName);
          if (!exId) {
            exId = await addDatabaseRow(IMPRO_DB_IDS.exercices, {
              [IMPRO_COL_IDS.exercices.nom]: rawStep.nom.trim().slice(0, 140),
              [IMPRO_COL_IDS.exercices.etape]: rawStep.etape ? [rawStep.etape] : [],
              [IMPRO_COL_IDS.exercices.tags]: rawStep.tags ?? [],
              [IMPRO_COL_IDS.exercices.description]: rawStep.description ?? '',
            });
            if (exId) createdByName.set(normalizedName, exId);
          }
        }

        if (exId) {
          steps.push({
            id: generateId('step'),
            kind: 'exercise',
            exerciceId: exId,
            durationMin: rawStep.durationMin,
            note: rawStep.note,
          });
        } else {
          steps.push({
            id: generateId('step'),
            kind: 'custom',
            label: rawStep.nom,
            durationMin: rawStep.durationMin,
            note: rawStep.note,
          });
        }
      }

      if (contextMeta?.threadId && contextMeta?.messageId) {
        const thread = exploreThreadsRef.current.find((t) => t.id === contextMeta.threadId);
        if (thread) {
          const nextMessages = thread.messages.map((m) =>
            m.id === contextMeta.messageId
              ? {
                  ...m,
                  suggestedSessions: m.suggestedSessions?.map((s) =>
                    s.id === session.id ? { ...s, createdSeanceId: 'prepared_draft' } : s
                  ),
                }
              : m
          );
          await updateExploreThread(thread.id, { messages: nextMessages });
        }
      }

      navigateToPrepare({
        groupId: groupId || undefined,
        initialNom: session.titre,
        initialNotes: session.objectif,
        initialSteps: steps,
      });
    },
    [addDatabaseRow, navigateToPrepare, updateExploreThread]
  );

  const applyBiblimproNotionPayloads = useCallback(
    async (payloads: NotionExerciseSyncPayload[]): Promise<NotionSyncMergeSummary> => {
      const exPage = pagesRef.current.find((p) => p.id === IMPRO_DB_IDS.exercices);
      const existingExRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
      const existingSeanceRows = rowsRef.current[IMPRO_DB_IDS.seances] ?? [];
      const existingColumns = exPage?.columns ?? [];
      const ownerId = user?.uid ?? 'local';

      const legacyBlocksByRowId = new Map<string, BlockItem[]>();
      for (const r of existingExRows) {
        if (!r.blocks && r.linkedPageId) {
          const linked = pagesRef.current.find((p) => p.id === r.linkedPageId && !p.isTrashed);
          if (linked?.blocks && linked.blocks.length > 0) {
            legacyBlocksByRowId.set(r.id, linked.blocks);
          }
        }
      }

      const merged = mergeBiblimproNotionBatch({
        payloads,
        existingExerciseRows: existingExRows,
        existingSeanceRows,
        existingColumns,
        legacyBlocksByRowId,
        workspaceId,
        ownerId,
      });

      const prevExById = new Map(existingExRows.map((r) => [r.id, r]));
      const seancePatchesMap = new Map<string, DatabaseRow>();
      const workingRowsForMirror: Record<string, DatabaseRow[]> = {
        ...rowsRef.current,
        [IMPRO_DB_IDS.exercices]: merged.nextRows,
      };

      for (const changedRow of merged.changedRows) {
        const prevRow = prevExById.get(changedRow.id);
        const patches = computeBidirectionalRowPatches(
          IMPRO_DB_IDS.exercices,
          changedRow.id,
          prevRow?.cells ?? {},
          changedRow.cells,
          workingRowsForMirror
        );
        for (const patch of patches) {
          seancePatchesMap.set(`${patch.pageId}::${patch.id}`, patch);
        }
        if (patches.length > 0) {
          workingRowsForMirror[IMPRO_DB_IDS.seances] = (
            workingRowsForMirror[IMPRO_DB_IDS.seances] ?? []
          ).map((sr) => seancePatchesMap.get(`${sr.pageId}::${sr.id}`) ?? sr);
        }
      }
      const mirrorPatches = Array.from(seancePatchesMap.values());

      if (merged.columnsChanged) {
        const nextPages = pagesRef.current.map((p) =>
          p.id === IMPRO_DB_IDS.exercices ? { ...p, columns: merged.nextColumns } : p
        );
        pagesRef.current = nextPages;
        setPages(nextPages);
      }

      const nextRowsMap = applyMirrorPatchesToRowsMap(
        {
          ...rowsRef.current,
          [IMPRO_DB_IDS.exercices]: merged.nextRows,
        },
        mirrorPatches
      );
      rowsRef.current = nextRowsMap;
      setRowsByPage((prev) => {
        const updated = {
          ...prev,
          [IMPRO_DB_IDS.exercices]: merged.nextRows,
        };
        return applyMirrorPatchesToRowsMap(updated, mirrorPatches);
      });

      if (user && workspaceId !== 'local') {
        setSyncStatus('syncing');
        try {
          if (merged.columnsChanged) {
            await updatePageContentInFirestore(workspaceId, IMPRO_DB_IDS.exercices, {
              columns: merged.nextColumns,
            });
          }
          const rowsToPersist = [...merged.changedRows, ...mirrorPatches];
          if (rowsToPersist.length > 0) {
            await batchUpsertRowsInFirestore(rowsToPersist, merged.newRowKeys);
          }
          setSyncStatus('synced');
        } catch (err) {
          setSyncStatus('error');
          throw err;
        }
      } else {
        setHasLocalEdits(true);
      }

      return merged.summary;
    },
    [user, workspaceId]
  );

  const syncBiblimproFromNotion = useCallback(
    async (options?: {
      mode?: 'missing' | 'all';
      databaseId?: string;
      signal?: AbortSignal;
      onProgress?: (progress: NotionBiblimproSyncProgress) => void;
    }) => {
      const mode = options?.mode ?? 'all';
      const skipNotionPageIds: string[] = [];
      const skipTitles: string[] = [];

      if (mode === 'missing') {
        const currentExRows = rowsRef.current[IMPRO_DB_IDS.exercices] ?? [];
        for (const r of currentExRows) {
          if (!r.notionSyncedAt) continue;
          if (r.notionPageId) skipNotionPageIds.push(r.notionPageId);
          const nom = String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim();
          if (nom) skipTitles.push(nom);
        }
      }

      const aggregated: NotionSyncMergeSummary = {
        updatedCount: 0,
        createdCount: 0,
        unchangedCount: 0,
        blocksSyncedCount: 0,
        commentsSyncedCount: 0,
        syncedAt: new Date().toISOString(),
      };

      const streamRes = await streamBiblimproFromNotion({
        databaseId: options?.databaseId,
        skipNotionPageIds: mode === 'missing' ? skipNotionPageIds : undefined,
        skipTitles: mode === 'missing' ? skipTitles : undefined,
        signal: options?.signal,
        onProgress: options?.onProgress,
        onBatch: async (batch) => {
          const part = await applyBiblimproNotionPayloads(batch);
          aggregated.updatedCount += part.updatedCount;
          aggregated.createdCount += part.createdCount;
          aggregated.unchangedCount += part.unchangedCount;
          aggregated.blocksSyncedCount += part.blocksSyncedCount;
          aggregated.commentsSyncedCount += part.commentsSyncedCount;
          aggregated.syncedAt = part.syncedAt;
        },
      });

      return {
        summary: aggregated,
        databaseTitle: streamRes.databaseTitle,
        skippedCount: streamRes.skippedCount,
        warnings: streamRes.warnings,
      };
    },
    [applyBiblimproNotionPayloads]
  );

  const syncSingleExerciseFromNotion = useCallback(
    async (rowId: string, databaseId?: string) => {
      const existing = (rowsRef.current[IMPRO_DB_IDS.exercices] ?? []).find(
        (r) => r.id === rowId
      );
      if (!existing) {
        throw new Error('Exercice introuvable dans Biblimpro.');
      }
      const title = String(existing.cells[IMPRO_COL_IDS.exercices.nom] ?? '').trim();
      const singleRes = await syncSingleNotionExercise({
        notionPageId: existing.notionPageId,
        title,
        databaseId,
      });
      const summary = await applyBiblimproNotionPayloads([singleRes.payload]);
      return {
        updated: summary.updatedCount > 0 || summary.createdCount > 0,
        blocksCount: singleRes.payload.blocks.length,
        commentsCount: singleRes.payload.comments.length,
        warning: singleRes.warning,
      };
    },
    [applyBiblimproNotionPayloads]
  );

  const value: WorkspaceContextValue = {
    user,
    authReady,
    authError,
    syncStatus,
    theme,
    toggleTheme,
    signInGoogle,
    retryCloudSync,
    signOutUser,
    pages,
    rowsByPage,
    activePageId,
    activePage,
    mainView,
    embedTarget,
    urlEmbedToken,
    exercicesEmbedToken,
    embedSnapshotActive,
    embedSnapshotLoading,
    embedSnapshotError,
    embedSyncing,
    embedLastSyncedAt,
    embedReadOnlyNotice,
    dismissEmbedReadOnlyNotice,
    ensureExercicesEmbedLink,
    syncExercicesSharedEmbedNow,
    setMainView,
    selectPage,
    createPage,
    updatePageTitle,
    updatePageIcon,
    updatePageBlocks,
    updateDatabaseColumns,
    updateDatabaseView,
    databaseSorts,
    setDatabaseSorts,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
    toggleFavorite,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    addDatabaseRow,
    updateDatabaseRow,
    updateRowBlocks,
    updateRowComments,
    deleteDatabaseRow,
    deleteDatabaseRows,
    openOrCreateRowPage,
    importNotionDrafts,
    pendingLocalDraftsCount: localDirtyPages.length,
    migrateLocalPagesToCloud,
    dismissLocalMigration,
    exportWorkspaceJson,
    importWorkspaceJson,
    resetToDemoWorkspace,
    commandPaletteOpen,
    setCommandPaletteOpen,
    liveSessionId,
    openLiveAnimation,
    closeLiveAnimation,
    improModel,
    improLoading,
    improError,
    improDetailTarget,
    detailTrail,
    detailOrigin,
    openImproDetail,
    navigateDetailTrailTo,
    returnToDetailOrigin,
    closeImproDetail,
    prefillSeanceFromGroup,
    toggleSeanceStatus,
    toggleSeanceParticipant,
    timelinePreset,
    navigateToTimeline,
    clearTimelinePreset,
    prepareDraft,
    navigateToPrepare,
    clearPrepareDraft,
    loadImproDatabases,
    moveExerciseRank,
    stepExerciseRank,
    setExerciseScore,
    exploreThreads,
    activeExploreThreadId,
    createExploreThread,
    selectExploreThread,
    updateExploreThread,
    deleteExploreThread,
    addSuggestedExerciseToBiblimpro,
    addExerciseToPlannedSeance,
    createSessionInPrepareFromExplore,
    notionSyncModalOpen,
    setNotionSyncModalOpen,
    syncBiblimproFromNotion,
    syncSingleExerciseFromNotion,
    viewSettings,
    updateDatabaseViewSettings,
    updatePrepareSettings,
    updateTimelineSettings,
    updateStatsSettings,
    updateExploreViewSettings,
    updateSearchViewSettings,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function hasImproInSnapshot(pages: WorkspacePage[]): boolean {
  const ids = new Set(pages.map((p) => p.id));
  return (
    ids.has(IMPRO_DB_IDS.exercices) &&
    ids.has(IMPRO_DB_IDS.seances) &&
    ids.has(IMPRO_DB_IDS.groupes) &&
    ids.has(IMPRO_DB_IDS.participants)
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace doit être utilisé dans WorkspaceProvider');
  }
  return ctx;
}
