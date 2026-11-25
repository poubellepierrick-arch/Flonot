import type {
  DatabaseSortRule,
  DatabaseViewSettings,
  ExploreModelId,
  ExploreTier,
  ExploreViewSettings,
  ImproPlanStep,
  MainViewMode,
  NavViewSettings,
  NotionSyncFilter,
  PrepareNoveltyTab,
  PrepareSessionSettings,
  PrepareTableFilterSettings,
  PrepareViewSettings,
  SearchViewSettings,
  StatsExerciseTab,
  StatsParticipantSortKey,
  StatsViewSettings,
  TimelineGroupBySetting,
  TimelineModeSetting,
  TimelineStatusFilter,
  TimelineViewSettings,
  WorkspaceViewSettingsState,
} from '../types/workspace';
import { isValidEmbedToken } from './embedMode';

export const DEFAULT_DATABASE_VIEW_SETTINGS: DatabaseViewSettings = {
  filterQuery: '',
  notionSyncFilter: 'all',
  showAllRows: false,
};

export const DEFAULT_PREPARE_TABLE_FILTERS: PrepareTableFilterSettings = {
  noveltyTab: 'all_new',
  searchQuery: '',
  etapeFilter: '',
  tagFilter: '',
  onlyCheck1: false,
  onlyCheck2: false,
  onlyCheckV: false,
  showAllRows: false,
};

export function createDefaultPrepareSessionSettings(
  today: string = new Date().toISOString().slice(0, 10)
): PrepareSessionSettings {
  return {
    editingSeanceId: null,
    nom: '',
    date: today,
    groupeId: '',
    presentIds: [],
    showAllParticipants: false,
    participantsExpanded: true,
    steps: [],
    notes: '',
    status: 'Préparée',
    activeSubTab: 'choose',
    sortRules: [{ colId: 'ded_prep_novelty', dir: 'asc' }],
  };
}

export function createDefaultPrepareViewSettings(
  today: string = new Date().toISOString().slice(0, 10)
): PrepareViewSettings {
  return {
    session: createDefaultPrepareSessionSettings(today),
    targetDurationMin: 90,
    tableFilters: { ...DEFAULT_PREPARE_TABLE_FILTERS },
  };
}

export const DEFAULT_TIMELINE_VIEW_SETTINGS: TimelineViewSettings = {
  mode: 'chronology',
  groupBy: 'month',
  sortDesc: true,
  searchQuery: '',
  groupId: '',
  participantId: '',
  exerciseId: '',
  etapeFilter: '',
  statusFilter: 'all',
  dateFrom: '',
  dateTo: '',
  matrixGroupId: null,
  matrixOnlyNever: false,
};

export const DEFAULT_STATS_VIEW_SETTINGS: StatsViewSettings = {
  groupId: '',
  dateFrom: '',
  dateTo: '',
  parSortKey: 'presences',
  parSortAsc: false,
  exerciseTab: 'top',
};

export const DEFAULT_EXPLORE_VIEW_SETTINGS: ExploreViewSettings = {
  draftGroupId: '',
  draftThematique: '',
  draftModelId: 'gemini-4-hydrogen',
  draftTier: 'plan',
  draftUseWebSearch: false,
  historyDrawerOpen: true,
  activeThreadId: null,
};

export const DEFAULT_NAV_VIEW_SETTINGS: NavViewSettings = {
  mainView: 'chronology',
  activePageId: null,
};

export const DEFAULT_SEARCH_VIEW_SETTINGS: SearchViewSettings = {
  query: '',
};

export function createDefaultWorkspaceViewSettings(
  today: string = new Date().toISOString().slice(0, 10)
): WorkspaceViewSettingsState {
  return {
    nav: { ...DEFAULT_NAV_VIEW_SETTINGS },
    databaseByPageId: {},
    prepare: createDefaultPrepareViewSettings(today),
    timeline: { ...DEFAULT_TIMELINE_VIEW_SETTINGS },
    stats: { ...DEFAULT_STATS_VIEW_SETTINGS },
    explore: { ...DEFAULT_EXPLORE_VIEW_SETTINGS },
    search: { ...DEFAULT_SEARCH_VIEW_SETTINGS },
  };
}

const VALID_MAIN_VIEWS = new Set<MainViewMode>([
  'chronology',
  'prepare',
  'explore',
  'stats',
  'page',
  'import',
  'trash',
  'search',
]);

