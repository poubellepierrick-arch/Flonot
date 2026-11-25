import type {
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  DatabaseSortRule,
  WorkspacePage,
} from '../types/workspace';
import { sortDatabaseRows, type SortableDeducedColumn } from './databaseSort';
import { formatCellText } from './notionFormula';

export function computeTopRowOrder(rows: DatabaseRow[]): number {
  if (rows.length === 0) return 0;
  let min = rows[0].order;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].order < min) min = rows[i].order;
  }
  return min - 1;
}

export function computeBottomRowOrder(rows: DatabaseRow[]): number {
  if (rows.length === 0) return 0;
  let max = rows[0].order;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].order > max) max = rows[i].order;
  }
  return max + 1;
}

export function buildInitialRowCells(
  columns: DatabaseColumn[],
  initialCells: Record<string, CellValue> = {}
): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  for (const col of columns) {
    if (col.id in initialCells) {
      const val = initialCells[col.id];
      cells[col.id] = Array.isArray(val) ? [...val] : val;
    } else if (col.type === 'checkbox') {
      cells[col.id] = false;
    } else if (col.type === 'multi_select' || col.type === 'relation') {
      cells[col.id] = [];
    } else if (col.type === 'select' && col.options && col.options.length > 0) {
      cells[col.id] = col.options[0];
    } else {
      cells[col.id] = '';
    }
  }
  for (const [key, val] of Object.entries(initialCells)) {
    if (!(key in cells)) {
      cells[key] = Array.isArray(val) ? [...val] : val;
    }
  }
  return cells;
}

function normalizeCellForComparison(val: CellValue | undefined): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    return val.map((v) => String(v ?? '').trim()).filter(Boolean).join('|');
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
  return String(val).trim();
}

export function hasRowChangedFromDraft(
  currentCells: Record<string, CellValue>,
  initialCells: Record<string, CellValue>
): boolean {
  const keys = new Set([...Object.keys(currentCells), ...Object.keys(initialCells)]);
  for (const key of keys) {
    if (normalizeCellForComparison(currentCells[key]) !== normalizeCellForComparison(initialCells[key])) {
      return true;
    }
  }
  return false;
}

export interface OrderAndFilterDatabaseRowsInput {
  rows: DatabaseRow[];
  draftSnapshots: Map<string, Record<string, CellValue>>;
  filterQuery: string;
  sortRules: DatabaseSortRule[];
  columns: DatabaseColumn[];
  deducedColumns: SortableDeducedColumn[];
  computedCellsMap: Map<string, Record<string, CellValue>>;
  pages: WorkspacePage[];
  rowsByPage: Record<string, DatabaseRow[]>;
  activeRowId: string | null;
  showAllRows: boolean;
  pageLimit?: number;
}

export interface OrderAndFilterDatabaseRowsResult {
  filteredRows: DatabaseRow[];
  visibleRows: DatabaseRow[];
  untouchedDraftIds: Set<string>;
}

export function orderAndFilterDatabaseRows(
  input: OrderAndFilterDatabaseRowsInput
): OrderAndFilterDatabaseRowsResult {
  const {
    rows,
    draftSnapshots,
    filterQuery,
    sortRules,
    columns,
    deducedColumns,
    computedCellsMap,
    pages,
    rowsByPage,
    activeRowId,
    showAllRows,
    pageLimit = 120,
  } = input;

  const untouchedDraftRows: DatabaseRow[] = [];
  const untouchedDraftIds = new Set<string>();
  const regularRows: DatabaseRow[] = [];

  for (const row of rows) {
    const initial = draftSnapshots.get(row.id);
    if (initial && !hasRowChangedFromDraft(row.cells, initial)) {
      untouchedDraftRows.push(row);
      untouchedDraftIds.add(row.id);
    } else {
      regularRows.push(row);
    }
  }

  const q = filterQuery.trim().toLowerCase();
  const matchingRegular = !q
    ? regularRows
    : regularRows.filter((row) => {
        const computed = computedCellsMap.get(row.id) ?? row.cells;
        return columns.some((col) =>
          formatCellText(col, computed[col.id], pages, rowsByPage).toLowerCase().includes(q)
        );
      });

  const sortedRegular =
    sortRules.length > 0
      ? sortDatabaseRows(
          matchingRegular,
          sortRules,
          columns,
          deducedColumns,
          computedCellsMap,
          pages,
          rowsByPage
        )
      : [...matchingRegular].sort((a, b) => a.order - b.order);

  const filteredRows = [...untouchedDraftRows, ...sortedRegular];

  if (showAllRows || q.length > 0 || filteredRows.length <= pageLimit) {
    return { filteredRows, visibleRows: filteredRows, untouchedDraftIds };
  }

  // Si la ligne en cours de saisie (modifiée) a été classée au-delà de la tranche initiale,
  // étend la tranche jusqu'à l'inclure afin qu'elle reste visible à son nouveau rang trié.
  let sliceLimit = pageLimit;
  if (activeRowId) {
    const activeIdx = filteredRows.findIndex((r) => r.id === activeRowId);
    if (activeIdx >= sliceLimit) {
      sliceLimit = activeIdx + 1;
    }
  }

  return {
    filteredRows,
    visibleRows: filteredRows.slice(0, sliceLimit),
    untouchedDraftIds,
  };
}
