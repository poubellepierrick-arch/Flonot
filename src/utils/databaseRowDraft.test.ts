import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatabaseColumn, DatabaseRow, WorkspacePage } from '../types/workspace';
import {
  buildInitialRowCells,
  computeBottomRowOrder,
  computeTopRowOrder,
  hasRowChangedFromDraft,
  orderAndFilterDatabaseRows,
} from './databaseRowDraft';

function makeRow(id: string, order: number, name: string, tag = ''): DatabaseRow {
  return {
    id,
    pageId: 'db_1',
    workspaceId: 'ws_1',
    ownerId: 'u_1',
    order,
    cells: { col_name: name, col_tag: tag },
  };
}

const COLS: DatabaseColumn[] = [
  { id: 'col_name', name: 'Nom', type: 'text' },
  { id: 'col_tag', name: 'Statut', type: 'select', options: ['À faire', 'Terminé'] },
];

const PAGES: WorkspacePage[] = [
  {
    id: 'db_1',
    workspaceId: 'ws_1',
    ownerId: 'u_1',
    parentId: null,
    title: 'Test DB',
    icon: '⊞',
    type: 'database',
    isFavorite: false,
    isTrashed: false,
    order: 0,
    source: 'native',
    blocks: [],
    columns: COLS,
  },
];

describe('databaseRowDraft', () => {
  it('calculates top and bottom order cleanly across empty and non-empty rows', () => {
    assert.equal(computeTopRowOrder([]), 0);
    assert.equal(computeBottomRowOrder([]), 0);
    const rows = [makeRow('r1', 0, 'Alpha'), makeRow('r2', 5, 'Beta')];
    assert.equal(computeTopRowOrder(rows), -1);
    assert.equal(computeBottomRowOrder(rows), 6);
  });

  it('pins an untouched draft at index 0 even when filter, sort, and 120-row truncation are active', () => {
    const existing: DatabaseRow[] = Array.from({ length: 150 }, (_, idx) =>
      makeRow(`r_${idx}`, idx, `Item ${String(idx).padStart(3, '0')}`, 'À faire')
    );
    const initialCells = buildInitialRowCells(COLS);
    const draftRow: DatabaseRow = {
      id: 'r_new',
      pageId: 'db_1',
      workspaceId: 'ws_1',
      ownerId: 'u_1',
      order: -1,
      cells: { ...initialCells },
    };

    const allRows = [draftRow, ...existing];
    const draftSnapshots = new Map([[draftRow.id, initialCells]]);
    assert.equal(hasRowChangedFromDraft(draftRow.cells, initialCells), false);

    const resWithFilterAndSort = orderAndFilterDatabaseRows({
      rows: allRows,
      draftSnapshots,
      filterQuery: 'Item 140',
      sortRules: [{ colId: 'col_name', dir: 'desc' }],
      columns: COLS,
      deducedColumns: [],
      computedCellsMap: new Map(),
      pages: PAGES,
      rowsByPage: { db_1: allRows },
      activeRowId: draftRow.id,
      showAllRows: false,
    });

    assert.equal(resWithFilterAndSort.visibleRows[0]?.id, 'r_new');
    assert.equal(resWithFilterAndSort.visibleRows[1]?.id, 'r_140');
    assert.ok(resWithFilterAndSort.untouchedDraftIds.has('r_new'));
  });

  it('re-places the new row dynamically according to sort and filter once edited', () => {
    const alpha = makeRow('r_a', 0, 'Alpha', 'À faire');
    const charlie = makeRow('r_c', 1, 'Charlie', 'À faire');
    const initialCells = buildInitialRowCells(COLS);
    const editedNewRow: DatabaseRow = {
      id: 'r_new',
      pageId: 'db_1',
      workspaceId: 'ws_1',
      ownerId: 'u_1',
      order: -1,
      cells: { col_name: 'Bravo', col_tag: 'À faire' },
    };

    assert.equal(hasRowChangedFromDraft(editedNewRow.cells, initialCells), true);
    const allRows = [editedNewRow, alpha, charlie];
    const draftSnapshots = new Map([[editedNewRow.id, initialCells]]);

    // Sorted A -> Z: Alpha, Bravo, Charlie
    const sortedRes = orderAndFilterDatabaseRows({
      rows: allRows,
      draftSnapshots,
      filterQuery: '',
      sortRules: [{ colId: 'col_name', dir: 'asc' }],
      columns: COLS,
      deducedColumns: [],
      computedCellsMap: new Map(),
      pages: PAGES,
      rowsByPage: { db_1: allRows },
      activeRowId: editedNewRow.id,
      showAllRows: false,
    });

    assert.deepEqual(
      sortedRes.visibleRows.map((r) => r.id),
      ['r_a', 'r_new', 'r_c']
    );

    // Filter active that excludes 'Bravo' should hide it cleanly from filtered view
    const filteredOutRes = orderAndFilterDatabaseRows({
      rows: allRows,
      draftSnapshots,
      filterQuery: 'Charlie',
      sortRules: [{ colId: 'col_name', dir: 'asc' }],
      columns: COLS,
      deducedColumns: [],
      computedCellsMap: new Map(),
      pages: PAGES,
      rowsByPage: { db_1: allRows },
      activeRowId: editedNewRow.id,
      showAllRows: false,
    });

    assert.deepEqual(
      filteredOutRes.visibleRows.map((r) => r.id),
      ['r_c']
    );
  });

  it('keeps an edited row visible even if sorted beyond the 120-row initial page slice', () => {
    const existing: DatabaseRow[] = Array.from({ length: 130 }, (_, idx) =>
      makeRow(`r_${idx}`, idx, `A_${String(idx).padStart(3, '0')}`, 'À faire')
    );
    const initialCells = buildInitialRowCells(COLS);
    const zRow: DatabaseRow = {
      id: 'r_z',
      pageId: 'db_1',
      workspaceId: 'ws_1',
      ownerId: 'u_1',
      order: -1,
      cells: { col_name: 'Zèbre', col_tag: 'À faire' },
    };
    const allRows = [zRow, ...existing];
    const res = orderAndFilterDatabaseRows({
      rows: allRows,
      draftSnapshots: new Map([[zRow.id, initialCells]]),
      filterQuery: '',
      sortRules: [{ colId: 'col_name', dir: 'asc' }],
      columns: COLS,
      deducedColumns: [],
      computedCellsMap: new Map(),
      pages: PAGES,
      rowsByPage: { db_1: allRows },
      activeRowId: zRow.id,
      showAllRows: false,
    });

    assert.equal(res.visibleRows[res.visibleRows.length - 1]?.id, 'r_z');
    assert.equal(res.visibleRows.length, 131);
  });
});