const VALID_NOTION_FILTERS = new Set<NotionSyncFilter>(['all', 'synced', 'pending']);
const VALID_NOVELTY_TABS = new Set<PrepareNoveltyTab>(['all_new', 'majority', 'done', 'all']);
const VALID_TIMELINE_MODES = new Set<TimelineModeSetting>(['chronology', 'matrix', 'participant']);
const VALID_TIMELINE_GROUPS = new Set<TimelineGroupBySetting>(['flat', 'month', 'group']);
const VALID_TIMELINE_STATUSES = new Set<TimelineStatusFilter>(['all', 'Réalisée', 'Préparée']);
const VALID_PAR_SORT_KEYS = new Set<StatsParticipantSortKey>([
  'nom',
  'presences',
  'attendancePct',
  'distinct',
]);
const VALID_EXERCISE_TABS = new Set<StatsExerciseTab>(['top', 'forgotten', 'never']);
const VALID_EXPLORE_MODELS = new Set<ExploreModelId>([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);
const VALID_EXPLORE_TIERS = new Set<ExploreTier>(['standard', 'plan', 'max']);

function cleanId(raw: unknown, maxLen = 128): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
}

function cleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.slice(0, maxLen);
}

function sanitizeSortRulesList(raw: unknown): DatabaseSortRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DatabaseSortRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const colId = cleanId(rec.colId, 64);
    if (!colId || seen.has(colId)) continue;
    seen.add(colId);
    out.push({
      colId,
      dir: rec.dir === 'desc' ? 'desc' : 'asc',
    });
    if (out.length >= 30) break;
  }
  return out;
}

export function sanitizeDatabaseViewSettings(raw: unknown): DatabaseViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DATABASE_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  const notionSyncFilter =
    typeof rec.notionSyncFilter === 'string' &&
    VALID_NOTION_FILTERS.has(rec.notionSyncFilter as NotionSyncFilter)
      ? (rec.notionSyncFilter as NotionSyncFilter)
      : 'all';
  const rawToken = typeof rec.embedToken === 'string' ? rec.embedToken.trim() : '';
  return {
    filterQuery: cleanText(rec.filterQuery, 200),
    notionSyncFilter,
    showAllRows: Boolean(rec.showAllRows),
    ...(isValidEmbedToken(rawToken) ? { embedToken: rawToken } : {}),
  };
}

