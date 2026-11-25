import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Code2,
  Columns3,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Info,
  LayoutList,
  Link2,
  Lock,
  LogIn,
  Minus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Smile,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { formatFirebaseSyncError } from '../services/firebase';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { useRowDrag } from '../hooks/useRowDrag';
import type {
  CellValue,
  ColumnType,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  DatabaseViewType,
  RollupFunction,
  WorkspacePage,
} from '../types/workspace';
import {
  extractReorderedNativeColumns,
  getPrimaryColumn,
  mergeColumnOrder,
  reorderIds,
  syncNativeOrderInMixedList,
} from '../utils/columnOrder';
import { sortDatabaseRows, type SortableDeducedColumn } from '../utils/databaseSort';
import {
  buildInitialRowCells,
  orderAndFilterDatabaseRows,
} from '../utils/databaseRowDraft';
import {
  buildExercicesEmbedIframeCode,
  buildExercicesEmbedUrl,
  buildMainAppUrlFromEmbed,
  copyTextToClipboard,
} from '../utils/embedMode';
import { generateId } from '../utils/id';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { getActiveScoreSortDir } from '../utils/exerciseRanking';
import { isImproDatabasePage } from '../utils/improEngine';
import { formatCellText, getComputedRowCells } from '../utils/notionFormula';
import { DEFAULT_DATABASE_VIEW_SETTINGS } from '../utils/viewSettings';
import { ChoiceOrderEditor } from './ChoiceOrderEditor';
import { EmojiPicker } from './EmojiPicker';
import { RelationActionRow } from './RelationActionRow';
import { ScoreRankInput } from './ScoreRankInput';

interface DatabaseViewProps {
  page: WorkspacePage;
  embedMode?: boolean;
}

const COLUMN_TYPE_LABELS: Array<{ value: ColumnType; label: string }> = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'select', label: 'Sélection' },
  { value: 'multi_select', label: 'Sélection multiple' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Case' },
  { value: 'url', label: 'Lien' },
  { value: 'relation', label: 'Relation' },
  { value: 'rollup', label: 'Agrégat' },
  { value: 'formula', label: 'Formule' },
];

const ROLLUP_FN_LABELS: Array<{ value: RollupFunction; label: string }> = [
  { value: 'count', label: 'Nombre' },
  { value: 'sum', label: 'Somme' },
  { value: 'avg', label: 'Moyenne' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'values', label: 'Valeurs' },
  { value: 'checked_count', label: 'Cases cochées' },
];

interface ColumnFormState {
  editingId: string | null;
  name: string;
  type: ColumnType;
  options: string[];
  relationTargetPageId: string;
  rollupRelationColId: string;
  rollupTargetColId: string;
  rollupFn: RollupFunction;
  formulaExpression: string;
}

function collectColumnChoices(col: DatabaseColumn | undefined, rows: DatabaseRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const pushOpt = (raw: string) => {
    const trimmed = raw.trim().slice(0, 120);
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  };
  for (const opt of col?.options ?? []) pushOpt(opt);
  if (col) {
    for (const r of rows) {
      const v = r.cells[col.id];
      if (Array.isArray(v)) {
        for (const item of v) pushOpt(String(item ?? ''));
      } else if (typeof v === 'string' && v.trim()) {
        if (col.type === 'multi_select') {
          for (const part of v.split(',')) pushOpt(part);
        } else {
          pushOpt(v);
        }
      }
      if (out.length >= 100) break;
    }
  }
  return out.slice(0, 100);
}

const ACTIONS_COL_WIDTH = 114;
const SELECTION_COL_WIDTH = 42;
const REORDER_COL_WIDTH = 76;

function getDefaultColWidth(col: DatabaseColumn, isPrimary: boolean): number {
  if (col.id === IMPRO_COL_IDS.exercices.score) return 76;
  if (col.type === 'checkbox') return 58;
  if (col.type === 'number' || col.type === 'rollup') return 96;
  if (col.type === 'date') return 126;
  if (col.type === 'select') return 132;
  if (col.type === 'multi_select') return 152;
  if (col.type === 'relation') return 196;
  if (isPrimary) return 216;
  if (col.name.toLowerCase().includes('description')) return 246;
  return 154;
}

function getDefaultDeducedColWidth(dcol: { name: string; numeric?: boolean }): number {
  if (dcol.numeric) return 118;
  if (dcol.name.toLowerCase().includes('dernière')) return 124;
  return 172;
}

function formatSortDirLabel(
  colInfo: { numeric?: boolean; type?: ColumnType } | undefined,
  dir: 'asc' | 'desc',
  compact = false
): string {
  if (colInfo?.type === 'checkbox') {
    return dir === 'asc' ? '☑ → ☐' : '☐ → ☑';
  }
  if (colInfo?.type === 'select' || colInfo?.type === 'multi_select') {
    return dir === 'asc' ? 'Ordre ↑' : 'Ordre ↓';
  }
  if (colInfo?.numeric) {
    if (compact) return dir === 'asc' ? '0→9' : '9→0';
    return dir === 'asc' ? '0 → 9' : '9 → 0';
  }
  if (compact) return dir === 'asc' ? 'A→Z' : 'Z→A';
  return dir === 'asc' ? 'A → Z' : 'Z → A';
}

