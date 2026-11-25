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
  GripVertical,
  Info,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { useRowDrag } from '../hooks/useRowDrag';
import type {
  CellValue,
  ColumnType,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  PrepareTableFilterSettings,
} from '../types/workspace';
import {
  extractReorderedNativeColumns,
  getPrimaryColumn,
  mergeColumnOrder,
  reorderIds,
  syncNativeOrderInMixedList,
} from '../utils/columnOrder';
import { sortDatabaseRows, type SortableDeducedColumn } from '../utils/databaseSort';
import { getActiveScoreSortDir } from '../utils/exerciseRanking';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import type { ImproExerciseSuggestion, NoveltyBucket } from '../utils/improEngine';
import { formatCellText, getComputedRowCells } from '../utils/notionFormula';
import { ChoiceOrderEditor } from './ChoiceOrderEditor';
import { ScoreRankInput } from './ScoreRankInput';

type SuggestionNoveltyTab = 'all_new' | 'majority' | 'done' | 'all';

interface ImproPrepareTableProps {
  suggestions: ImproExerciseSuggestion[];
  selectedExIds: Set<string>;
  groupeId: string;
  presentCount: number;
  sortRules: DatabaseSortRule[];
  onSortRulesChange: (rules: DatabaseSortRule[]) => void;
  onToggleExercise: (exerciceId: string) => void;
  onPickRandom: (candidates: ImproExerciseSuggestion[]) => void;
  onExercisesDeleted?: (deletedIds: string[]) => void;
}

const NOVELTY_COL_ID = 'ded_prep_novelty';
const PREP_SELECT_COL_WIDTH = 42;
const PREP_REORDER_COL_WIDTH = 76;
const PREP_ACTION_COL_WIDTH = 98;
const PREP_FICHE_COL_WIDTH = 80;