export function sanitizePrepareViewSettings(
  raw: unknown,
  today: string = new Date().toISOString().slice(0, 10)
): PrepareViewSettings {
  const defaults = createDefaultPrepareViewSettings(today);
  if (!raw || typeof raw !== 'object') return defaults;
  const rec = raw as Record<string, unknown>;

  const rawSession =
    rec.session && typeof rec.session === 'object'
      ? (rec.session as Record<string, unknown>)
      : {};
  const rawSteps = Array.isArray(rawSession.steps) ? rawSession.steps : [];
  const steps: ImproPlanStep[] = [];
  for (let i = 0; i < rawSteps.length && steps.length < 60; i++) {
    const item = rawSteps[i];
    if (!item || typeof item !== 'object') continue;
    const st = item as Record<string, unknown>;
    const id = cleanId(st.id, 128) || `step_${i}`;
    const kind = st.kind === 'custom' ? 'custom' : 'exercise';
    const durationNum = Number(st.durationMin);
    const durationMin = Number.isFinite(durationNum)
      ? Math.max(0, Math.min(480, Math.round(durationNum)))
      : 15;
    const note = cleanText(st.note, 1000);

    if (kind === 'custom') {
      steps.push({
        id,
        kind: 'custom',
        label: cleanText(st.label, 200),
        durationMin,
        note,
      });
    } else {
      const exerciceId = cleanId(st.exerciceId, 128);
      if (!exerciceId) continue;
      steps.push({
        id,
        kind: 'exercise',
        exerciceId,
        durationMin,
        note,
      });
    }
  }

  const presentIds = Array.isArray(rawSession.presentIds)
    ? Array.from(
        new Set(rawSession.presentIds.map((v) => cleanId(v, 128)).filter(Boolean))
      ).slice(0, 300)
    : [];

  const editingSeanceIdRaw = cleanId(rawSession.editingSeanceId, 128);
  const sortRules =
    'sortRules' in rawSession
      ? sanitizeSortRulesList(rawSession.sortRules)
      : defaults.session.sortRules;

  const session: PrepareSessionSettings = {
    editingSeanceId: editingSeanceIdRaw || null,
    nom: cleanText(rawSession.nom, 200),
    date:
      typeof rawSession.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawSession.date)
        ? rawSession.date
        : defaults.session.date,
    groupeId: cleanId(rawSession.groupeId, 128),
    presentIds,
    showAllParticipants: Boolean(rawSession.showAllParticipants),
    participantsExpanded:
      typeof rawSession.participantsExpanded === 'boolean'
        ? rawSession.participantsExpanded
        : true,
    steps,
    notes: cleanText(rawSession.notes, 10000),
    status: rawSession.status === 'Réalisée' ? 'Réalisée' : 'Préparée',
    activeSubTab: rawSession.activeSubTab === 'deroule' ? 'deroule' : 'choose',
    sortRules,
  };

  const targetNum = Number(rec.targetDurationMin);
  const targetDurationMin = Number.isFinite(targetNum)
    ? Math.max(15, Math.min(480, Math.round(targetNum)))
    : 90;

  const rawFilters =
    rec.tableFilters && typeof rec.tableFilters === 'object'
      ? (rec.tableFilters as Record<string, unknown>)
      : {};
  const noveltyTab =
    typeof rawFilters.noveltyTab === 'string' &&
    VALID_NOVELTY_TABS.has(rawFilters.noveltyTab as PrepareNoveltyTab)
      ? (rawFilters.noveltyTab as PrepareNoveltyTab)
      : 'all_new';

  const tableFilters: PrepareTableFilterSettings = {
    noveltyTab,
    searchQuery: cleanText(rawFilters.searchQuery, 200),
    etapeFilter: cleanText(rawFilters.etapeFilter, 120),
    tagFilter: cleanText(rawFilters.tagFilter, 120),
    onlyCheck1: Boolean(rawFilters.onlyCheck1),
    onlyCheck2: Boolean(rawFilters.onlyCheck2),
    onlyCheckV: Boolean(rawFilters.onlyCheckV),
    showAllRows: Boolean(rawFilters.showAllRows),
  };

  return {
    session,
    targetDurationMin,
    tableFilters,
  };
}

export function sanitizeTimelineViewSettings(raw: unknown): TimelineViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TIMELINE_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  const mode =
    typeof rec.mode === 'string' && VALID_TIMELINE_MODES.has(rec.mode as TimelineModeSetting)
      ? (rec.mode as TimelineModeSetting)
      : 'chronology';
  const groupBy =
    typeof rec.groupBy === 'string' &&
    VALID_TIMELINE_GROUPS.has(rec.groupBy as TimelineGroupBySetting)
      ? (rec.groupBy as TimelineGroupBySetting)
      : 'month';
  const statusFilter =
    typeof rec.statusFilter === 'string' &&
    VALID_TIMELINE_STATUSES.has(rec.statusFilter as TimelineStatusFilter)
      ? (rec.statusFilter as TimelineStatusFilter)
      : 'all';

  let matrixGroupId: string | null = null;
  if (rec.matrixGroupId === '') matrixGroupId = '';
  else if (typeof rec.matrixGroupId === 'string') {
    const cleaned = cleanId(rec.matrixGroupId, 128);
    matrixGroupId = cleaned || '';
  }

  return {
    mode,
    groupBy,
    sortDesc: typeof rec.sortDesc === 'boolean' ? rec.sortDesc : true,
    searchQuery: cleanText(rec.searchQuery, 200),
    groupId: cleanId(rec.groupId, 128),
    participantId: cleanId(rec.participantId, 128),
    exerciseId: cleanId(rec.exerciseId, 128),
    etapeFilter: cleanText(rec.etapeFilter, 120),
    statusFilter,
    dateFrom: cleanText(rec.dateFrom, 20),
    dateTo: cleanText(rec.dateTo, 20),
    matrixGroupId,
    matrixOnlyNever: Boolean(rec.matrixOnlyNever),
  };
}

