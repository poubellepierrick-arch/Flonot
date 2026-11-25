export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'todo'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'toggle'
  | 'table'
  | 'bookmark'
  | 'youtube'
  | 'audio';

export interface TableBlockRow {
  cells: string[];
}

export interface BlockItem {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  language?: string;
  icon?: string;
  isOpen?: boolean;
  details?: string;
  url?: string;
  tableRows?: TableBlockRow[];
}

export type ColumnType =
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'date'
  | 'url'
  | 'relation'
  | 'rollup'
  | 'formula';

export type RollupFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'values'
  | 'checked_count';

export interface DatabaseColumn {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[];
  relationTargetPageId?: string;
  rollupRelationColId?: string;
  rollupTargetColId?: string;
  rollupFn?: RollupFunction;
  formulaExpression?: string;
}

export type DatabaseViewType = 'table' | 'kanban' | 'list';

export type CellValue = string | number | boolean | string[];

export interface RowComment {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface DatabaseRow {
  id: string;
  pageId: string;
  workspaceId: string;
  ownerId: string;
  order: number;
  cells: Record<string, CellValue>;
  linkedPageId?: string | null;
  blocks?: BlockItem[];
  comments?: RowComment[];
  notionPageId?: string;
  notionSyncedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PageType = 'document' | 'database';
export type PageSource = 'native' | 'notion_import';

export interface WorkspacePage {
  id: string;
  workspaceId: string;
  ownerId: string;
  parentId: string | null;
  title: string;
  icon: string;
  type: PageType;
  isFavorite: boolean;
  isTrashed: boolean;
  order: number;
  source: PageSource;
  blocks: BlockItem[];
  columns?: DatabaseColumn[];
  activeView?: DatabaseViewType;
  sortRules?: DatabaseSortRule[];
  columnWidths?: Record<string, number>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ThemeMode = 'light' | 'dark';

export interface UserProfile {
  uid: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  theme: ThemeMode;
  updatedAt?: unknown;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export type MainViewMode =
  | 'chronology'
  | 'prepare'
  | 'explore'
  | 'stats'
  | 'page'
  | 'import'
  | 'trash'
  | 'search';

export type ImproSessionStatus = 'Réalisée' | 'Préparée';

export interface ImproPlanStep {
  id: string;
  kind: 'exercise' | 'custom';
  exerciceId?: string;
  label?: string;
  durationMin: number;
  note: string;
}

export interface ImproTimelineFilterPreset {
  mode?: 'chronology' | 'matrix' | 'participant';
  groupId?: string;
  participantId?: string;
  exerciseId?: string;
  etape?: string;
}

export interface ImproPrepareDraftConfig {
  seanceId?: string;
  duplicateFromId?: string;
  groupId?: string;
  addExerciseIds?: string[];
  initialNom?: string;
  initialNotes?: string;
  initialSteps?: ImproPlanStep[];
}

export type SortDirection = 'asc' | 'desc';

export interface DatabaseSortRule {
  colId: string;
  dir: SortDirection;
}

export type ExploreModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type ExploreTier = 'standard' | 'plan' | 'max';

export interface ExploreWebSource {
  title: string;
  url: string;
}

export interface ExploreSuggestedExercise {
  id: string;
  nom: string;
  etape: string;
  tags: string[];
  description: string;
  durationMin: number;
  note: string;
  existingExerciceId?: string;
  addedToBiblimproId?: string;
}

export interface ExploreSuggestedSessionStep {
  kind: 'exercise' | 'custom';
  nom: string;
  etape?: string;
  tags?: string[];
  description?: string;
  durationMin: number;
  note: string;
  existingExerciceId?: string;
  addedToBiblimproId?: string;
}

export interface ExploreSuggestedSession {
  id: string;
  titre: string;
  objectif: string;
  dureeTotaleMin: number;
  steps: ExploreSuggestedSessionStep[];
  createdSeanceId?: string;
}

export interface ExploreMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  modelId?: ExploreModelId;
  tier?: ExploreTier;
  useWebSearch?: boolean;
  webSources?: ExploreWebSource[];
  suggestedExercises?: ExploreSuggestedExercise[];
  suggestedSessions?: ExploreSuggestedSession[];
  error?: string;
}

export interface ExploreThread {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  groupId: string;
  thematique: string;
  modelId: ExploreModelId;
  tier: ExploreTier;
  useWebSearch: boolean;
  messages: ExploreMessage[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ViewSettingKind =
  | 'nav'
  | 'database'
  | 'prepare'
  | 'timeline'
  | 'stats'
  | 'explore'
  | 'search'
  | 'table_orders';

export type NotionSyncFilter = 'all' | 'synced' | 'pending';

export interface DatabaseViewSettings {
  filterQuery: string;
  notionSyncFilter: NotionSyncFilter;
  showAllRows: boolean;
  embedToken?: string;
}

export type PrepareNoveltyTab = 'all_new' | 'majority' | 'done' | 'all';
export type PrepareSubTab = 'choose' | 'deroule';

export interface PrepareTableFilterSettings {
  noveltyTab: PrepareNoveltyTab;
  searchQuery: string;
  etapeFilter: string;
  tagFilter: string;
  onlyCheck1: boolean;
  onlyCheck2: boolean;
  onlyCheckV: boolean;
  showAllRows: boolean;
}

export interface PrepareSessionSettings {
  editingSeanceId: string | null;
  nom: string;
  date: string;
  groupeId: string;
  presentIds: string[];
  showAllParticipants: boolean;
  participantsExpanded: boolean;
  steps: ImproPlanStep[];
  notes: string;
  status: ImproSessionStatus;
  activeSubTab: PrepareSubTab;
  sortRules: DatabaseSortRule[];
}

export interface PrepareViewSettings {
  session: PrepareSessionSettings;
  targetDurationMin: number;
  tableFilters: PrepareTableFilterSettings;
}

export type TimelineModeSetting = 'chronology' | 'matrix' | 'participant';
export type TimelineGroupBySetting = 'flat' | 'month' | 'group';
export type TimelineStatusFilter = 'all' | 'Réalisée' | 'Préparée';

export interface TimelineViewSettings {
  mode: TimelineModeSetting;
  groupBy: TimelineGroupBySetting;
  sortDesc: boolean;
  searchQuery: string;
  groupId: string;
  participantId: string;
  exerciseId: string;
  etapeFilter: string;
  statusFilter: TimelineStatusFilter;
  dateFrom: string;
  dateTo: string;
  matrixGroupId: string | null;
  matrixOnlyNever: boolean;
}

export type StatsParticipantSortKey = 'nom' | 'presences' | 'attendancePct' | 'distinct';
export type StatsExerciseTab = 'top' | 'forgotten' | 'never';

export interface StatsViewSettings {
  groupId: string;
  dateFrom: string;
  dateTo: string;
  parSortKey: StatsParticipantSortKey;
  parSortAsc: boolean;
  exerciseTab: StatsExerciseTab;
}

export interface ExploreViewSettings {
  draftGroupId: string;
  draftThematique: string;
  draftModelId: ExploreModelId;
  draftTier: ExploreTier;
  draftUseWebSearch: boolean;
  historyDrawerOpen: boolean;
  activeThreadId: string | null;
}

export interface NavViewSettings {
  mainView: MainViewMode;
  activePageId: string | null;
}

export interface SearchViewSettings {
  query: string;
}

export interface WorkspaceViewSettingsState {
  nav: NavViewSettings;
  databaseByPageId: Record<string, DatabaseViewSettings>;
  prepare: PrepareViewSettings;
  timeline: TimelineViewSettings;
  stats: StatsViewSettings;
  explore: ExploreViewSettings;
  search: SearchViewSettings;
}