export function DatabaseView({ page, embedMode = false }: DatabaseViewProps) {
  const {
    user,
    syncStatus,
    authError,
    signInGoogle,
    retryCloudSync,
    urlEmbedToken,
    exercicesEmbedToken,
    embedSnapshotActive,
    embedSyncing,
    embedLastSyncedAt,
    embedReadOnlyNotice,
    dismissEmbedReadOnlyNotice,
    ensureExercicesEmbedLink,
    syncExercicesSharedEmbedNow,
    pages,
    rowsByPage,
    selectPage,
    updatePageTitle,
    updatePageIcon,
    updateDatabaseColumns,
    updateDatabaseView,
    addDatabaseRow,
    updateDatabaseRow,
    deleteDatabaseRow,
    deleteDatabaseRows,
    openOrCreateRowPage,
    improModel,
    improDetailTarget,
    openImproDetail,
    openLiveAnimation,
    prefillSeanceFromGroup,
    databaseSorts,
    setDatabaseSorts,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
    setNotionSyncModalOpen,
    moveExerciseRank,
    stepExerciseRank,
    setExerciseScore,
    viewSettings,
    updateDatabaseViewSettings,
  } = useWorkspace();

  const dbSettings = viewSettings.databaseByPageId[page.id] ?? DEFAULT_DATABASE_VIEW_SETTINGS;
  const { filterQuery, notionSyncFilter, showAllRows } = dbSettings;
  const setFilterQuery = (val: string) =>
    updateDatabaseViewSettings(page.id, { filterQuery: val });
  const setNotionSyncFilter = (val: 'all' | 'synced' | 'pending') =>
    updateDatabaseViewSettings(page.id, { notionSyncFilter: val });
  const setShowAllRows = (val: boolean) =>
    updateDatabaseViewSettings(page.id, { showAllRows: val });

  const [showSortPanel, setShowSortPanel] = useState(false);
  const [editingChoicesColId, setEditingChoicesColId] = useState<string | null>(null);
  const [colPanel, setColPanel] = useState<ColumnFormState | null>(null);
  const [confirmRemoveCol, setConfirmRemoveCol] = useState(false);
  const [activeCellEditor, setActiveCellEditor] = useState<{ rowId: string; colId: string } | null>(
    null
  );
  const [relationQuery, setRelationQuery] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [draftSnapshots, setDraftSnapshots] = useState<Map<string, Record<string, CellValue>>>(
    () => new Map()
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const lastSelectedRowIdRef = useRef<string | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [resizingCol, setResizingCol] = useState<{
    colId: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const isImproPage = isImproDatabasePage(page.id) && improModel.ready;
  const defaultSortRules: DatabaseSortRule[] = databaseSorts[page.id] ?? [];
  const [embedSortOverride, setEmbedSortOverride] = useState<DatabaseSortRule[] | null>(null);
  const sortRules: DatabaseSortRule[] =
    embedMode && embedSortOverride !== null ? embedSortOverride : defaultSortRules;
  const hasEmbedSortOverride = embedMode && embedSortOverride !== null;
  const [highlightedScoreRowId, setHighlightedScoreRowId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());
  const [editingNameRowId, setEditingNameRowId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState('');
  const [showEmbedPanel, setShowEmbedPanel] = useState(false);
  const [embedCopiedKind, setEmbedCopiedKind] = useState<'url' | 'iframe' | null>(null);
  const [embedPanelError, setEmbedPanelError] = useState<string | null>(null);
  const embedCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const triggerScoreHighlight = (rowId: string) => {
    setHighlightedScoreRowId(rowId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedScoreRowId((cur) => (cur === rowId ? null : cur));
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (embedCopyTimerRef.current) clearTimeout(embedCopyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setActiveCellEditor(null);
    setShowSortPanel(false);
    setEditingChoicesColId(null);
    setResizingCol(null);
    setShowIconPicker(false);
    setDraftSnapshots(new Map());
    setSelectionMode(false);
    setSelectedRowIds(new Set());
    setConfirmBulkDelete(false);
    setDeletingBulk(false);
    setExpandedRowIds(new Set());
    setEditingNameRowId(null);
    setShowEmbedPanel(false);
    setEmbedCopiedKind(null);
    setEmbedPanelError(null);
    setEmbedSortOverride(null);
    lastSelectedRowIdRef.current = null;
  }, [page.id]);

  useEffect(() => {
    if (!resizingCol) return;
    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - resizingCol.startX;
      const nextWidth = Math.max(resizingCol.minWidth, Math.min(640, resizingCol.startWidth + delta));
      setColumnWidth(page.id, resizingCol.colId, nextWidth);
    };
    const onPointerUp = () => setResizingCol(null);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [resizingCol, page.id, setColumnWidth]);

  const startColumnResize = (
    e: ReactPointerEvent<HTMLDivElement>,
    colId: string,
    fallbackWidth: number,
    minWidth: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const thWidth = e.currentTarget.closest('th')?.getBoundingClientRect().width;
    const startWidth = thWidth && thWidth > 0 ? Math.round(thWidth) : fallbackWidth;
    setResizingCol({ colId, startX: e.clientX, startWidth, minWidth });
  };

  const columns: DatabaseColumn[] = useMemo(
    () =>
      page.columns && page.columns.length > 0
        ? page.columns
        : [{ id: 'col_titre', name: 'Nom', type: 'text' }],
    [page.columns]
  );

  const rows: DatabaseRow[] = rowsByPage[page.id] ?? [];
  const activeView: DatabaseViewType = page.activeView ?? 'table';
  const effectiveView: DatabaseViewType = embedMode ? 'table' : activeView;

  const isBiblimproPage = page.id === IMPRO_DB_IDS.exercices;
  const canReorderRows = isBiblimproPage && effectiveView === 'table';
  const scoreSortDir = getActiveScoreSortDir(sortRules);

  const activeEmbedToken = user ? (exercicesEmbedToken ?? urlEmbedToken) : urlEmbedToken;
  const embedUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? buildExercicesEmbedUrl(window.location.href, activeEmbedToken)
        : '?embed=exercices',
    [activeEmbedToken]
  );
  const mainAppUrl = useMemo(
    () => (typeof window !== 'undefined' ? buildMainAppUrlFromEmbed(window.location.href) : '/'),
    []
  );
  const embedIframeCode = useMemo(
    () => buildExercicesEmbedIframeCode(embedUrl, page.title || 'Exercices — Biblimpro'),
    [embedUrl, page.title]
  );

  useEffect(() => {
    if (!showEmbedPanel || page.id !== IMPRO_DB_IDS.exercices || !user) return;
    if (exercicesEmbedToken && embedLastSyncedAt) return;
    let cancelled = false;
    setEmbedPanelError(null);
    void ensureExercicesEmbedLink().catch((err) => {
      if (cancelled) return;
      setEmbedPanelError(
        err instanceof Error ? err.message : 'Impossible de synchroniser le lien embed.'
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    showEmbedPanel,
    page.id,
    user,
    exercicesEmbedToken,
    embedLastSyncedAt,
    ensureExercicesEmbedLink,
  ]);

  const handleCopyEmbed = async (kind: 'url' | 'iframe') => {
    const ok = await copyTextToClipboard(kind === 'url' ? embedUrl : embedIframeCode);
    if (!ok) return;
    setEmbedCopiedKind(kind);
    if (embedCopyTimerRef.current) clearTimeout(embedCopyTimerRef.current);
    embedCopyTimerRef.current = setTimeout(() => {
      setEmbedCopiedKind((cur) => (cur === kind ? null : cur));
    }, 2000);
  };
  const biblimproSyncedCount = useMemo(
    () => (isBiblimproPage ? rows.filter((r) => Boolean(r.notionSyncedAt)).length : 0),
    [isBiblimproPage, rows]
  );
  const biblimproPendingCount = isBiblimproPage ? Math.max(0, rows.length - biblimproSyncedCount) : 0;

  const effectiveFilterQuery = embedMode ? '' : filterQuery;
  const effectiveNotionSyncFilter = embedMode ? 'all' : notionSyncFilter;

  const effectiveRows = useMemo(() => {
    if (!isBiblimproPage || effectiveNotionSyncFilter === 'all') return rows;
    return rows.filter((r) =>
      effectiveNotionSyncFilter === 'synced' ? Boolean(r.notionSyncedAt) : !r.notionSyncedAt
    );
  }, [isBiblimproPage, effectiveNotionSyncFilter, rows]);

  const databasePages = useMemo(
    () => pages.filter((p) => p.type === 'database' && !p.isTrashed),
    [pages]
  );

  const computedByRowId = useMemo(() => {
    const map = new Map<string, { cells: Record<string, CellValue>; errors: Record<string, string> }>();
    for (const row of rows) {
      map.set(row.id, getComputedRowCells(page, row, pages, rowsByPage));
    }
    return map;
  }, [rows, page, pages, rowsByPage]);

  const computedCellsMap = useMemo(() => {
    const map = new Map<string, Record<string, CellValue>>();
    for (const [id, entry] of computedByRowId.entries()) map.set(id, entry.cells);
    return map;
  }, [computedByRowId]);

  interface DeducedColumn extends SortableDeducedColumn {
    mono?: boolean;
    renderNode?: (row: DatabaseRow, isExpanded: boolean) => ReactNode;
  }

  const deducedColumns: DeducedColumn[] = useMemo(() => {
    if (!isImproPage) return [];
    if (page.id === IMPRO_DB_IDS.exercices) {
      return [
        {
          id: 'ded_ex_grps',
          name: 'Groupes (déduits)',
          render: (r) => improModel.exerciseById.get(r.id)?.groupNames.join(', ') || '—',
          renderNode: (r, isExpanded) => {
            const ex = improModel.exerciseById.get(r.id);
            if (!ex || ex.groupIds.length === 0) return '—';
            if (!isExpanded) {
              const firstGid = ex.groupIds[0];
              const firstName = improModel.groupById.get(firstGid)?.nom ?? firstGid;
              return (
                <div className="flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden h-6 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, firstGid)}
                    className="text-xs text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate min-w-0"
                  >
                    {firstName}
                  </button>
                  {ex.groupIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleRowExpanded(r.id)}
                      title="Déplier pour voir tous les groupes"
                      className="font-mono tabular-nums text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      +{ex.groupIds.length - 1}
                    </button>
                  )}
                </div>
              );
            }
            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {ex.groupIds.map((gid) => {
                  const name = improModel.groupById.get(gid)?.nom ?? gid;
                  return (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                      className="text-xs text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            );
          },
        },
        {
          id: 'ded_ex_pars',
          name: 'Participants (déduits)',
          numeric: true,
          mono: true,
          sortValue: (r) => {
            const count = improModel.exerciseById.get(r.id)?.participantNames.length ?? 0;
            return count > 0 ? count : '';
          },
          render: (r) => {
            const ex = improModel.exerciseById.get(r.id);
            if (!ex || ex.participantNames.length === 0) return '—';
            const preview = ex.participantNames.slice(0, 3).join(', ');
            return ex.participantNames.length > 3
              ? `${ex.participantNames.length} (${preview}…)`
              : `${ex.participantNames.length} (${preview})`;
          },
          renderNode: (r, isExpanded) => {
            const ex = improModel.exerciseById.get(r.id);
            if (!ex || ex.participantIds.length === 0) return '—';
            if (!isExpanded) {
              const firstPid = ex.participantIds[0];
              const firstLabel = improModel.participantById.get(firstPid)?.displayLabel ?? firstPid;
              return (
                <div className="flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden h-6 whitespace-nowrap font-sans">
                  <span className="font-mono tabular-nums text-slate-500 shrink-0">
                    {ex.participantIds.length}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700 shrink-0" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.participants, firstPid)}
                    className="text-xs text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate min-w-0"
                  >
                    {firstLabel}
                  </button>
                  {ex.participantIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleRowExpanded(r.id)}
                      title="Déplier pour voir les participants"
                      className="font-mono tabular-nums text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      +{ex.participantIds.length - 1}
                    </button>
                  )}
                </div>
              );
            }
            const shownIds = ex.participantIds.slice(0, 12);
            const remaining = ex.participantIds.length - shownIds.length;
            return (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-sans">
                <span className="font-mono tabular-nums text-slate-500">
                  {ex.participantIds.length}
                </span>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                  ·
                </span>
                {shownIds.map((pid, idx) => {
                  const label = improModel.participantById.get(pid)?.displayLabel ?? pid;
                  return (
                    <span key={pid} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                        className="text-xs text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                      >
                        {label}
                      </button>
                      {idx < shownIds.length - 1 && (
                        <span className="text-slate-400" aria-hidden="true">
                          ,
                        </span>
                      )}
                    </span>
                  );
                })}
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, r.id)}
                    className="font-mono tabular-nums text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                    title="Voir tous les participants sur la fiche"
                  >
                    +{remaining}
                  </button>
                )}
              </div>
            );
          },
        },
        {
          id: 'ded_ex_last',
          name: 'Dernière fois',
          mono: true,
          sortValue: (r) => improModel.exerciseById.get(r.id)?.lastDate || '',
          render: (r) => improModel.exerciseById.get(r.id)?.lastDate || '—',
        },
        {
          id: 'ded_ex_notion_sync',
          name: 'Synchro Notion',
          mono: true,
          sortValue: (r) => r.notionSyncedAt || '',
          render: (r) => {
            if (!r.notionSyncedAt) return 'En attente';
            try {
              return new Date(r.notionSyncedAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
              });
            } catch {
              return r.notionSyncedAt.slice(0, 10);
            }
          },
          renderNode: (r) => {
            if (!r.notionSyncedAt) {
              return <span className="text-slate-400 dark:text-slate-500">En attente</span>;
            }
            let dateLabel = r.notionSyncedAt.slice(0, 10);
            try {
              dateLabel = new Date(r.notionSyncedAt).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
              });
            } catch {
              // keep ISO date prefix
            }
            return (
              <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                ✓ {dateLabel}
              </span>
            );
          },
        },
      ];
    }
    if (page.id === IMPRO_DB_IDS.participants) {
      return [
        {
          id: 'ded_pa_done',
          name: 'Faits',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.participantById.get(r.id)?.doneExercises.length ?? 0,
          render: (r) => String(improModel.participantById.get(r.id)?.doneExercises.length ?? 0),
        },
        {
          id: 'ded_pa_never',
          name: 'Jamais faits',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.participantById.get(r.id)?.neverDoneExercises.length ?? 0,
          render: (r) =>
            String(improModel.participantById.get(r.id)?.neverDoneExercises.length ?? 0),
        },
      ];
    }
    if (page.id === IMPRO_DB_IDS.groupes) {
      return [
        {
          id: 'ded_gr_exos',
          name: 'Exercices pratiqués',
          numeric: true,
          mono: true,
          sortValue: (r) => improModel.groupById.get(r.id)?.practicedExercises.length ?? 0,
          render: (r) => String(improModel.groupById.get(r.id)?.practicedExercises.length ?? 0),
        },
        {
          id: 'ded_gr_last',
          name: 'Dernière séance',
          mono: true,
          sortValue: (r) => improModel.groupById.get(r.id)?.lastDate || '',
          render: (r) => improModel.groupById.get(r.id)?.lastDate || '—',
        },
      ];
    }
    return [];
  }, [isImproPage, page.id, improModel, openImproDetail]);

  const sortableColumns = useMemo(
    () => [
      ...columns.map((c) => ({
        id: c.id,
        name: c.name,
        numeric: c.type === 'number' || c.type === 'rollup',
        type: c.type as ColumnType | undefined,
      })),
      ...deducedColumns.map((d) => ({
        id: d.id,
        name: d.name,
        numeric: Boolean(d.numeric),
        type: undefined as ColumnType | undefined,
      })),
    ],
    [columns, deducedColumns]
  );

  const primaryCol = getPrimaryColumn(columns) ?? columns[0];
  const groupCol = columns.find((c) => c.type === 'select') ?? null;

  const pageCustomWidths = columnWidths[page.id] ?? {};
  const hasCustomWidths = Object.keys(pageCustomWidths).length > 0;
  const hasCustomPrimaryWidth = Boolean(primaryCol && pageCustomWidths[primaryCol.id]);
  const getColWidth = (col: DatabaseColumn) =>
    pageCustomWidths[col.id] ?? getDefaultColWidth(col, col.id === primaryCol?.id);
  const getDeducedWidth = (dcol: DeducedColumn) =>
    pageCustomWidths[dcol.id] ?? getDefaultDeducedColWidth(dcol);

  const orderedDisplayIds = useMemo(() => {
    const defaultIds = [...columns.map((c) => c.id), ...deducedColumns.map((d) => d.id)];
    const saved = tableColumnOrders[page.id];
    if (!saved || saved.length === 0) return defaultIds;
    const merged = mergeColumnOrder(defaultIds, saved);
    return syncNativeOrderInMixedList(merged, columns);
  }, [columns, deducedColumns, tableColumnOrders, page.id]);

  const displayColumns = useMemo(() => {
    const nativeMap = new Map(columns.map((c) => [c.id, c]));
    const dedMap = new Map(deducedColumns.map((d) => [d.id, d]));
    const items: Array<
      | { kind: 'native'; id: string; col: DatabaseColumn }
      | { kind: 'deduced'; id: string; dcol: DeducedColumn }
    > = [];
    for (const id of orderedDisplayIds) {
      const nc = nativeMap.get(id);
      if (nc) items.push({ kind: 'native', id, col: nc });
      else {
        const dc = dedMap.get(id);
        if (dc) items.push({ kind: 'deduced', id, dcol: dc });
      }
    }
    return items;
  }, [orderedDisplayIds, columns, deducedColumns]);

  const { dragColId, dropIndicator, getThDropProps, getDragHandleProps } = useColumnDrag(
    (sourceId, targetId, position) => {
      const nextIds = reorderIds(orderedDisplayIds, sourceId, targetId, position);
      if (nextIds === orderedDisplayIds) return;
      setTableColumnOrder(page.id, nextIds);
      const nextNative = extractReorderedNativeColumns(nextIds, columns);
      const nativeChanged = nextNative.some((c, i) => c.id !== columns[i]?.id);
      if (nativeChanged) updateDatabaseColumns(page.id, nextNative);
    }
  );

  const { dragRowId, rowDropIndicator, getTrDropProps, getRowDragHandleProps } = useRowDrag(
    (sourceId, targetId, position) => {
      if (!isBiblimproPage) return;
      moveExerciseRank(sourceId, targetId, position, { scoreSortDir });
      triggerScoreHighlight(sourceId);
    }
  );

  const totalTableWidth = useMemo(() => {
    const colsSum = columns.reduce((acc, col) => acc + getColWidth(col), 0);
    const deducedSum = deducedColumns.reduce((acc, dc) => acc + getDeducedWidth(dc), 0);
    return (
      (selectionMode ? SELECTION_COL_WIDTH : 0) +
      (canReorderRows ? REORDER_COL_WIDTH : 0) +
      colsSum +
      deducedSum +
      ACTIONS_COL_WIDTH
    );
  }, [columns, deducedColumns, pageCustomWidths, selectionMode, canReorderRows]);

  const activeDetailRowId =
    improDetailTarget?.pageId === page.id ? improDetailTarget.rowId : null;

  const { filteredRows, visibleRows, untouchedDraftIds } = useMemo(
    () =>
      orderAndFilterDatabaseRows({
        rows: effectiveRows,
        draftSnapshots,
        filterQuery: effectiveFilterQuery,
        sortRules,
        columns,
        deducedColumns,
        computedCellsMap,
        pages,
        rowsByPage,
        activeRowId: activeDetailRowId,
        showAllRows,
      }),
    [
      effectiveRows,
      draftSnapshots,
      effectiveFilterQuery,
      sortRules,
      columns,
      deducedColumns,
      computedCellsMap,
      pages,
      rowsByPage,
      activeDetailRowId,
      showAllRows,
    ]
  );

  useEffect(() => {
    if (selectedRowIds.size === 0) return;
    const existingIds = new Set(rows.map((r) => r.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedRowIds) {
      if (existingIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) {
      setSelectedRowIds(next);
      if (next.size === 0) setConfirmBulkDelete(false);
    }
  }, [rows, selectedRowIds]);

  const visibleRowIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const selectedVisibleCount = useMemo(
    () => visibleRowIds.reduce((acc, id) => acc + (selectedRowIds.has(id) ? 1 : 0), 0),
    [visibleRowIds, selectedRowIds]
  );
  const allVisibleSelected =
    visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = selectionMode && someVisibleSelected;
    }
  }, [selectionMode, someVisibleSelected]);

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedRowIds(new Set());
        setConfirmBulkDelete(false);
        lastSelectedRowIdRef.current = null;
      }
      return !prev;
    });
  };

  const toggleRowSelection = (rowId: string, shiftKey: boolean) => {
    const targetChecked = !selectedRowIds.has(rowId);
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      const anchor = lastSelectedRowIdRef.current;
      if (shiftKey && anchor && anchor !== rowId) {
        const startIdx = visibleRowIds.indexOf(anchor);
        const endIdx = visibleRowIds.indexOf(rowId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = lo; i <= hi; i++) {
            const id = visibleRowIds[i];
            if (targetChecked) next.add(id);
            else next.delete(id);
          }
          return next;
        }
      }
      if (targetChecked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
    lastSelectedRowIdRef.current = rowId;
    if (!targetChecked) setConfirmBulkDelete(false);
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleRowIds) next.delete(id);
      } else {
        for (const id of visibleRowIds) next.add(id);
      }
      return next;
    });
    setConfirmBulkDelete(false);
  };

  const handleConfirmBulkDelete = async () => {
    if (deletingBulk || selectedRowIds.size === 0) return;
    setDeletingBulk(true);
    try {
      await deleteDatabaseRows(page.id, Array.from(selectedRowIds));
      setSelectedRowIds(new Set());
      setConfirmBulkDelete(false);
      setSelectionMode(false);
      lastSelectedRowIdRef.current = null;
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleCreateRow = async (extraCells: Record<string, CellValue> = {}) => {
    const snapshot = buildInitialRowCells(columns, extraCells);
    const createdId = await addDatabaseRow(page.id, extraCells, { insertAt: 'top' });
    if (!createdId) return;
    setDraftSnapshots((prev) => {
      const next = new Map(prev);
      next.set(createdId, snapshot);
      return next;
    });
    openImproDetail(page.id, createdId, true);
    tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateSortRules = (next: DatabaseSortRule[]) => {
    const clamped = next.slice(0, 30);
    if (embedMode) {
      setEmbedSortOverride(clamped);
      return;
    }
    setDatabaseSorts(page.id, clamped);
  };

  const addSortRule = (preferredColId?: string) => {
    const used = new Set(sortRules.map((r) => r.colId));
    const targetId =
      preferredColId && !used.has(preferredColId)
        ? preferredColId
        : (sortableColumns.find((c) => !used.has(c.id))?.id ?? sortableColumns[0]?.id);
    if (!targetId) return;
    updateSortRules([...sortRules, { colId: targetId, dir: 'asc' }]);
    setShowSortPanel(true);
  };

  const toggleHeaderSort = (colId: string) => {
    const idx = sortRules.findIndex((r) => r.colId === colId);
    if (idx === -1) {
      updateSortRules([...sortRules, { colId, dir: 'asc' }]);
      return;
    }
    const cur = sortRules[idx];
    if (cur.dir === 'asc') {
      updateSortRules(sortRules.map((r, i) => (i === idx ? { ...r, dir: 'desc' } : r)));
    } else {
      updateSortRules(sortRules.filter((_, i) => i !== idx));
    }
  };

  const moveSortRule = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortRules.length) return;
    const next = [...sortRules];
    [next[index], next[target]] = [next[target], next[index]];
    updateSortRules(next);
  };

  const getRelationRowLabel = (
    targetDbId: string | undefined,
    targetRow: DatabaseRow | undefined,
    targetPrimaryColId: string | undefined,
    fallbackId: string
  ): string => {
    if (targetDbId === IMPRO_DB_IDS.participants && improModel.ready) {
      return improModel.participantById.get(fallbackId)?.displayLabel ?? fallbackId;
    }
    if (targetRow && targetPrimaryColId) {
      return String(targetRow.cells[targetPrimaryColId] ?? fallbackId);
    }
    return fallbackId;
  };

  const openNewColPanel = () => {
    const firstRel = columns.find((c) => c.type === 'relation');
    const firstOtherDb = databasePages.find((d) => d.id !== page.id) ?? databasePages[0];
    setConfirmRemoveCol(false);
    setColPanel({
      editingId: null,
      name: '',
      type: 'text',
      options: ['À faire', 'En cours', 'Terminé'],
      relationTargetPageId: firstOtherDb?.id ?? '',
      rollupRelationColId: firstRel?.id ?? '',
      rollupTargetColId: '',
      rollupFn: 'count',
      formulaExpression: '',
    });
  };

  const openEditColPanel = (col: DatabaseColumn) => {
    const firstRel = columns.find((c) => c.type === 'relation');
    const firstOtherDb = databasePages.find((d) => d.id !== page.id) ?? databasePages[0];
    setConfirmRemoveCol(false);
    setColPanel({
      editingId: col.id,
      name: col.name,
      type: col.type,
      options: collectColumnChoices(col, rows),
      relationTargetPageId: col.relationTargetPageId ?? firstOtherDb?.id ?? '',
      rollupRelationColId: col.rollupRelationColId ?? firstRel?.id ?? '',
      rollupTargetColId: col.rollupTargetColId ?? '',
      rollupFn: col.rollupFn ?? 'count',
      formulaExpression: col.formulaExpression ?? '',
    });
  };

  const saveColPanel = () => {
    if (!colPanel) return;
    const trimmedName = colPanel.name.trim().slice(0, 80);
    if (!trimmedName) return;

    const cleanOptions = Array.from(
      new Set(colPanel.options.map((o) => o.trim()).filter(Boolean))
    ).slice(0, 100);

    const built: DatabaseColumn = {
      id: colPanel.editingId ?? generateId('col'),
      name: trimmedName,
      type: colPanel.type,
      ...(colPanel.type === 'select' || colPanel.type === 'multi_select'
        ? {
            options:
              cleanOptions.length > 0 ? cleanOptions : ['À faire', 'En cours', 'Terminé'],
          }
        : {}),
      ...(colPanel.type === 'relation'
        ? { relationTargetPageId: colPanel.relationTargetPageId }
        : {}),
      ...(colPanel.type === 'rollup'
        ? {
            rollupRelationColId: colPanel.rollupRelationColId,
            rollupTargetColId: colPanel.rollupTargetColId,
            rollupFn: colPanel.rollupFn,
          }
        : {}),
      ...(colPanel.type === 'formula'
        ? { formulaExpression: colPanel.formulaExpression }
        : {}),
    };

    if (colPanel.editingId) {
      updateDatabaseColumns(
        page.id,
        columns.map((c) => (c.id === colPanel.editingId ? built : c))
      );
    } else {
      updateDatabaseColumns(page.id, [...columns, built]);
    }
    setColPanel(null);
  };

  const removeColumn = (colId: string) => {
    if (columns.length <= 1) return;
    updateDatabaseColumns(
      page.id,
      columns.filter((c) => c.id !== colId)
    );
    setColPanel(null);
    setConfirmRemoveCol(false);
  };

  const updateCell = (row: DatabaseRow, colId: string, val: CellValue) => {
    updateDatabaseRow(page.id, row.id, {
      ...row.cells,
      [colId]: val,
    });
  };

  const duplicateRow = async (row: DatabaseRow) => {
    const clonedCells: Record<string, CellValue> = { ...row.cells };
    if (primaryCol && typeof clonedCells[primaryCol.id] === 'string') {
      clonedCells[primaryCol.id] = `${clonedCells[primaryCol.id]} (copie)`;
    }
    const createdId = await addDatabaseRow(page.id, clonedCells, { insertAt: 'top' });
    if (createdId) {
      openImproDetail(page.id, createdId, true);
    }
  };

  const navigateRelationRow = (
    targetDbId: string,
    targetRow: DatabaseRow | undefined,
    fallbackTargetId?: string
  ) => {
    if (targetRow) {
      openImproDetail(targetDbId, targetRow.id);
      return;
    }
    if (fallbackTargetId) {
      openImproDetail(targetDbId, fallbackTargetId);
      return;
    }
    selectPage(targetDbId);
  };

  const rollupRelCol = colPanel
    ? columns.find((c) => c.id === colPanel.rollupRelationColId)
    : null;
  const rollupTargetDb = rollupRelCol?.relationTargetPageId
    ? pages.find((p) => p.id === rollupRelCol.relationTargetPageId && !p.isTrashed)
    : null;

  const formulaPreview = useMemo(() => {
    if (!colPanel || colPanel.type !== 'formula' || !colPanel.formulaExpression.trim()) return null;
    const firstRow = rows[0];
    if (!firstRow) return null;
    const previewCol: DatabaseColumn = {
      id: '__preview__',
      name: colPanel.name || 'Aperçu',
      type: 'formula',
      formulaExpression: colPanel.formulaExpression,
    };
    const previewPage: WorkspacePage = { ...page, columns: [...columns, previewCol] };
    const { cells, errors } = getComputedRowCells(previewPage, firstRow, pages, rowsByPage);
    return {
      text: formatCellText(previewCol, cells.__preview__, pages, rowsByPage),
      error: errors.__preview__,
    };
  }, [colPanel, rows, page, columns, pages, rowsByPage]);

  const kanbanGroups = useMemo(() => {
    if (!groupCol) return [];
    const options =
      groupCol.options && groupCol.options.length > 0 ? groupCol.options : ['À faire', 'En cours', 'Terminé'];
    const buckets = new Map<string, DatabaseRow[]>();
    for (const opt of options) buckets.set(opt, []);
    for (const row of visibleRows) {
      const val = String(row.cells[groupCol.id] || options[0] || '');
      const list = buckets.get(val);
      if (list) list.push(row);
      else buckets.set(val, [row]);
    }
    return Array.from(buckets.entries());
  }, [groupCol, visibleRows]);

  const startEditingName = (row: DatabaseRow) => {
    setEditingNameRowId(row.id);
    setEditingNameDraft(String(row.cells[primaryCol.id] ?? ''));
  };

  const commitEditingName = (row: DatabaseRow) => {
    if (editingNameRowId !== row.id) return;
    const prevVal = String(row.cells[primaryCol.id] ?? '');
    if (editingNameDraft !== prevVal) {
      updateCell(row, primaryCol.id, editingNameDraft);
    }
    setEditingNameRowId(null);
  };

  const renderCell = (row: DatabaseRow, col: DatabaseColumn, isRowExpanded: boolean) => {
    const computed = computedByRowId.get(row.id);
    const val = (computed?.cells ?? row.cells)[col.id];
    const formulaErr = computed?.errors[col.id];
    const isEditorOpen =
      activeCellEditor?.rowId === row.id && activeCellEditor?.colId === col.id;

    if (col.type === 'formula' || col.type === 'rollup') {
      if (formulaErr) {
        return <span className="text-xs text-red-600 dark:text-red-400 truncate block">{formulaErr}</span>;
      }
      const formatted = formatCellText(col, val, pages, rowsByPage);
      const isNum = typeof val === 'number' || typeof val === 'boolean';
      return (
        <span
          className={`text-sm block leading-6 ${
            isRowExpanded ? 'whitespace-normal break-words' : 'truncate'
          } ${isNum ? 'font-mono tabular-nums' : ''} text-slate-700 dark:text-slate-300`}
        >
          {formatted || '—'}
        </span>
      );
    }

    if (col.type === 'relation') {
      const targetDbId = col.relationTargetPageId;
      const anyTargetDb = targetDbId ? pages.find((p) => p.id === targetDbId) : null;
      const targetDb = anyTargetDb && !anyTargetDb.isTrashed ? anyTargetDb : null;
      const targetRows = targetDbId ? rowsByPage[targetDbId] ?? [] : [];
      const targetPrimaryColId = anyTargetDb?.columns?.[0]?.id;
      const targetRowMap = new Map(targetRows.map((r) => [r.id, r]));
      const selectedIds = Array.isArray(val)
        ? val
        : typeof val === 'string' && val
          ? [val]
          : [];
      const isSeanceParticipantCol =
        page.id === IMPRO_DB_IDS.seances && col.id === IMPRO_COL_IDS.seances.participants;
      const rawSeanceGroupe = row.cells[IMPRO_COL_IDS.seances.groupe];
      const seanceGroupeIds = Array.isArray(rawSeanceGroupe) ? rawSeanceGroupe : [];
      const rq = isEditorOpen ? relationQuery.trim().toLowerCase() : '';
      const filteredTargetRows = isEditorOpen
        ? targetRows.filter((tr) => {
            if (!rq) return true;
            const lbl = getRelationRowLabel(targetDbId, tr, targetPrimaryColId, tr.id);
            return lbl.toLowerCase().includes(rq);
          })
        : [];

      const shownIds = isRowExpanded ? selectedIds : selectedIds.slice(0, 1);
      const hiddenCount = selectedIds.length - shownIds.length;

      return (
        <div className={isRowExpanded ? 'space-y-1.5 min-w-0' : 'min-w-0'}>
          <div
            className={
              isRowExpanded
                ? 'flex flex-wrap items-center gap-1.5'
                : 'flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden h-6'
            }
          >
            {shownIds.map((tid) => {
              const targetRow = targetRowMap.get(tid);
              const label = getRelationRowLabel(targetDbId, targetRow, targetPrimaryColId, tid);
              return anyTargetDb ? (
                <span
                  key={tid}
                  className={`inline-flex items-stretch rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-xs overflow-hidden ${
                    isRowExpanded ? 'max-w-[168px]' : 'min-w-0 max-w-[132px]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => navigateRelationRow(anyTargetDb.id, targetRow, tid)}
                    title={`Ouvrir la fiche : ${label}`}
                    className="px-1.5 py-0.5 text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
                  >
                    {label}
                  </button>
                  {isRowExpanded && (
                    <button
                      type="button"
                      onClick={() =>
                        updateCell(
                          row,
                          col.id,
                          selectedIds.filter((id) => id !== tid)
                        )
                      }
                      aria-label={`Retirer ${label}`}
                      title={`Retirer ${label}`}
                      className="px-1 border-l border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center justify-center shrink-0"
                    >
                      <Minus className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ) : (
                <span key={tid} className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {label}
                </span>
              );
            })}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => toggleRowExpanded(row.id)}
                title="Déplier pour voir toutes les relations"
                className="text-xs font-mono tabular-nums text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
              >
                +{hiddenCount}
              </button>
            )}
            {targetDb && (
              <button
                type="button"
                onClick={() => {
                  setRelationQuery('');
                  setActiveCellEditor(isEditorOpen ? null : { rowId: row.id, colId: col.id });
                }}
                aria-label={`Lier ${col.name}`}
                className="px-1.5 py-0.5 rounded text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                {isEditorOpen ? 'OK' : '+'}
              </button>
            )}
            {isSeanceParticipantCol && seanceGroupeIds.length > 0 && isRowExpanded && (
              <button
                type="button"
                onClick={() => prefillSeanceFromGroup(row.id, 'merge')}
                className="px-1.5 py-0.5 rounded text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 whitespace-nowrap"
              >
                Pré-remplir
              </button>
            )}
          </div>

          {isEditorOpen && targetDb && (
            <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-1.5 min-w-[230px] shadow-sm">
              {targetRows.length > 8 && (
                <input
                  type="text"
                  value={relationQuery}
                  onChange={(e) => setRelationQuery(e.target.value)}
                  placeholder="Filtrer..."
                  className="w-full h-7 px-2 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs focus:outline-none focus:border-indigo-500"
                />
              )}
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredTargetRows.length === 0 ? (
                  <div className="text-xs text-slate-400 py-1 px-1">Aucune ligne cible</div>
                ) : (
                  filteredTargetRows.slice(0, 100).map((tr) => {
                    const checked = selectedIds.includes(tr.id);
                    const tLabel = getRelationRowLabel(targetDbId, tr, targetPrimaryColId, tr.id);
                    return (
                      <RelationActionRow
                        key={tr.id}
                        compact
                        label={tLabel || 'Sans titre'}
                        isLinked={checked}
                        onOpen={() => navigateRelationRow(targetDb.id, tr)}
                        onAdd={() => {
                          if (!checked) updateCell(row, col.id, [...selectedIds, tr.id]);
                        }}
                        onRemove={() => {
                          if (checked) {
                            updateCell(
                              row,
                              col.id,
                              selectedIds.filter((id) => id !== tr.id)
                            );
                          }
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'multi_select') {
      const rawTags = Array.isArray(val)
        ? val
        : typeof val === 'string' && val
          ? val.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const optionIndex = new Map((col.options ?? []).map((opt, idx) => [opt, idx]));
      const selectedTags = [...rawTags].sort((a, b) => {
        const ra = optionIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const rb = optionIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      const availableOptions = Array.from(new Set([...(col.options ?? []), ...selectedTags]));
      return (
        <div className={isRowExpanded ? 'space-y-1.5 min-w-0' : 'min-w-0'}>
          <div
            className={
              isRowExpanded
                ? 'flex flex-wrap items-center gap-1.5'
                : 'flex flex-nowrap items-center gap-1 min-w-0 overflow-hidden h-6'
            }
          >
            {selectedTags.length > 0 && (
              <span
                className={`text-xs text-slate-700 dark:text-slate-300 ${
                  isRowExpanded ? 'whitespace-normal break-words leading-relaxed' : 'truncate min-w-0 flex-1'
                }`}
              >
                {selectedTags.join(' · ')}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setNewTagInput('');
                setActiveCellEditor(isEditorOpen ? null : { rowId: row.id, colId: col.id });
              }}
              aria-label={`Modifier ${col.name}`}
              className="px-1.5 py-0.5 rounded text-xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              {isEditorOpen ? 'OK' : '+'}
            </button>
          </div>
          {isEditorOpen && (
            <div className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 space-y-1.5 shadow-sm">
              {availableOptions.map((opt) => {
                const checked = selectedTags.includes(opt);
                return (
                  <label
                    key={opt}
                    className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const nextTags = checked
                          ? selectedTags.filter((t) => t !== opt)
                          : [...selectedTags, opt];
                        updateCell(row, col.id, nextTags);
                      }}
                      className="w-3.5 h-3.5 rounded accent-indigo-600"
                    />
                    <span className="truncate">{opt}</span>
                  </label>
                );
              })}
              <div className="flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      e.preventDefault();
                      const added = newTagInput.trim().slice(0, 60);
                      const nextTags = Array.from(new Set([...selectedTags, added]));
                      updateCell(row, col.id, nextTags);
                      if (!(col.options ?? []).includes(added)) {
                        updateDatabaseColumns(
                          page.id,
                          columns.map((c) =>
                            c.id === col.id
                              ? { ...c, options: [...(c.options ?? []), added].slice(0, 100) }
                              : c
                          )
                        );
                      }
                      setNewTagInput('');
                    }
                  }}
                  placeholder="Nouvelle option..."
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-transparent border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(val)}
          onChange={(e) => updateCell(row, col.id, e.target.checked)}
          aria-label={`${col.name} pour ${String(row.cells[primaryCol.id] || 'ligne')}`}
          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600 cursor-pointer"
        />
      );
    }

    if (col.type === 'select') {
      const currentVal = String(val ?? '');
      const options =
        col.options && col.options.length > 0 ? col.options : ['À faire', 'En cours', 'Terminé'];
      return (
        <select
          value={currentVal}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          aria-label={col.name}
          className="w-full h-6 leading-6 bg-transparent text-sm text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
        >
          {!options.includes(currentVal) && (
            <option value={currentVal} className="bg-white dark:bg-slate-900">
              {currentVal || '—'}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt} value={opt} className="bg-white dark:bg-slate-900">
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === 'number') {
      if (isBiblimproPage && col.id === IMPRO_COL_IDS.exercices.score) {
        const rowLabel = String(row.cells[primaryCol.id] || 'exercice');
        return (
          <ScoreRankInput
            value={val}
            maxRank={Math.max(1, rows.length)}
            highlighted={highlightedScoreRowId === row.id}
            ariaLabel={`Score de classement pour ${rowLabel}`}
            onCommit={(nextRank) => {
              setExerciseScore(row.id, nextRank);
              triggerScoreHighlight(row.id);
            }}
          />
        );
      }
      return (
        <input
          type="number"
          value={val === undefined || val === '' ? '' : Number(val)}
          onChange={(e) =>
            updateCell(row, col.id, e.target.value === '' ? '' : Number(e.target.value))
          }
          aria-label={col.name}
          className="w-full h-6 leading-6 bg-transparent text-sm font-mono tabular-nums text-slate-800 dark:text-slate-200 focus:outline-none"
        />
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={String(val ?? '')}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          aria-label={col.name}
          className="w-full h-6 leading-6 bg-transparent text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 focus:outline-none"
        />
      );
    }

    const isPrimaryCell = col.id === primaryCol?.id;
    const isDescCol =
      col.id === IMPRO_COL_IDS.exercices.description ||
      col.name.toLowerCase().includes('description');
    if (isDescCol) {
      const strVal = String(val ?? '');
      if (!isRowExpanded) {
        return (
          <button
            type="button"
            onClick={() => toggleRowExpanded(row.id)}
            title={strVal.trim() ? strVal : 'Déplier la ligne pour éditer la description'}
            className="w-full h-6 text-left block text-xs leading-6 text-slate-600 dark:text-slate-400 truncate cursor-pointer hover:text-slate-900 dark:hover:text-slate-200"
          >
            {strVal.trim() ? strVal : <span className="text-slate-300 dark:text-slate-700">—</span>}
          </button>
        );
      }
      const lineCount = Math.min(10, Math.max(3, strVal.split('\n').length + 1));
      return (
        <textarea
          rows={lineCount}
          value={strVal}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          placeholder="—"
          aria-label={col.name}
          className="w-full bg-transparent text-xs leading-relaxed text-slate-700 dark:text-slate-300 focus:outline-none resize-y"
        />
      );
    }

    if (isPrimaryCell) {
      const rowLabel = String(val || 'ligne');
      if (editingNameRowId === row.id) {
        return (
          <div className="flex items-center gap-1 min-w-0 h-6">
            <input
              type="text"
              autoFocus
              value={editingNameDraft}
              onChange={(e) => setEditingNameDraft(e.target.value)}
              onBlur={() => commitEditingName(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEditingName(row);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingNameRowId(null);
                }
              }}
              placeholder="Sans titre"
              aria-label={col.name}
              className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-indigo-400 bg-white dark:bg-slate-950 text-sm font-medium text-slate-950 dark:text-slate-100 focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitEditingName(row)}
              aria-label="Valider le nom"
              className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }
      return (
        <div className={`flex ${isRowExpanded ? 'items-start' : 'items-center h-6'} gap-1 min-w-0`}>
          <button
            type="button"
            onClick={() => toggleRowExpanded(row.id)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditingName(row);
            }}
            aria-expanded={isRowExpanded}
            title={
              isRowExpanded
                ? 'Replier la ligne (double-clic pour renommer)'
                : 'Déplier la ligne (double-clic pour renommer)'
            }
            className="flex-1 min-w-0 flex items-start gap-1.5 text-left group/name cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
          >
            {isRowExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0 text-indigo-500 mt-1" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover/name:text-indigo-500 self-center transition-colors" />
            )}
            <span
              className={`text-sm font-medium text-slate-950 dark:text-slate-100 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 transition-colors ${
                isRowExpanded ? 'whitespace-normal break-words leading-snug' : 'truncate leading-6'
              }`}
            >
              {String(val ?? '').trim() ? (
                String(val)
              ) : (
                <span className="text-slate-400 dark:text-slate-500 italic font-normal">
                  Sans titre
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEditingName(row);
            }}
            aria-label={`Renommer : ${rowLabel}`}
            title="Renommer"
            className="w-6 h-6 shrink-0 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-opacity"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openImproDetail(page.id, row.id, true);
            }}
            aria-label={`Ouvrir la fiche : ${rowLabel}`}
            title="Ouvrir la fiche"
            className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    const textStr = String(val ?? '');
    if (isRowExpanded && (textStr.includes('\n') || textStr.length > 55)) {
      return (
        <textarea
          rows={Math.min(6, Math.max(2, textStr.split('\n').length + 1))}
          value={textStr}
          onChange={(e) => updateCell(row, col.id, e.target.value)}
          placeholder="—"
          aria-label={col.name}
          className="w-full bg-transparent text-sm leading-snug text-slate-700 dark:text-slate-300 focus:outline-none resize-y"
        />
      );
    }

    return (
      <input
        type="text"
        value={textStr}
        onChange={(e) => updateCell(row, col.id, e.target.value)}
        placeholder="—"
        aria-label={col.name}
        className="w-full h-6 bg-transparent text-sm leading-6 text-slate-700 dark:text-slate-300 truncate focus:outline-none"
      />
    );
  };

  const renderSortIndicator = (colId: string) => {
    const sortIdx = sortRules.findIndex((r) => r.colId === colId);
    const sortRule = sortIdx !== -1 ? sortRules[sortIdx] : null;
    if (sortRule) {
      return (
        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded font-mono text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0">
          <span>{sortIdx + 1}</span>
          <span>{sortRule.dir === 'asc' ? '↑' : '↓'}</span>
        </span>
      );
    }
    return (
      <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover/th:opacity-70 transition-opacity" />
    );
  };

  return (
    <div
      className={
        embedMode
          ? 'w-full h-full flex flex-col bg-white dark:bg-[#0B0F19]'
          : 'w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5'
      }
    >
      {!embedMode && (
        <>
          {/* En-tête base */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 relative">
              <button
                type="button"
                onClick={() => setShowIconPicker((v) => !v)}
                title="Modifier l'icône / émoji de la base"
                aria-label="Changer l'icône de la base"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 hover:scale-105 transition-all shrink-0"
              >
                {page.icon || '🗂️'}
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                <span>Base relationnelle</span>
                <span aria-hidden="true">·</span>
                <span>{rows.length} lignes</span>
                <span aria-hidden="true">·</span>
                <span>{columns.length} colonnes</span>
                {isBiblimproPage && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {biblimproSyncedCount}/{rows.length} synchro Notion
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setShowIconPicker((v) => !v)}
                  className="font-sans text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  <Smile className="w-3.5 h-3.5" />
                  <span>Modifier l’icône</span>
                </button>
              </div>

              {showIconPicker && (
                <div className="absolute left-0 top-12 z-40">
                  <EmojiPicker
                    value={page.icon}
                    maxLength={32}
                    defaultIcon="🗂️"
                    title="Icône de la base"
                    onSelect={(emoji) => updatePageIcon(page.id, emoji)}
                    onClose={() => setShowIconPicker(false)}
                  />
                </div>
              )}
            </div>
            <input
              type="text"
              value={page.title}
              onChange={(e) => updatePageTitle(page.id, e.target.value)}
              placeholder="Base sans titre"
              aria-label="Nom de la base de données"
              className="w-full bg-transparent font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white focus:outline-none"
            />
          </div>

          {/* Barre d'outils */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              {/* Sélecteur Vue Tableau / Kanban / Liste */}
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'table', label: 'Tableau', icon: Table2 },
                    { id: 'kanban', label: 'Kanban', icon: Columns3 },
                    { id: 'list', label: 'Liste', icon: LayoutList },
                  ] as const
                ).map((v) => {
                  const Icon = v.icon;
                  const active = activeView === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => updateDatabaseView(page.id, v.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-white dark:bg-slate-950 text-indigo-700 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{v.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filtrer les lignes..."
                  aria-label="Filtrer les lignes de la base"
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {isBiblimproPage && (
                <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {(
                    [
                      { id: 'all', label: 'Toutes' },
                      { id: 'synced', label: `À jour (${biblimproSyncedCount})` },
                      { id: 'pending', label: `À synchro (${biblimproPendingCount})` },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setNotionSyncFilter(opt.id)}
                      className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                        notionSyncFilter === opt.id
                          ? 'bg-white dark:bg-slate-950 text-indigo-700 dark:text-indigo-300 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSortPanel((v) => !v)}
                className={`h-9 px-3 rounded-lg border text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  sortRules.length > 0 || showSortPanel
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{sortRules.length > 0 ? `Tri (${sortRules.length})` : 'Trier'}</span>
              </button>

              {hasCustomWidths && activeView === 'table' && (
                <button
                  type="button"
                  onClick={() => resetColumnWidth(page.id)}
                  aria-label="Réinitialiser les largeurs de colonnes"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Largeurs</span>
                </button>
              )}

              <button
                type="button"
                onClick={openNewColPanel}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 flex items-center gap-1.5 whitespace-nowrap"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Colonne</span>
              </button>

              {page.id === IMPRO_DB_IDS.exercices && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowEmbedPanel((v) => !v)}
                    aria-expanded={showEmbedPanel}
                    className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                      showEmbedPanel
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Lien embed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotionSyncModalOpen(true)}
                    className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Synchroniser Notion</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={toggleSelectionMode}
                aria-pressed={selectionMode}
                className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                  selectionMode
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {selectionMode
                    ? 'Fermer sélection'
                    : isBiblimproPage
                      ? 'Supprimer des exercices'
                      : 'Supprimer des lignes'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleCreateRow()}
                className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nouvelle ligne</span>
              </button>
            </div>
          </div>

          {/* Panneau lien Embed Exercices */}
          {showEmbedPanel && page.id === IMPRO_DB_IDS.exercices && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Intégrer le tableau Exercices (Embed)
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Affiche uniquement le tableau, son tri modifiable (par défaut celui de la page Exercices) et la fiche latérale au clic. Avec votre lien synchronisé, les embeds externes (Notion, etc.) affichent automatiquement la dernière sauvegarde cloud.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={embedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ouvrir l’aperçu</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowEmbedPanel(false)}
                    className="h-8 px-2.5 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {user && syncStatus === 'synced' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <Cloud className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {embedSyncing
                        ? 'Synchronisation du lien embed avec le cloud…'
                        : exercicesEmbedToken
                          ? 'Lien synchronisé avec la dernière sauvegarde cloud'
                          : 'Préparation du lien synchronisé…'}
                      {embedLastSyncedAt && !embedSyncing && (
                        <span className="text-emerald-700/80 dark:text-emerald-400/80">
                          {' '}
                          (mis à jour à{' '}
                          {new Date(embedLastSyncedAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          )
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={embedSyncing}
                    onClick={() => {
                      setEmbedPanelError(null);
                      void syncExercicesSharedEmbedNow().catch((err) => {
                        setEmbedPanelError(
                          err instanceof Error
                            ? err.message
                            : 'Impossible de synchroniser le lien embed.'
                        );
                      });
                    }}
                    className="h-7 px-2.5 rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-950 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:border-emerald-500 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${embedSyncing ? 'animate-spin' : ''}`} />
                    <span>Mettre à jour maintenant</span>
                  </button>
                </div>
              ) : user && syncStatus === 'syncing' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Connexion à votre espace cloud en cours…</span>
                  </div>
                </div>
              ) : user && syncStatus === 'error' ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                    <CloudOff className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Votre compte Google est connecté mais Firestore n’a pas encore répondu.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retryCloudSync()}
                    className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Réessayer la synchro</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <CloudOff className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Connectez-vous avec Google pour inclure la dernière sauvegarde cloud dans ce lien embed.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signInGoogle()}
                    className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LogIn className="w-3 h-3" />
                    <span>Se connecter (Google)</span>
                  </button>
                </div>
              )}

              {(embedPanelError || authError) && (
                <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {embedPanelError ?? formatFirebaseSyncError(authError)}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="embed-direct-url"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Lien direct (pour Notion / Embed URL)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="embed-direct-url"
                      type="text"
                      readOnly
                      value={embedUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyEmbed('url')}
                      className="h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {embedCopiedKind === 'url' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier le lien</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="embed-iframe-code"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Code HTML iframe
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="embed-iframe-code"
                      type="text"
                      readOnly
                      value={embedIframeCode}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyEmbed('iframe')}
                      className="h-8 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {embedCopiedKind === 'iframe' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Code2 className="w-3.5 h-3.5" />
                          <span>Copier iframe</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Côté application hôte : gardez <code className="font-mono">Cross-Origin-Opener-Policy: unsafe-none</code>, autorisez <code className="font-mono">allow="clipboard-write; identity-credentials-get"</code> et, si <code className="font-mono">sandbox</code> est utilisé, incluez <code className="font-mono">allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation</code>.
              </p>
            </div>
          )}
        </>
      )}

      {/* Barre de tri & état cloud en mode embed */}
      {embedMode && (
        <>
          <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Tri :</span>
              {sortRules.length === 0 ? (
                <span className="text-slate-400 dark:text-slate-500">Aucun</span>
              ) : (
                sortRules.map((rule, idx) => {
                  const colInfo = sortableColumns.find((c) => c.id === rule.colId);
                  const dirLabel = formatSortDirLabel(colInfo, rule.dir, true);
                  return (
                    <span key={`${rule.colId}-${idx}`} className="inline-flex items-center gap-1">
                      {idx > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                      <button
                        type="button"
                        onClick={() => toggleHeaderSort(rule.colId)}
                        title="Cliquer pour inverser le sens du tri"
                        className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1"
                      >
                        <span className="font-mono text-[11px] text-slate-400">{idx + 1}.</span>
                        <span>{colInfo?.name ?? rule.colId}</span>
                        <span className="font-mono text-[11px]">{dirLabel}</span>
                      </button>
                    </span>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {hasEmbedSortOverride && (
                <button
                  type="button"
                  onClick={() => setEmbedSortOverride(null)}
                  title="Revenir au tri par défaut de la page Exercices"
                  className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 hover:border-indigo-400 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tri par défaut</span>
                </button>
              )}
              {sortRules.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateSortRules([])}
                  aria-label="Effacer le tri"
                  title="Effacer le tri"
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSortPanel((v) => !v)}
                aria-expanded={showSortPanel}
                className={`h-7 px-2.5 rounded-md border text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  showSortPanel
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-indigo-400'
                }`}
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{showSortPanel ? 'Fermer tri' : 'Modifier le tri'}</span>
              </button>

              <span className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:inline-block" />

              {user && syncStatus === 'error' ? (
                <button
                  type="button"
                  onClick={() => void retryCloudSync()}
                  title="La connexion Firestore a échoué — cliquer pour réessayer"
                  className="h-7 px-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-[11px] font-medium text-red-700 dark:text-red-300 hover:border-red-400 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Réessayer</span>
                </button>
              ) : user ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                  <Cloud className="w-3 h-3" />
                  <span>{syncStatus === 'syncing' || embedSyncing ? 'Synchro…' : 'Cloud'}</span>
                </span>
              ) : embedSnapshotActive ? (
                <span
                  title="Synchronisé en lecture seule depuis votre dernière sauvegarde cloud"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                >
                  <Lock className="w-3 h-3" />
                  <span>Instantané cloud</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300 whitespace-nowrap">
                  <CloudOff className="w-3 h-3" />
                  <span>Local</span>
                </span>
              )}

              {!user && (
                <button
                  type="button"
                  onClick={() => void signInGoogle()}
                  className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                >
                  <LogIn className="w-3 h-3" />
                  <span>Se connecter</span>
                </button>
              )}

              <a
                href={mainAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir l’application complète dans un nouvel onglet"
                className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 hover:border-indigo-400 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ExternalLink className="w-3 h-3" />
                <span className="hidden sm:inline">Ouvrir l’app</span>
              </a>
            </div>
          </div>

          {(embedReadOnlyNotice || authError || (!user && !urlEmbedToken)) && (
            <div className="px-3 py-1.5 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50/90 dark:bg-amber-950/40 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 shrink-0">
              <span>
                {formatFirebaseSyncError(authError) ??
                  embedReadOnlyNotice ??
                  'Aperçu local (sans jeton de sauvegarde cloud). Ouvrez « Lien embed » depuis l’application en étant connecté pour copier le lien synchronisé.'}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {user && syncStatus === 'error' ? (
                  <button
                    type="button"
                    onClick={() => void retryCloudSync()}
                    className="h-6 px-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Réessayer</span>
                  </button>
                ) : (
                  !user && (
                    <button
                      type="button"
                      onClick={() => void signInGoogle()}
                      className="h-6 px-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium inline-flex items-center gap-1"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Se connecter</span>
                    </button>
                  )
                )}
                <a
                  href={mainAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-6 px-2 rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-950 text-[11px] font-medium text-amber-900 dark:text-amber-100 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Ouvrir dans un onglet</span>
                </a>
                {embedReadOnlyNotice && (
                  <button
                    type="button"
                    onClick={dismissEmbedReadOnlyNotice}
                    aria-label="Fermer l’avertissement"
                    className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-amber-200/60 dark:hover:bg-amber-900/50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Résumé compact du tri actif */}
      {!embedMode && sortRules.length > 0 && !showSortPanel && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500 dark:text-slate-400">Tri actif :</span>
          {sortRules.map((rule, idx) => {
            const colInfo = sortableColumns.find((c) => c.id === rule.colId);
            const dirLabel = formatSortDirLabel(colInfo, rule.dir, true);
            return (
              <span key={`${rule.colId}-${idx}`} className="inline-flex items-center gap-1">
                {idx > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                <button
                  type="button"
                  onClick={() => toggleHeaderSort(rule.colId)}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1"
                >
                  <span className="font-mono text-[11px] text-slate-400">{idx + 1}.</span>
                  <span>{colInfo?.name ?? rule.colId}</span>
                  <span className="font-mono text-[11px]">{dirLabel}</span>
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setShowSortPanel(true)}
            className="px-2 py-0.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => updateSortRules([])}
            aria-label="Effacer le tri"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Configurateur du tri par priorité */}
      {showSortPanel && (
        <div
          className={
            embedMode
              ? 'px-3 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/70 space-y-3 shrink-0'
              : 'p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-3'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Tri par priorité
            </span>
            <div className="flex items-center gap-2">
              {sortRules.length < sortableColumns.length && (
                <button
                  type="button"
                  onClick={() => addSortRule()}
                  className="h-7 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Critère</span>
                </button>
              )}
              {hasEmbedSortOverride && (
                <button
                  type="button"
                  onClick={() => setEmbedSortOverride(null)}
                  className="h-7 px-2.5 rounded-md text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                >
                  Tri par défaut
                </button>
              )}
              {sortRules.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateSortRules([])}
                  className="h-7 px-2.5 rounded-md text-xs text-slate-500 hover:text-red-600"
                >
                  Effacer
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowSortPanel(false);
                  setEditingChoicesColId(null);
                }}
                className="h-7 px-2.5 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>

          {sortRules.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Aucun critère actif. Ajoutez une colonne ou cliquez sur les en-têtes.
            </div>
          ) : (
            <div className="space-y-2">
              {sortRules.map((rule, idx) => {
                const colInfo = sortableColumns.find((c) => c.id === rule.colId);
                const dirLabel = formatSortDirLabel(colInfo, rule.dir, false);
                const targetCol = columns.find((c) => c.id === rule.colId);
                const hasCustomChoices =
                  targetCol?.type === 'select' || targetCol?.type === 'multi_select';
                const isEditingChoices = hasCustomChoices && editingChoicesColId === rule.colId;

                return (
                  <div key={`${rule.colId}-${idx}`} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-xs font-mono tabular-nums text-slate-500 text-right shrink-0">
                        {idx + 1}.
                      </span>
                      <select
                        value={rule.colId}
                        onChange={(e) => {
                          const nextColId = e.target.value;
                          const existingIdx = sortRules.findIndex(
                            (other, oi) => oi !== idx && other.colId === nextColId
                          );
                          if (existingIdx !== -1) {
                            const next = [...sortRules];
                            next[existingIdx] = { ...next[existingIdx], colId: rule.colId };
                            next[idx] = { ...next[idx], colId: nextColId };
                            updateSortRules(next);
                          } else {
                            updateSortRules(
                              sortRules.map((r, i) => (i === idx ? { ...r, colId: nextColId } : r))
                            );
                          }
                        }}
                        aria-label={`Colonne de tri ${idx + 1}`}
                        className="h-8 flex-1 min-w-[160px] max-w-xs px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                      >
                        {sortableColumns.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          updateSortRules(
                            sortRules.map((r, i) =>
                              i === idx ? { ...r, dir: r.dir === 'asc' ? 'desc' : 'asc' } : r
                            )
                          )
                        }
                        aria-label={`Ordre du critère ${idx + 1}`}
                        className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        {dirLabel}
                      </button>

                      {hasCustomChoices && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingChoicesColId((prev) =>
                              prev === rule.colId ? null : rule.colId
                            )
                          }
                          aria-label={`Ordre des choix pour ${colInfo?.name ?? rule.colId}`}
                          className={`h-8 px-2.5 rounded-md border text-xs whitespace-nowrap transition-colors ${
                            isEditingChoices
                              ? 'border-indigo-600 bg-indigo-600 text-white font-medium'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          Ordre des choix
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSortRule(idx, -1)}
                          disabled={idx === 0}
                          aria-label={`Monter critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSortRule(idx, 1)}
                          disabled={idx === sortRules.length - 1}
                          aria-label={`Descendre critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingChoicesColId === rule.colId) setEditingChoicesColId(null);
                            updateSortRules(sortRules.filter((_, i) => i !== idx));
                          }}
                          aria-label={`Retirer critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingChoices && targetCol && (
                      <div className="pl-8 max-w-md">
                        <ChoiceOrderEditor
                          choices={collectColumnChoices(targetCol, rows)}
                          onChange={(nextOptions) =>
                            updateDatabaseColumns(
                              page.id,
                              columns.map((c) =>
                                c.id === targetCol.id ? { ...c, options: nextOptions } : c
                              )
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Configurateur colonne */}
      {!embedMode && colPanel && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={colPanel.name}
              onChange={(e) => setColPanel({ ...colPanel, name: e.target.value })}
              placeholder="Nom de la colonne"
              aria-label="Nom de la colonne"
              className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 min-w-[160px]"
            />
            <select
              value={colPanel.type}
              onChange={(e) => {
                const nextType = e.target.value as ColumnType;
                const targetCol = colPanel.editingId
                  ? columns.find((c) => c.id === colPanel.editingId)
                  : undefined;
                const nextOptions =
                  nextType === 'select' || nextType === 'multi_select'
                    ? collectColumnChoices(targetCol, rows)
                    : colPanel.options;
                setColPanel({ ...colPanel, type: nextType, options: nextOptions });
              }}
              aria-label="Type de colonne"
              className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              {COLUMN_TYPE_LABELS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {colPanel.type === 'relation' && (
              <select
                value={colPanel.relationTargetPageId}
                onChange={(e) =>
                  setColPanel({ ...colPanel, relationTargetPageId: e.target.value })
                }
                aria-label="Base cible de la relation"
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              >
                <option value="">Choisir une base...</option>
                {databasePages.map((db) => (
                  <option key={db.id} value={db.id}>
                    {db.title || 'Sans titre'}
                  </option>
                ))}
              </select>
            )}

            {colPanel.type === 'rollup' && (
              <>
                <select
                  value={colPanel.rollupRelationColId}
                  onChange={(e) =>
                    setColPanel({
                      ...colPanel,
                      rollupRelationColId: e.target.value,
                      rollupTargetColId: '',
                    })
                  }
                  aria-label="Colonne relation source"
                  className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">Relation...</option>
                  {columns
                    .filter((c) => c.type === 'relation')
                    .map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        {rc.name}
                      </option>
                    ))}
                </select>
                <select
                  value={colPanel.rollupTargetColId}
                  onChange={(e) =>
                    setColPanel({ ...colPanel, rollupTargetColId: e.target.value })
                  }
                  aria-label="Propriété cible"
                  className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">Propriété cible...</option>
                  {(rollupTargetDb?.columns ?? []).map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.name}
                    </option>
                  ))}
                </select>
                <select
                  value={colPanel.rollupFn}
                  onChange={(e) =>
                    setColPanel({ ...colPanel, rollupFn: e.target.value as RollupFunction })
                  }
                  aria-label="Fonction d'agrégat"
                  className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  {ROLLUP_FN_LABELS.map((fnOpt) => (
                    <option key={fnOpt.value} value={fnOpt.value}>
                      {fnOpt.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {(colPanel.type === 'select' || colPanel.type === 'multi_select') && (
            <div className="max-w-md">
              <ChoiceOrderEditor
                choices={colPanel.options}
                onChange={(nextOptions) => setColPanel({ ...colPanel, options: nextOptions })}
              />
            </div>
          )}

          {colPanel.type === 'formula' && (
            <div className="space-y-2">
              <input
                type="text"
                value={colPanel.formulaExpression}
                onChange={(e) => setColPanel({ ...colPanel, formulaExpression: e.target.value })}
                placeholder='Ex: prop("Budget") * 1.2 ou if(prop("Fait"), "OK", "À faire")'
                aria-label="Expression de la formule"
                className="w-full h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {columns
                  .filter((c) => c.id !== colPanel.editingId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setColPanel({
                          ...colPanel,
                          formulaExpression: `${colPanel.formulaExpression}prop("${c.name}")`,
                        })
                      }
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:border-indigo-400"
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
              {formulaPreview && (
                <div className="text-xs">
                  {formulaPreview.error ? (
                    <span className="text-red-600 dark:text-red-400">{formulaPreview.error}</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Aperçu ligne 1 : {formulaPreview.text || '—'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveColPanel}
                className="h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium whitespace-nowrap"
              >
                {colPanel.editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setColPanel(null);
                  setConfirmRemoveCol(false);
                }}
                className="h-8 px-2.5 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Annuler
              </button>
            </div>

            {colPanel.editingId && colPanel.editingId !== primaryCol.id && (
              <div className="flex items-center gap-2">
                {confirmRemoveCol ? (
                  <>
                    <button
                      type="button"
                      onClick={() => removeColumn(colPanel.editingId!)}
                      className="h-8 px-2.5 rounded-md bg-red-600 text-white text-xs font-medium whitespace-nowrap"
                    >
                      Confirmer suppression
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveCol(false)}
                      className="h-8 px-2 rounded-md text-xs text-slate-500"
                    >
                      Non
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveCol(true)}
                    className="h-8 px-2.5 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap"
                  >
                    Supprimer la colonne
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre d'action de suppression multiple */}
      {!embedMode && selectionMode && (
        <div className="px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/25 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-medium text-red-900 dark:text-red-200 font-mono tabular-nums">
              {selectedRowIds.size > 0
                ? `${selectedRowIds.size} ${
                    isBiblimproPage
                      ? selectedRowIds.size > 1
                        ? 'exercices sélectionnés'
                        : 'exercice sélectionné'
                      : selectedRowIds.size > 1
                        ? 'lignes sélectionnées'
                        : 'ligne sélectionnée'
                  }`
                : isBiblimproPage
                  ? 'Cochez les exercices à supprimer (Maj+clic pour une plage)'
                  : 'Cochez les lignes à supprimer (Maj+clic pour une plage)'}
            </span>
            {visibleRows.length > 0 && (
              <button
                type="button"
                disabled={deletingBulk}
                onClick={toggleSelectAllVisible}
                className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/80 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-50 whitespace-nowrap"
              >
                {allVisibleSelected
                  ? 'Tout désélectionner'
                  : `Tout sélectionner (${visibleRows.length})`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedRowIds.size > 0 &&
              (confirmBulkDelete ? (
                <>
                  <button
                    type="button"
                    disabled={deletingBulk}
                    onClick={() => void handleConfirmBulkDelete()}
                    className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 whitespace-nowrap"
                  >
                    {deletingBulk
                      ? 'Suppression…'
                      : `Confirmer la suppression (${selectedRowIds.size})`}
                  </button>
                  <button
                    type="button"
                    disabled={deletingBulk}
                    onClick={() => setConfirmBulkDelete(false)}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-50 whitespace-nowrap"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={deletingBulk}
                  onClick={() => setConfirmBulkDelete(true)}
                  className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer ({selectedRowIds.size})</span>
                </button>
              ))}
            <button
              type="button"
              disabled={deletingBulk}
              onClick={toggleSelectionMode}
              className="h-8 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-red-100/70 dark:hover:bg-red-900/40 disabled:opacity-50 whitespace-nowrap"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* VUE TABLEAU */}
      {effectiveView === 'table' && (
        <div
          ref={tableContainerRef}
          className={
            embedMode
              ? 'flex-1 min-h-0 overflow-auto bg-white dark:bg-slate-900/40'
              : 'overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/40'
          }
        >
          <table
            className="table-fixed border-collapse text-left"
            style={{
              width: hasCustomPrimaryWidth
                ? `${totalTableWidth}px`
                : `max(100%, ${totalTableWidth}px)`,
            }}
          >
            <colgroup>
              {selectionMode && <col style={{ width: `${SELECTION_COL_WIDTH}px` }} />}
              {canReorderRows && <col style={{ width: `${REORDER_COL_WIDTH}px` }} />}
              {displayColumns.map((item) => {
                if (item.kind === 'native') {
                  const isPrimary = item.col.id === primaryCol?.id;
                  const width = getColWidth(item.col);
                  return (
                    <col
                      key={item.id}
                      style={
                        isPrimary && !hasCustomPrimaryWidth ? undefined : { width: `${width}px` }
                      }
                    />
                  );
                }
                return <col key={item.id} style={{ width: `${getDeducedWidth(item.dcol)}px` }} />;
              })}
              <col style={{ width: `${ACTIONS_COL_WIDTH}px` }} />
            </colgroup>

            <thead className={embedMode ? 'sticky top-0 z-10' : undefined}>
              <tr
                className={`border-b border-slate-200 dark:border-slate-800 ${
                  embedMode
                    ? 'bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs'
                    : 'bg-slate-50/90 dark:bg-slate-900'
                }`}
              >
                {selectionMode && (
                  <th className="px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center">
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleRows.length === 0 || deletingBulk}
                      onChange={toggleSelectAllVisible}
                      aria-label="Tout sélectionner dans le tableau"
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer"
                    />
                  </th>
                )}
                {canReorderRows && (
                  <th className="px-1.5 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Ordre
                  </th>
                )}
                {displayColumns.map((item) => {
                  const isDragging = dragColId === item.id;
                  const dropSide = dropIndicator?.colId === item.id ? dropIndicator.position : null;

                  if (item.kind === 'native') {
                    const col = item.col;
                    const colWidth = getColWidth(col);
                    const minWidth = col.type === 'checkbox' ? 46 : 84;
                    const isCheckbox = col.type === 'checkbox';

                    return (
                      <th
                        key={col.id}
                        {...getThDropProps(col.id)}
                        className={`group/th relative py-2.5 border-r border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 select-none ${
                          isCheckbox ? 'px-1.5 text-center' : 'px-3'
                        } ${isDragging ? 'opacity-45' : ''}`}
                      >
                        {dropSide && (
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-20 ${
                              dropSide === 'before' ? 'left-0' : 'right-0'
                            }`}
                          />
                        )}
                        <div
                          className={`flex items-center gap-1 min-w-0 ${
                            isCheckbox ? 'justify-center' : 'justify-between'
                          }`}
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              {...getDragHandleProps(col.id)}
                              title="Glisser pour déplacer la colonne"
                              className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 shrink-0"
                            >
                              <GripVertical className="w-3 h-3" />
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleHeaderSort(col.id)}
                              className="flex items-center gap-1 min-w-0 text-left hover:text-slate-950 dark:hover:text-white"
                            >
                              <span className="truncate">{col.name}</span>
                              {renderSortIndicator(col.id)}
                            </button>
                          </div>
                          {!isCheckbox && !embedMode && (
                            <button
                              type="button"
                              onClick={() => openEditColPanel(col)}
                              aria-label={`Configurer ${col.name}`}
                              className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/th:opacity-100 text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                            >
                              <Settings2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Redimensionner ${col.name}`}
                          onPointerDown={(e) => startColumnResize(e, col.id, colWidth, minWidth)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            resetColumnWidth(page.id, col.id);
                          }}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/30 z-10"
                        />
                      </th>
                    );
                  }

                  const dcol = item.dcol;
                  const dWidth = getDeducedWidth(dcol);
                  return (
                    <th
                      key={dcol.id}
                      {...getThDropProps(dcol.id)}
                      className={`group/th relative px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 select-none ${
                        isDragging ? 'opacity-45' : ''
                      }`}
                    >
                      {dropSide && (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-20 ${
                            dropSide === 'before' ? 'left-0' : 'right-0'
                          }`}
                        />
                      )}
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          {...getDragHandleProps(dcol.id)}
                          title="Glisser pour déplacer la colonne"
                          className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 shrink-0"
                        >
                          <GripVertical className="w-3 h-3" />
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleHeaderSort(dcol.id)}
                          className="flex items-center gap-1 min-w-0 text-left hover:text-slate-950 dark:hover:text-white"
                        >
                          <span className="truncate">{dcol.name}</span>
                          {renderSortIndicator(dcol.id)}
                        </button>
                      </div>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner ${dcol.name}`}
                        onPointerDown={(e) => startColumnResize(e, dcol.id, dWidth, 84)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          resetColumnWidth(page.id, dcol.id);
                        }}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/30 z-10"
                      />
                    </th>
                  );
                })}
                <th className="px-2 py-2.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      displayColumns.length +
                      1 +
                      (selectionMode ? 1 : 0) +
                      (canReorderRows ? 1 : 0)
                    }
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Aucune ligne dans cette vue.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, rowIdx) => {
                  const rowLabel = String(row.cells[primaryCol.id] || 'ligne');
                  const isActiveOrDraft =
                    activeDetailRowId === row.id || untouchedDraftIds.has(row.id);
                  const isRowSelected = selectionMode && selectedRowIds.has(row.id);
                  const isDraggingRow = canReorderRows && dragRowId === row.id;
                  const rowDropPos =
                    canReorderRows && rowDropIndicator?.rowId === row.id
                      ? rowDropIndicator.position
                      : null;
                  const dropShadowClass =
                    rowDropPos === 'before'
                      ? 'shadow-[inset_0_2px_0_0_rgb(79,70,229)]'
                      : rowDropPos === 'after'
                        ? 'shadow-[inset_0_-2px_0_0_rgb(79,70,229)]'
                        : '';
                  const isRowExpanded =
                    expandedRowIds.has(row.id) ||
                    activeCellEditor?.rowId === row.id ||
                    editingNameRowId === row.id;
                  const cellPadAlign = isRowExpanded ? 'py-2.5 align-top' : 'py-1.5 align-middle';
                  return (
                    <tr
                      key={row.id}
                      data-row-id={row.id}
                      {...(canReorderRows ? getTrDropProps(row.id) : {})}
                      className={`group/row transition-colors ${dropShadowClass} ${
                        isDraggingRow ? 'opacity-45' : ''
                      } ${
                        isRowSelected
                          ? 'bg-red-50/60 dark:bg-red-950/20'
                          : isActiveOrDraft
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/25'
                            : isRowExpanded
                              ? 'bg-indigo-50/25 dark:bg-indigo-950/15'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      {selectionMode && (
                        <td
                          className={`px-2 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800 text-center`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(row.id)}
                            disabled={deletingBulk}
                            onChange={(e) =>
                              toggleRowSelection(
                                row.id,
                                Boolean((e.nativeEvent as MouseEvent | undefined)?.shiftKey)
                              )
                            }
                            aria-label={`Sélectionner ${rowLabel} pour suppression`}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer"
                          />
                        </td>
                      )}
                      {canReorderRows && (
                        <td
                          className={`px-1 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800`}
                        >
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              {...getRowDragHandleProps(row.id)}
                              title="Glisser pour déplacer l'exercice"
                              aria-label={`Glisser ${rowLabel}`}
                              className="w-5 h-6 inline-flex items-center justify-center rounded cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <button
                              type="button"
                              disabled={rowIdx === 0}
                              onClick={() => {
                                stepExerciseRank(visibleRowIds, row.id, -1, { scoreSortDir });
                                triggerScoreHighlight(row.id);
                              }}
                              aria-label={`Monter ${rowLabel}`}
                              title="Monter d'un rang"
                              className="w-5 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={rowIdx === visibleRows.length - 1}
                              onClick={() => {
                                stepExerciseRank(visibleRowIds, row.id, 1, { scoreSortDir });
                                triggerScoreHighlight(row.id);
                              }}
                              aria-label={`Descendre ${rowLabel}`}
                              title="Descendre d'un rang"
                              className="w-5 h-6 inline-flex items-center justify-center rounded text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                      {displayColumns.map((item) => {
                        if (item.kind === 'native') {
                          const col = item.col;
                          return (
                            <td
                              key={col.id}
                              className={`${cellPadAlign} border-r border-slate-200 dark:border-slate-800 ${
                                !isRowExpanded ? 'overflow-hidden ' : ''
                              }${col.type === 'checkbox' ? 'px-1.5 text-center' : 'px-3'}`}
                            >
                              {renderCell(row, col, isRowExpanded)}
                            </td>
                          );
                        }
                        const dcol = item.dcol;
                        return (
                          <td
                            key={dcol.id}
                            className={`px-3 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 ${
                              !isRowExpanded ? 'overflow-hidden whitespace-nowrap ' : ''
                            }${!dcol.renderNode && !isRowExpanded ? 'truncate ' : ''}${
                              dcol.numeric || dcol.mono ? 'font-mono tabular-nums' : ''
                            }`}
                          >
                            {dcol.renderNode ? dcol.renderNode(row, isRowExpanded) : dcol.render(row)}
                          </td>
                        );
                      })}
                      <td className={`px-2 ${cellPadAlign} text-center`}>
                        <div className="inline-flex items-center gap-0.5">
                          {page.id === IMPRO_DB_IDS.seances && isImproPage && (
                            <button
                              type="button"
                              onClick={() => openLiveAnimation(row.id)}
                              aria-label={`Animer ${rowLabel}`}
                              title="Lancer l'animation en direct"
                              className="w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openImproDetail(page.id, row.id, true)}
                            aria-label={`Fiche ${rowLabel}`}
                            title="Ouvrir la fiche latérale"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                          {!isImproPage && (
                            <button
                              type="button"
                              onClick={() => void openOrCreateRowPage(page.id, row.id)}
                              aria-label={`Page de contenus ${rowLabel}`}
                              title={
                                row.linkedPageId
                                  ? 'Ouvrir la page de contenus'
                                  : 'Créer la page de contenus'
                              }
                              className={`w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                row.linkedPageId &&
                                pages.some((p) => p.id === row.linkedPageId && !p.isTrashed)
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : 'text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void duplicateRow(row)}
                            aria-label={`Dupliquer ${rowLabel}`}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDatabaseRow(page.id, row.id)}
                            aria-label={`Supprimer ${rowLabel}`}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => void handleCreateRow()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 py-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouvelle ligne</span>
            </button>

            {filteredRows.length > visibleRows.length && (
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums">
                  {visibleRows.length} / {filteredRows.length} lignes
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllRows(true)}
                  className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Tout afficher
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VUE KANBAN */}
      {effectiveView === 'kanban' && (
        <div>
          {!groupCol ? (
            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Ajoutez une colonne de type « Sélection » pour activer la vue Kanban.
              </p>
              <button
                type="button"
                onClick={() =>
                  setColPanel({
                    editingId: null,
                    name: 'Statut',
                    type: 'select',
                    options: ['À faire', 'En cours', 'Terminé'],
                    relationTargetPageId: '',
                    rollupRelationColId: '',
                    rollupTargetColId: '',
                    rollupFn: 'count',
                    formulaExpression: '',
                  })
                }
                className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
              >
                Créer une colonne Sélection
              </button>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {kanbanGroups.map(([groupName, groupRows]) => (
                <div
                  key={groupName}
                  className="w-72 shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/50 p-3 space-y-2.5"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {groupName}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {groupRows.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {groupRows.map((row) => {
                      const computed = computedByRowId.get(row.id)?.cells ?? row.cells;
                      const rawTitle = String(row.cells[primaryCol.id] ?? '');
                      const titleText = rawTitle || 'Sans titre';
                      const metaParts = columns
                        .filter((c) => c.id !== primaryCol.id && c.id !== groupCol.id)
                        .map((c) => formatCellText(c, computed[c.id], pages, rowsByPage))
                        .filter(Boolean)
                        .slice(0, 2);

                      return (
                        <div
                          key={row.id}
                          className={`rounded-lg border p-3 space-y-2 ${
                            selectionMode && selectedRowIds.has(row.id)
                              ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {selectionMode && (
                              <input
                                type="checkbox"
                                checked={selectedRowIds.has(row.id)}
                                disabled={deletingBulk}
                                onChange={(e) =>
                                  toggleRowSelection(
                                    row.id,
                                    Boolean((e.nativeEvent as MouseEvent | undefined)?.shiftKey)
                                  )
                                }
                                aria-label={`Sélectionner ${titleText} pour suppression`}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer shrink-0"
                              />
                            )}
                            <input
                              type="text"
                              value={rawTitle}
                              onChange={(e) => updateCell(row, primaryCol.id, e.target.value)}
                              placeholder="Sans titre..."
                              aria-label="Titre de la carte"
                              className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                            />
                          </div>
                          {metaParts.length > 0 && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                              {metaParts.join(' · ')}
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <select
                              value={groupName}
                              onChange={(e) => updateCell(row, groupCol.id, e.target.value)}
                              aria-label={`Déplacer ${titleText}`}
                              className="bg-transparent text-xs text-slate-600 dark:text-slate-400 focus:outline-none cursor-pointer"
                            >
                              {(groupCol.options ?? []).map((opt) => (
                                <option key={opt} value={opt} className="bg-white dark:bg-slate-900">
                                  {opt}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-2">
                              {!isImproPage && (
                                <button
                                  type="button"
                                  onClick={() => void openOrCreateRowPage(page.id, row.id)}
                                  aria-label={`Page de contenus ${titleText}`}
                                  title="Ouvrir la page de contenus"
                                  className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openImproDetail(page.id, row.id, true)}
                                aria-label={`Fiche ${titleText}`}
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                Fiche
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteDatabaseRow(page.id, row.id)}
                                aria-label={`Supprimer ${titleText}`}
                                className="text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void handleCreateRow({
                        [primaryCol.id]: '',
                        [groupCol.id]: groupName,
                      })
                    }
                    className="w-full py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VUE LISTE */}
      {effectiveView === 'list' && (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/40">
          {visibleRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Aucune ligne</div>
          ) : (
            visibleRows.map((row) => {
              const computed = computedByRowId.get(row.id)?.cells ?? row.cells;
              const checkCol = columns.find((c) => c.type === 'checkbox');
              const meta = [
                ...columns
                  .filter((c) => c.id !== primaryCol.id && c.id !== checkCol?.id)
                  .map((c) => formatCellText(c, computed[c.id], pages, rowsByPage)),
                ...deducedColumns.map((dc) => dc.render(row)),
              ].filter((v) => v && v !== '—');

              return (
                <div
                  key={row.id}
                  className={`px-4 py-2.5 flex items-center justify-between gap-4 ${
                    selectionMode && selectedRowIds.has(row.id)
                      ? 'bg-red-50/50 dark:bg-red-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(row.id)}
                        disabled={deletingBulk}
                        onChange={(e) =>
                          toggleRowSelection(
                            row.id,
                            Boolean((e.nativeEvent as MouseEvent | undefined)?.shiftKey)
                          )
                        }
                        aria-label={`Sélectionner ${String(row.cells[primaryCol.id] || 'ligne')} pour suppression`}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer shrink-0"
                      />
                    )}
                    {checkCol && (
                      <input
                        type="checkbox"
                        checked={Boolean(row.cells[checkCol.id])}
                        onChange={(e) => updateCell(row, checkCol.id, e.target.checked)}
                        aria-label={`Valider ${String(row.cells[primaryCol.id] || 'ligne')}`}
                        className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                      />
                    )}
                    <input
                      type="text"
                      value={String(row.cells[primaryCol.id] ?? '')}
                      onChange={(e) => updateCell(row, primaryCol.id, e.target.value)}
                      aria-label="Nom"
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {meta.length > 0 && (
                      <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 tabular-nums max-w-md truncate">
                        {meta.join(' · ')}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => openImproDetail(page.id, row.id, true)}
                      aria-label={`Fiche ${String(row.cells[primaryCol.id] || 'ligne')}`}
                      className="px-2 py-1 rounded-md text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      Fiche
                    </button>
                    {!isImproPage && (
                      <button
                        type="button"
                        onClick={() => void openOrCreateRowPage(page.id, row.id)}
                        aria-label={`Page de contenus ${String(row.cells[primaryCol.id] || 'ligne')}`}
                        title={
                          row.linkedPageId
                            ? 'Ouvrir la page de contenus'
                            : 'Créer la page de contenus'
                        }
                        className={`w-7 h-7 flex items-center justify-center rounded-md ${
                          row.linkedPageId &&
                          pages.some((p) => p.id === row.linkedPageId && !p.isTrashed)
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteDatabaseRow(page.id, row.id)}
                      aria-label={`Supprimer ${String(row.cells[primaryCol.id] || 'ligne')}`}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <div className="px-4 py-2 bg-slate-50/60 dark:bg-slate-900/40">
            <button
              type="button"
              onClick={() => void handleCreateRow()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 py-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouvelle ligne</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