export function sanitizeStatsViewSettings(raw: unknown): StatsViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATS_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  const parSortKey =
    typeof rec.parSortKey === 'string' &&
    VALID_PAR_SORT_KEYS.has(rec.parSortKey as StatsParticipantSortKey)
      ? (rec.parSortKey as StatsParticipantSortKey)
      : 'presences';
  const exerciseTab =
    typeof rec.exerciseTab === 'string' &&
    VALID_EXERCISE_TABS.has(rec.exerciseTab as StatsExerciseTab)
      ? (rec.exerciseTab as StatsExerciseTab)
      : 'top';
  return {
    groupId: cleanId(rec.groupId, 128),
    dateFrom: cleanText(rec.dateFrom, 20),
    dateTo: cleanText(rec.dateTo, 20),
    parSortKey,
    parSortAsc: Boolean(rec.parSortAsc),
    exerciseTab,
  };
}

export function sanitizeExploreViewSettings(raw: unknown): ExploreViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EXPLORE_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  const draftModelId =
    typeof rec.draftModelId === 'string' &&
    VALID_EXPLORE_MODELS.has(rec.draftModelId as ExploreModelId)
      ? (rec.draftModelId as ExploreModelId)
      : 'gemini-4-hydrogen';
  const draftTier =
    typeof rec.draftTier === 'string' && VALID_EXPLORE_TIERS.has(rec.draftTier as ExploreTier)
      ? (rec.draftTier as ExploreTier)
      : 'plan';
  const activeThreadIdRaw = cleanId(rec.activeThreadId, 128);
  return {
    draftGroupId: cleanId(rec.draftGroupId, 128),
    draftThematique: cleanText(rec.draftThematique, 300),
    draftModelId,
    draftTier,
    draftUseWebSearch: Boolean(rec.draftUseWebSearch),
    historyDrawerOpen:
      typeof rec.historyDrawerOpen === 'boolean' ? rec.historyDrawerOpen : true,
    activeThreadId: activeThreadIdRaw || null,
  };
}

export function sanitizeNavViewSettings(raw: unknown): NavViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NAV_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  const mainView =
    typeof rec.mainView === 'string' && VALID_MAIN_VIEWS.has(rec.mainView as MainViewMode)
      ? (rec.mainView as MainViewMode)
      : 'chronology';
  const activePageIdRaw = cleanId(rec.activePageId, 128);
  return {
    mainView,
    activePageId: activePageIdRaw || null,
  };
}

export function sanitizeSearchViewSettings(raw: unknown): SearchViewSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SEARCH_VIEW_SETTINGS };
  const rec = raw as Record<string, unknown>;
  return {
    query: cleanText(rec.query, 200),
  };
}

export function sanitizeTableColumnOrdersMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [rawKey, rawList] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    const key = cleanId(rawKey, 128);
    if (!key || !Array.isArray(rawList)) continue;
    out[key] = rawList
      .map((item) => cleanId(item, 128))
      .filter(Boolean)
      .slice(0, 120);
  }
  return out;
}

export function sanitizeWorkspaceViewSettings(
  raw: unknown,
  today: string = new Date().toISOString().slice(0, 10)
): WorkspaceViewSettingsState {
  if (!raw || typeof raw !== 'object') return createDefaultWorkspaceViewSettings(today);
  const rec = raw as Record<string, unknown>;
  const databaseByPageId: Record<string, DatabaseViewSettings> = {};
  if (rec.databaseByPageId && typeof rec.databaseByPageId === 'object') {
    for (const [rawPageId, dbVal] of Object.entries(
      rec.databaseByPageId as Record<string, unknown>
    ).slice(0, 100)) {
      const pageId = cleanId(rawPageId, 128);
      if (!pageId) continue;
      databaseByPageId[pageId] = sanitizeDatabaseViewSettings(dbVal);
    }
  }
  return {
    nav: sanitizeNavViewSettings(rec.nav),
    databaseByPageId,
    prepare: sanitizePrepareViewSettings(rec.prepare, today),
    timeline: sanitizeTimelineViewSettings(rec.timeline),
    stats: sanitizeStatsViewSettings(rec.stats),
    explore: sanitizeExploreViewSettings(rec.explore),
    search: sanitizeSearchViewSettings(rec.search),
  };
}

export function getDatabaseSettingDocId(pageId: string): string {
  const cleaned = cleanId(pageId, 124);
  return `db_${cleaned || 'page'}`.slice(0, 128);
}

export function extractDatabasePageIdFromDocId(docId: string): string | null {
  if (!docId.startsWith('db_') || docId.length <= 3) return null;
  return docId.slice(3);
}