function collectChoices(col: DatabaseColumn | undefined, rows: DatabaseRow[]): string[] {
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

function getPrepareColWidth(col: DatabaseColumn, isPrimary: boolean): number {
  if (col.id === IMPRO_COL_IDS.exercices.score) return 76;
  if (col.type === 'checkbox') return 54;
  if (col.type === 'number' || col.type === 'rollup') return 94;
  if (col.type === 'date') return 120;
  if (col.type === 'select') return 128;
  if (col.type === 'multi_select') return 146;
  if (col.type === 'relation') return 190;
  if (isPrimary) return 212;
  if (col.name.toLowerCase().includes('description')) return 280;
  return 152;
}

function getPrepareDeducedWidth(dcol: { id: string; name: string; numeric?: boolean }): number {
  if (dcol.id === NOVELTY_COL_ID) return 140;
  if (dcol.numeric) return 130;
  if (dcol.name.toLowerCase().includes('dernière')) return 120;
  return 164;
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

interface DeducedPrepareColumn extends SortableDeducedColumn {
  mono?: boolean;
  renderNode?: (row: DatabaseRow, isExpanded: boolean) => ReactNode;
}

export function ImproPrepareTable({
  suggestions,
  selectedExIds,
  groupeId,
  presentCount,
  sortRules,
  onSortRulesChange,
  onToggleExercise,
  onPickRandom,
  onExercisesDeleted,
}: ImproPrepareTableProps) {
  const {
    pages,
    rowsByPage,
    improModel,
    openImproDetail,
    updateDatabaseRow,
    updateDatabaseColumns,
    deleteDatabaseRows,
    columnWidths,
    setColumnWidth,
    resetColumnWidth,
    tableColumnOrders,
    setTableColumnOrder,
    moveExerciseRank,
    stepExerciseRank,
    setExerciseScore,
    viewSettings,
    updatePrepareSettings,
  } = useWorkspace();

  const tableFilters = viewSettings.prepare.tableFilters;
  const {
    noveltyTab,
    searchQuery,
    etapeFilter,
    tagFilter,
    onlyCheck1,
    onlyCheck2,
    onlyCheckV,
    showAllRows,
  } = tableFilters;

  const updateFilters = (patch: Partial<PrepareTableFilterSettings>) => {
    updatePrepareSettings((prev) => ({
      ...prev,
      tableFilters: {
        ...prev.tableFilters,
        ...patch,
      },
    }));
  };

  const setNoveltyTab = (val: SuggestionNoveltyTab) => updateFilters({ noveltyTab: val });
  const setSearchQuery = (val: string) => updateFilters({ searchQuery: val });
  const setEtapeFilter = (val: string) => updateFilters({ etapeFilter: val });
  const setTagFilter = (val: string) => updateFilters({ tagFilter: val });
  const setOnlyCheck1 = (valOrFn: boolean | ((v: boolean) => boolean)) =>
    updateFilters({
      onlyCheck1:
        typeof valOrFn === 'function'
          ? valOrFn(viewSettings.prepare.tableFilters.onlyCheck1)
          : valOrFn,
    });
  const setOnlyCheck2 = (valOrFn: boolean | ((v: boolean) => boolean)) =>
    updateFilters({
      onlyCheck2:
        typeof valOrFn === 'function'
          ? valOrFn(viewSettings.prepare.tableFilters.onlyCheck2)
          : valOrFn,
    });
  const setOnlyCheckV = (valOrFn: boolean | ((v: boolean) => boolean)) =>
    updateFilters({
      onlyCheckV:
        typeof valOrFn === 'function'
          ? valOrFn(viewSettings.prepare.tableFilters.onlyCheckV)
          : valOrFn,
    });
  const setShowAllRows = (val: boolean) => updateFilters({ showAllRows: val });

  const [showSortPanel, setShowSortPanel] = useState(false);
  const [editingChoicesColId, setEditingChoicesColId] = useState<string | null>(null);
  const [deleteSelectionMode, setDeleteSelectionMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const lastDeleteAnchorRef = useRef<string | null>(null);
  const selectAllDeleteRef = useRef<HTMLInputElement | null>(null);
  const [resizingCol, setResizingCol] = useState<{
    colId: string;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);
  const [highlightedScoreRowId, setHighlightedScoreRowId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());
  const [editingNameRowId, setEditingNameRowId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState('');

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
    };
  }, []);

  const exPage = useMemo(
    () => pages.find((p) => p.id === IMPRO_DB_IDS.exercices && !p.isTrashed) ?? null,
    [pages]
  );
  const exRows = rowsByPage[IMPRO_DB_IDS.exercices] ?? [];

  const columns: DatabaseColumn[] = useMemo(
    () =>
      exPage?.columns && exPage.columns.length > 0
        ? exPage.columns
        : [{ id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' }],
    [exPage]
  );
  const primaryCol = getPrimaryColumn(columns) ?? columns[0];

  const suggestionByExId = useMemo(() => {
    const map = new Map<string, ImproExerciseSuggestion>();
    for (const s of suggestions) map.set(s.exercise.id, s);
    return map;
  }, [suggestions]);

  useEffect(() => {
    if (!resizingCol) return;
    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - resizingCol.startX;
      const nextWidth = Math.max(
        resizingCol.minWidth,
        Math.min(640, resizingCol.startWidth + delta)
      );
      setColumnWidth(IMPRO_DB_IDS.exercices, resizingCol.colId, nextWidth);
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
  }, [resizingCol, setColumnWidth]);

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

  const computedByRowId = useMemo(() => {
    const map = new Map<string, { cells: Record<string, CellValue>; errors: Record<string, string> }>();
    if (!exPage) return map;
    for (const row of exRows) {
      map.set(row.id, getComputedRowCells(exPage, row, pages, rowsByPage));
    }
    return map;
  }, [exRows, exPage, pages, rowsByPage]);

  const computedCellsMap = useMemo(() => {
    const map = new Map<string, Record<string, CellValue>>();
    for (const [id, entry] of computedByRowId.entries()) map.set(id, entry.cells);
    return map;
  }, [computedByRowId]);

  const formatNoveltyLabel = (s: ImproExerciseSuggestion | undefined): string => {
    if (!s) return '—';
    if (s.totalPresent > 0) return `${s.unseenCount}/${s.totalPresent} inédits`;
    if (groupeId) return s.groupDoneCount === 0 ? 'Inédit groupe' : `${s.groupDoneCount}× groupe`;
    return s.exercise.usageCount === 0 ? 'Jamais fait' : `${s.exercise.usageCount}×`;
  };

  const deducedColumns: DeducedPrepareColumn[] = useMemo(
    () => [
      {
        id: NOVELTY_COL_ID,
        name: presentCount > 0 ? 'Nouveauté (présents)' : 'Nouveauté',
        numeric: true,
        mono: true,
        sortValue: (r) => {
          const s = suggestionByExId.get(r.id);
          if (!s) return 999999;
          const unseenPenalty = Math.round((1 - s.unseenRatio) * 1000) * 1000;
          const countTie = groupeId ? s.groupDoneCount : s.exercise.usageCount;
          return unseenPenalty + Math.min(999, countTie);
        },
        render: (r) => formatNoveltyLabel(suggestionByExId.get(r.id)),
      },
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
    ],
    [presentCount, suggestionByExId, improModel.exerciseById, improModel.groupById, improModel.participantById, groupeId, openImproDetail]
  );

  const noveltyCol = deducedColumns[0];
  const trailingDeducedColumns = deducedColumns.slice(1);

  const sortableColumns = useMemo(
    () => [
      {
        id: noveltyCol.id,
        name: noveltyCol.name,
        numeric: true,
        type: undefined as ColumnType | undefined,
      },
      ...columns.map((c) => ({
        id: c.id,
        name: c.name,
        numeric: c.type === 'number' || c.type === 'rollup',
        type: c.type as ColumnType | undefined,
      })),
      ...trailingDeducedColumns.map((d) => ({
        id: d.id,
        name: d.name,
        numeric: Boolean(d.numeric),
        type: undefined as ColumnType | undefined,
      })),
    ],
    [noveltyCol, columns, trailingDeducedColumns]
  );

  const baseMatchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return exRows.filter((row) => {
      const ex = improModel.exerciseById.get(row.id);
      if (!ex) return false;
      if (etapeFilter && !ex.etapes.includes(etapeFilter)) return false;
      if (tagFilter && !ex.tags.includes(tagFilter)) return false;
      if (onlyCheck1 && !ex.check1) return false;
      if (onlyCheck2 && !ex.check2) return false;
      if (onlyCheckV && !ex.checkV) return false;
      if (q) {
        const hay = [
          ex.nom,
          ex.etapes.join(' '),
          ex.tags.join(' '),
          ex.description,
          ex.groupNames.join(' '),
          ex.participantNames.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    exRows,
    improModel.exerciseById,
    etapeFilter,
    tagFilter,
    onlyCheck1,
    onlyCheck2,
    onlyCheckV,
    searchQuery,
  ]);

  const bucketCounts = useMemo(() => {
    let allNew = 0;
    let majority = 0;
    let done = 0;
    for (const r of baseMatchedRows) {
      const b = suggestionByExId.get(r.id)?.noveltyBucket ?? 'all_done';
      if (b === 'all_new') allNew++;
      else if (b === 'majority_new' || b === 'mixed') majority++;
      else done++;
    }
    return { allNew, majority, done, all: baseMatchedRows.length };
  }, [baseMatchedRows, suggestionByExId]);

  const filteredAndSortedRows = useMemo(() => {
    const matchesBucket = (b: NoveltyBucket) => {
      if (noveltyTab === 'all') return true;
      if (noveltyTab === 'all_new') return b === 'all_new';
      if (noveltyTab === 'majority') return b === 'all_new' || b === 'majority_new' || b === 'mixed';
      return b === 'all_done';
    };
    const bucketed = baseMatchedRows.filter((row) =>
      matchesBucket(suggestionByExId.get(row.id)?.noveltyBucket ?? 'all_done')
    );
    if (sortRules.length === 0) {
      const orderMap = new Map(suggestions.map((s, idx) => [s.exercise.id, idx]));
      return [...bucketed].sort(
        (a, b) => (orderMap.get(a.id) ?? 99999) - (orderMap.get(b.id) ?? 99999)
      );
    }
    return sortDatabaseRows(
      bucketed,
      sortRules,
      columns,
      deducedColumns,
      computedCellsMap,
      pages,
      rowsByPage
    );
  }, [
    baseMatchedRows,
    noveltyTab,
    suggestionByExId,
    sortRules,
    suggestions,
    columns,
    deducedColumns,
    computedCellsMap,
    pages,
    rowsByPage,
  ]);

  const visibleRows = useMemo(() => {
    if (showAllRows || searchQuery.trim().length > 0 || filteredAndSortedRows.length <= 120) {
      return filteredAndSortedRows;
    }
    return filteredAndSortedRows.slice(0, 120);
  }, [filteredAndSortedRows, showAllRows, searchQuery]);

  const randomCandidates = useMemo(
    () =>
      filteredAndSortedRows
        .map((r) => suggestionByExId.get(r.id))
        .filter((s): s is ImproExerciseSuggestion => Boolean(s))
        .filter((s) => !selectedExIds.has(s.exercise.id)),
    [filteredAndSortedRows, suggestionByExId, selectedExIds]
  );

  const pageCustomWidths = columnWidths[IMPRO_DB_IDS.exercices] ?? {};
  const hasCustomWidths = Object.keys(pageCustomWidths).length > 0;
  const getColWidth = (col: DatabaseColumn, isPrimary: boolean) =>
    pageCustomWidths[col.id] ?? getPrepareColWidth(col, isPrimary);
  const getDeducedWidth = (dcol: DeducedPrepareColumn) =>
    pageCustomWidths[dcol.id] ?? getPrepareDeducedWidth(dcol);

  const PREPARE_ORDER_KEY = 'prepare_exercices';

  const orderedDisplayIds = useMemo(() => {
    const nativeIds = columns.map((c) => c.id);
    const defaultIds =
      nativeIds.length > 0
        ? [
            nativeIds[0],
            noveltyCol.id,
            ...nativeIds.slice(1),
            ...trailingDeducedColumns.map((d) => d.id),
          ]
        : [noveltyCol.id, ...trailingDeducedColumns.map((d) => d.id)];
    const saved = tableColumnOrders[PREPARE_ORDER_KEY];
    if (!saved || saved.length === 0) return defaultIds;
    const merged = mergeColumnOrder(defaultIds, saved);
    return syncNativeOrderInMixedList(merged, columns);
  }, [columns, noveltyCol.id, trailingDeducedColumns, tableColumnOrders]);

  const displayColumns = useMemo(() => {
    const nativeMap = new Map(columns.map((c) => [c.id, c]));
    const dedMap = new Map(deducedColumns.map((d) => [d.id, d]));
    const items: Array<
      | { kind: 'native'; id: string; col: DatabaseColumn }
      | { kind: 'deduced'; id: string; dcol: DeducedPrepareColumn }
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
      setTableColumnOrder(PREPARE_ORDER_KEY, nextIds);
      const nextNative = extractReorderedNativeColumns(nextIds, columns);
      const nativeChanged = nextNative.some((c, i) => c.id !== columns[i]?.id);
      if (nativeChanged) {
        updateDatabaseColumns(IMPRO_DB_IDS.exercices, nextNative);
      }
    }
  );

  const scoreSortDir = getActiveScoreSortDir(sortRules);

  const { dragRowId, rowDropIndicator, getTrDropProps, getRowDragHandleProps } = useRowDrag(
    (sourceId, targetId, position) => {
      moveExerciseRank(sourceId, targetId, position, { scoreSortDir });
      triggerScoreHighlight(sourceId);
    }
  );

  const totalTableWidth = useMemo(() => {
    const colsSum = columns.reduce((acc, c) => acc + getColWidth(c, c.id === primaryCol.id), 0);
    const dedSum = deducedColumns.reduce((acc, d) => acc + getDeducedWidth(d), 0);
    return (
      (deleteSelectionMode ? PREP_SELECT_COL_WIDTH : 0) +
      PREP_REORDER_COL_WIDTH +
      PREP_ACTION_COL_WIDTH +
      colsSum +
      dedSum +
      PREP_FICHE_COL_WIDTH
    );
  }, [columns, deducedColumns, pageCustomWidths, primaryCol.id, deleteSelectionMode]);

  useEffect(() => {
    if (selectedDeleteIds.size === 0) return;
    const existing = new Set(exRows.map((r) => r.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedDeleteIds) {
      if (existing.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) {
      setSelectedDeleteIds(next);
      if (next.size === 0) setConfirmBulkDelete(false);
    }
  }, [exRows, selectedDeleteIds]);

  const visibleRowIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const selectedVisibleCount = useMemo(
    () => visibleRowIds.reduce((acc, id) => acc + (selectedDeleteIds.has(id) ? 1 : 0), 0),
    [visibleRowIds, selectedDeleteIds]
  );
  const allVisibleSelected =
    visibleRowIds.length > 0 && selectedVisibleCount === visibleRowIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleRowIds.length;

  useEffect(() => {
    if (selectAllDeleteRef.current) {
      selectAllDeleteRef.current.indeterminate = deleteSelectionMode && someVisibleSelected;
    }
  }, [deleteSelectionMode, someVisibleSelected]);

  const toggleDeleteSelectionMode = () => {
    setDeleteSelectionMode((prev) => {
      if (prev) {
        setSelectedDeleteIds(new Set());
        setConfirmBulkDelete(false);
        lastDeleteAnchorRef.current = null;
      }
      return !prev;
    });
  };

  const toggleDeleteRowSelection = (rowId: string, shiftKey: boolean) => {
    const targetChecked = !selectedDeleteIds.has(rowId);
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      const anchor = lastDeleteAnchorRef.current;
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
    lastDeleteAnchorRef.current = rowId;
    if (!targetChecked) setConfirmBulkDelete(false);
  };

  const toggleSelectAllVisibleDelete = () => {
    setSelectedDeleteIds((prev) => {
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
    if (deletingBulk || selectedDeleteIds.size === 0) return;
    const ids = Array.from(selectedDeleteIds);
    setDeletingBulk(true);
    try {
      await deleteDatabaseRows(IMPRO_DB_IDS.exercices, ids);
      onExercisesDeleted?.(ids);
      setSelectedDeleteIds(new Set());
      setConfirmBulkDelete(false);
      setDeleteSelectionMode(false);
      lastDeleteAnchorRef.current = null;
    } finally {
      setDeletingBulk(false);
    }
  };

  const toggleHeaderSort = (colId: string) => {
    const idx = sortRules.findIndex((r) => r.colId === colId);
    if (idx === -1) {
      onSortRulesChange([...sortRules, { colId, dir: 'asc' }]);
      return;
    }
    const cur = sortRules[idx];
    if (cur.dir === 'asc') {
      onSortRulesChange(sortRules.map((r, i) => (i === idx ? { ...r, dir: 'desc' } : r)));
    } else {
      onSortRulesChange(sortRules.filter((_, i) => i !== idx));
    }
  };

  const addSortRule = () => {
    const used = new Set(sortRules.map((r) => r.colId));
    const targetId = sortableColumns.find((c) => !used.has(c.id))?.id ?? sortableColumns[0]?.id;
    if (!targetId) return;
    onSortRulesChange([...sortRules, { colId: targetId, dir: 'asc' }]);
    setShowSortPanel(true);
  };

  const moveSortRule = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sortRules.length) return;
    const next = [...sortRules];
    [next[index], next[target]] = [next[target], next[index]];
    onSortRulesChange(next);
  };

  const hasFilters = Boolean(
    searchQuery || etapeFilter || tagFilter || onlyCheck1 || onlyCheck2 || onlyCheckV
  );

  const resetFilters = () => {
    setSearchQuery('');
    setEtapeFilter('');
    setTagFilter('');
    setOnlyCheck1(false);
    setOnlyCheck2(false);
    setOnlyCheckV(false);
  };

  const seanceRowById = useMemo(
    () => new Map((rowsByPage[IMPRO_DB_IDS.seances] ?? []).map((r) => [r.id, r])),
    [rowsByPage]
  );

  const startEditingName = (row: DatabaseRow) => {
    setEditingNameRowId(row.id);
    setEditingNameDraft(String(row.cells[primaryCol.id] ?? ''));
  };

  const commitEditingName = (row: DatabaseRow) => {
    if (editingNameRowId !== row.id) return;
    const prevVal = String(row.cells[primaryCol.id] ?? '');
    if (editingNameDraft !== prevVal) {
      updateDatabaseRow(IMPRO_DB_IDS.exercices, row.id, {
        ...row.cells,
        [primaryCol.id]: editingNameDraft,
      });
    }
    setEditingNameRowId(null);
  };

  const renderDataCell = (
    row: DatabaseRow,
    col: DatabaseColumn,
    isPrimary: boolean,
    isRowExpanded: boolean
  ) => {
    const computed = computedByRowId.get(row.id);
    const val = (computed?.cells ?? row.cells)[col.id];
    const suggestion = suggestionByExId.get(row.id);

    if (isPrimary) {
      const rowLabel = String(val ?? '') || 'Exercice';
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
              placeholder="Exercice"
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
        <div className={isRowExpanded ? 'space-y-0.5 min-w-0' : 'min-w-0'}>
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
                {rowLabel}
              </span>
            </button>
            {!isRowExpanded && suggestion?.isPlannedInGroup && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0 whitespace-nowrap">
                · Prévu
              </span>
            )}
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
          </div>
          {isRowExpanded && suggestion?.isPlannedInGroup && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400 pl-5">Déjà prévu</div>
          )}
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(val)}
          onChange={(e) =>
            updateDatabaseRow(IMPRO_DB_IDS.exercices, row.id, {
              ...row.cells,
              [col.id]: e.target.checked,
            })
          }
          aria-label={`${col.name} pour ${String(row.cells[primaryCol.id] ?? 'exercice')}`}
          className="w-4 h-4 accent-indigo-600 cursor-pointer"
        />
      );
    }

    if (col.id === IMPRO_COL_IDS.exercices.score) {
      const rowLabel = String(row.cells[primaryCol.id] ?? 'exercice');
      return (
        <ScoreRankInput
          value={val}
          maxRank={Math.max(1, exRows.length)}
          highlighted={highlightedScoreRowId === row.id}
          ariaLabel={`Score de classement pour ${rowLabel}`}
          onCommit={(nextRank) => {
            setExerciseScore(row.id, nextRank);
            triggerScoreHighlight(row.id);
          }}
        />
      );
    }

    if (col.type === 'formula' || col.type === 'rollup') {
      const formatted = formatCellText(col, val, pages, rowsByPage);
      const isNum = typeof val === 'number' || typeof val === 'boolean';
      return (
        <span
          className={`text-xs block truncate ${
            isNum ? 'font-mono tabular-nums' : ''
          } text-slate-700 dark:text-slate-300`}
        >
          {formatted || '—'}
        </span>
      );
    }

    if (col.type === 'multi_select') {
      const rawTags = Array.isArray(val)
        ? val.map(String).filter(Boolean)
        : typeof val === 'string' && val.trim()
          ? val.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const optionIndex = new Map((col.options ?? []).map((opt, idx) => [opt, idx]));
      const sortedTags = [...rawTags].sort((a, b) => {
        const ra = optionIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
        const rb = optionIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
        return ra - rb;
      });
      if (sortedTags.length === 0) {
        return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
      }
      return (
        <span
          className={`text-xs text-slate-700 dark:text-slate-300 block ${
            isRowExpanded ? 'whitespace-normal break-words leading-relaxed' : 'truncate leading-6'
          }`}
        >
          {sortedTags.join(' · ')}
        </span>
      );
    }

    if (col.type === 'relation') {
      const ids = Array.isArray(val) ? val.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
      }
      const targetPageId = col.relationTargetPageId ?? IMPRO_DB_IDS.seances;
      const targetRows = targetPageId === IMPRO_DB_IDS.seances ? null : rowsByPage[targetPageId] ?? [];
      const shownIds = isRowExpanded ? ids.slice(0, 12) : ids.slice(0, 1);
      const remaining = ids.length - shownIds.length;
      return (
        <div
          className={
            isRowExpanded
              ? 'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs'
              : 'flex flex-nowrap items-center gap-1.5 min-w-0 overflow-hidden h-6 text-xs'
          }
        >
          {shownIds.map((rid) => {
            let label = rid;
            if (targetPageId === IMPRO_DB_IDS.seances) {
              const sRow = seanceRowById.get(rid);
              label = sRow
                ? String(sRow.cells[IMPRO_COL_IDS.seances.nom] ?? rid)
                : improModel.seanceById.get(rid)?.nom ?? rid;
            } else if (targetRows) {
              const tRow = targetRows.find((tr) => tr.id === rid);
              if (tRow) {
                const firstText = Object.values(tRow.cells).find(
                  (v) => typeof v === 'string' && v.trim()
                );
                if (typeof firstText === 'string') label = firstText;
              }
            }
            return (
              <button
                key={rid}
                type="button"
                onClick={() => openImproDetail(targetPageId, rid)}
                className="text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 underline decoration-slate-300 dark:decoration-slate-700 truncate max-w-[130px] min-w-0"
              >
                {label}
              </button>
            );
          })}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() =>
                isRowExpanded
                  ? openImproDetail(IMPRO_DB_IDS.exercices, row.id)
                  : toggleRowExpanded(row.id)
              }
              className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
              title={
                isRowExpanded
                  ? 'Voir toutes les relations sur la fiche'
                  : 'Déplier pour voir toutes les relations'
              }
            >
              +{remaining}
            </button>
          )}
        </div>
      );
    }

    const isDesc =
      col.id === IMPRO_COL_IDS.exercices.description ||
      col.name.toLowerCase().includes('description');
    const textVal = formatCellText(col, val, pages, rowsByPage).trim();
    if (isDesc) {
      if (!isRowExpanded) {
        return textVal ? (
          <button
            type="button"
            onClick={() => toggleRowExpanded(row.id)}
            title={textVal}
            className="w-full h-6 text-left text-xs leading-6 text-slate-600 dark:text-slate-400 truncate block cursor-pointer hover:text-slate-900 dark:hover:text-slate-200"
          >
            {textVal}
          </button>
        ) : (
          <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
        );
      }
      return textVal ? (
        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-relaxed">
          {textVal}
        </p>
      ) : (
        <span className="text-xs text-slate-300 dark:text-slate-700">—</span>
      );
    }
    return (
      <span
        className={`text-xs text-slate-700 dark:text-slate-300 block ${
          isRowExpanded ? 'whitespace-normal break-words leading-relaxed' : 'truncate leading-6'
        }`}
      >
        {textVal || '—'}
      </span>
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
    <div className="space-y-3">
      {/* Barre de filtres et nouveauté */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'all_new', label: `Inédits (${bucketCounts.allNew})` },
                { id: 'majority', label: `Majorité (${bucketCounts.majority})` },
                { id: 'done', label: `Faits (${bucketCounts.done})` },
                { id: 'all', label: `Tous (${bucketCounts.all})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNoveltyTab(tab.id)}
                className={`py-1 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  noveltyTab === tab.id
                    ? 'bg-white dark:bg-slate-950 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer Biblimpro..."
              aria-label="Filtrer les exercices Biblimpro"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={etapeFilter}
            onChange={(e) => setEtapeFilter(e.target.value)}
            aria-label="Filtrer par étape"
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="">Toutes étapes</option>
            {improModel.allEtapes.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filtrer par tag"
            className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500 max-w-[170px]"
          >
            <option value="">Tous tags</option>
            {improModel.allTags.map((tg) => (
              <option key={tg} value={tg}>
                {tg}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden text-xs">
            {(
              [
                { label: '1', active: onlyCheck1, toggle: () => setOnlyCheck1((v) => !v) },
                { label: '2', active: onlyCheck2, toggle: () => setOnlyCheck2((v) => !v) },
                { label: 'V', active: onlyCheckV, toggle: () => setOnlyCheckV((v) => !v) },
              ] as const
            ).map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.toggle}
                aria-label={`Filtrer coche ${btn.label}`}
                aria-pressed={btn.active}
                className={`h-9 px-2.5 font-mono transition-colors ${
                  btn.active
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 px-2.5 rounded-lg text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
            >
              Réinitialiser
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSortPanel((v) => !v)}
            className={`h-9 px-3 rounded-lg border text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              sortRules.length > 0 || showSortPanel
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>{sortRules.length > 0 ? `Tri (${sortRules.length})` : 'Trier'}</span>
          </button>

          {hasCustomWidths && (
            <button
              type="button"
              onClick={() => resetColumnWidth(IMPRO_DB_IDS.exercices)}
              aria-label="Réinitialiser les largeurs de colonnes"
              className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Largeurs</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleDeleteSelectionMode}
            aria-pressed={deleteSelectionMode}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              deleteSelectionMode
                ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleteSelectionMode ? 'Fermer sélection' : 'Supprimer des exercices'}</span>
          </button>

          <button
            type="button"
            disabled={randomCandidates.length === 0}
            onClick={() => onPickRandom(randomCandidates)}
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Shuffle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Hasard</span>
          </button>
        </div>
      </div>

      {/* Résumé compact du tri actif */}
      {sortRules.length > 0 && !showSortPanel && (
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
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-indigo-400 inline-flex items-center gap-1"
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
            onClick={() => onSortRulesChange([])}
            aria-label="Effacer le tri"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Configurateur tri multi-colonnes */}
      {showSortPanel && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Tri par priorité
            </span>
            <div className="flex items-center gap-2">
              {sortRules.length < sortableColumns.length && (
                <button
                  type="button"
                  onClick={addSortRule}
                  className="h-7 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Critère</span>
                </button>
              )}
              {sortRules.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSortRulesChange([])}
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
                className="h-7 px-2.5 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
          </div>

          {sortRules.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aucun critère actif. Ajoutez un critère ou cliquez sur les en-têtes du tableau.
            </p>
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
                            onSortRulesChange(next);
                          } else {
                            onSortRulesChange(
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
                          onSortRulesChange(
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
                            onSortRulesChange(sortRules.filter((_, i) => i !== idx));
                          }}
                          aria-label={`Retirer critère ${idx + 1}`}
                          className="w-7 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingChoices && targetCol && exPage && (
                      <div className="pl-8 max-w-md">
                        <ChoiceOrderEditor
                          choices={collectChoices(targetCol, exRows)}
                          onChange={(nextOptions) =>
                            updateDatabaseColumns(
                              exPage.id,
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

      {/* Barre d'action suppression multiple */}
      {deleteSelectionMode && (
        <div className="px-3.5 py-2.5 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/25 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-medium text-red-900 dark:text-red-200 font-mono tabular-nums">
              {selectedDeleteIds.size > 0
                ? `${selectedDeleteIds.size} ${
                    selectedDeleteIds.size > 1
                      ? 'exercices sélectionnés'
                      : 'exercice sélectionné'
                  }`
                : 'Cochez les exercices à supprimer (Maj+clic pour une plage)'}
            </span>
            {visibleRows.length > 0 && (
              <button
                type="button"
                disabled={deletingBulk}
                onClick={toggleSelectAllVisibleDelete}
                className="px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/80 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-50 whitespace-nowrap"
              >
                {allVisibleSelected
                  ? 'Tout désélectionner'
                  : `Tout sélectionner (${visibleRows.length})`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedDeleteIds.size > 0 &&
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
                      : `Confirmer la suppression (${selectedDeleteIds.size})`}
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
                  <span>Supprimer ({selectedDeleteIds.size})</span>
                </button>
              ))}
            <button
              type="button"
              disabled={deletingBulk}
              onClick={toggleDeleteSelectionMode}
              className="h-8 px-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-red-100/70 dark:hover:bg-red-900/40 disabled:opacity-50 whitespace-nowrap"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Tableau complet */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/40">
        <table
          className="table-fixed border-collapse text-left"
          style={{ width: `max(100%, ${totalTableWidth}px)` }}
        >
          <colgroup>
            {deleteSelectionMode && <col style={{ width: `${PREP_SELECT_COL_WIDTH}px` }} />}
            <col style={{ width: `${PREP_REORDER_COL_WIDTH}px` }} />
            <col style={{ width: `${PREP_ACTION_COL_WIDTH}px` }} />
            {displayColumns.map((item) => {
              if (item.kind === 'native') {
                const w = getColWidth(item.col, item.col.id === primaryCol.id);
                return <col key={item.id} style={{ width: `${w}px` }} />;
              }
              return <col key={item.id} style={{ width: `${getDeducedWidth(item.dcol)}px` }} />;
            })}
            <col style={{ width: `${PREP_FICHE_COL_WIDTH}px` }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900">
              {deleteSelectionMode && (
                <th className="px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center">
                  <input
                    ref={selectAllDeleteRef}
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={visibleRows.length === 0 || deletingBulk}
                    onChange={toggleSelectAllVisibleDelete}
                    aria-label="Tout sélectionner dans la liste des exercices"
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-1.5 py-2.5 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                Ordre
              </th>
              <th className="px-3 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">
                Séance
              </th>
              {displayColumns.map((item) => {
                const isDragging = dragColId === item.id;
                const dropSide = dropIndicator?.colId === item.id ? dropIndicator.position : null;

                if (item.kind === 'native') {
                  const col = item.col;
                  const isPrimary = col.id === primaryCol.id;
                  const colWidth = getColWidth(col, isPrimary);
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
                      </div>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner ${col.name}`}
                        onPointerDown={(e) => startColumnResize(e, col.id, colWidth, minWidth)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          resetColumnWidth(IMPRO_DB_IDS.exercices, col.id);
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
                        resetColumnWidth(IMPRO_DB_IDS.exercices, dcol.id);
                      }}
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/30 z-10"
                    />
                  </th>
                );
              })}
              <th className="px-2 py-2.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                Fiche
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={displayColumns.length + 3 + (deleteSelectionMode ? 1 : 0)}
                  className="px-4 py-10 text-center text-xs text-slate-500"
                >
                  Aucun exercice dans cette sélection. Essayez « Tous » ou réinitialisez les filtres.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIdx) => {
                const isAdded = selectedExIds.has(row.id);
                const isDeleteSelected = deleteSelectionMode && selectedDeleteIds.has(row.id);
                const sug = suggestionByExId.get(row.id);
                const rowLabel = String(row.cells[primaryCol.id] ?? 'Exercice');
                const isDraggingRow = dragRowId === row.id;
                const rowDropPos =
                  rowDropIndicator?.rowId === row.id ? rowDropIndicator.position : null;
                const dropShadowClass =
                  rowDropPos === 'before'
                    ? 'shadow-[inset_0_2px_0_0_rgb(79,70,229)]'
                    : rowDropPos === 'after'
                      ? 'shadow-[inset_0_-2px_0_0_rgb(79,70,229)]'
                      : '';
                const isRowExpanded = expandedRowIds.has(row.id) || editingNameRowId === row.id;
                const cellPadAlign = isRowExpanded ? 'py-2.5 align-top' : 'py-1.5 align-middle';
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    {...getTrDropProps(row.id)}
                    className={`group/row transition-colors ${dropShadowClass} ${
                      isDraggingRow ? 'opacity-45' : ''
                    } ${
                      isDeleteSelected
                        ? 'bg-red-50/60 dark:bg-red-950/20'
                        : isAdded
                          ? 'bg-indigo-50/45 dark:bg-indigo-950/20'
                          : isRowExpanded
                            ? 'bg-indigo-50/25 dark:bg-indigo-950/15'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/40'
                    }`}
                  >
                    {deleteSelectionMode && (
                      <td
                        className={`px-2 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800 text-center`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDeleteIds.has(row.id)}
                          disabled={deletingBulk}
                          onChange={(e) =>
                            toggleDeleteRowSelection(
                              row.id,
                              Boolean((e.nativeEvent as MouseEvent | undefined)?.shiftKey)
                            )
                          }
                          aria-label={`Sélectionner ${rowLabel} pour suppression`}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-red-600 cursor-pointer"
                        />
                      </td>
                    )}
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
                    <td
                      className={`px-2.5 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleExercise(row.id)}
                        aria-label={isAdded ? `Retirer ${rowLabel}` : `Ajouter ${rowLabel}`}
                        className={`w-full h-7 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                          isAdded
                            ? 'border border-red-200 dark:border-red-900/70 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50'
                            : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Minus className="w-3 h-3" />
                            <span>Retirer</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Ajouter</span>
                          </>
                        )}
                      </button>
                    </td>

                    {displayColumns.map((item) => {
                      if (item.kind === 'native') {
                        const col = item.col;
                        const isPrimary = col.id === primaryCol.id;
                        return (
                          <td
                            key={col.id}
                            className={`${cellPadAlign} border-r border-slate-200 dark:border-slate-800 overflow-hidden ${
                              col.type === 'checkbox' ? 'px-1.5 text-center' : 'px-3'
                            }`}
                          >
                            {renderDataCell(row, col, isPrimary, isRowExpanded)}
                          </td>
                        );
                      }

                      const dcol = item.dcol;
                      if (dcol.id === NOVELTY_COL_ID) {
                        return (
                          <td
                            key={dcol.id}
                            className={`px-3 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800 font-mono tabular-nums text-xs whitespace-nowrap overflow-hidden ${
                              sug?.noveltyBucket === 'all_new'
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : sug?.noveltyBucket === 'majority_new' ||
                                    sug?.noveltyBucket === 'mixed'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {dcol.render(row)}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={dcol.id}
                          className={`px-3 ${cellPadAlign} border-r border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 overflow-hidden ${
                            !dcol.renderNode && !isRowExpanded ? 'truncate ' : ''
                          }${dcol.numeric || dcol.mono ? 'font-mono tabular-nums' : ''}`}
                        >
                          {dcol.renderNode ? dcol.renderNode(row, isRowExpanded) : dcol.render(row)}
                        </td>
                      );
                    })}

                    <td className={`px-2 ${cellPadAlign} text-center`}>
                      <button
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, row.id)}
                        aria-label={`Fiche ${rowLabel}`}
                        className="h-7 px-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>Fiche</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {filteredAndSortedRows.length > visibleRows.length && (
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              {visibleRows.length} / {filteredAndSortedRows.length} lignes
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
  );
}
