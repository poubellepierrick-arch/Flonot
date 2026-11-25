import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseRow, WorkspacePage } from '../types/workspace';
import {
  getOriginLabel,
  pushDetailTrailEntry,
  resolveTrailEntryLabel,
  truncateDetailTrailTo,
} from './detailTrail';

const pages: WorkspacePage[] = [
  {
    id: 'db_seances',
    workspaceId: 'local',
    ownerId: 'local',
    parentId: null,
    title: 'Séances',
    icon: '📅',
    type: 'database',
    isFavorite: false,
    isTrashed: false,
    order: 0,
    source: 'native',
    blocks: [],
    columns: [{ id: 'col_nom', name: 'Nom', type: 'text' }],
  },
];

const rowsByPage: Record<string, DatabaseRow[]> = {
  db_seances: [
    {
      id: 'row_1',
      pageId: 'db_seances',
      workspaceId: 'local',
      ownerId: 'local',
      order: 0,
      cells: { col_nom: 'Atelier Mardi' },
    },
    {
      id: 'row_2',
      pageId: 'db_seances',
      workspaceId: 'local',
      ownerId: 'local',
      order: 1,
      cells: { col_nom: '' },
    },
  ],
};

test('getOriginLabel resolves mainView and page titles in French', () => {
  assert.equal(getOriginLabel({ mainView: 'prepare', activePageId: null }, pages), 'Préparer');
  assert.equal(getOriginLabel({ mainView: 'chronology', activePageId: null }, pages), 'Chronologie');
  assert.equal(getOriginLabel({ mainView: 'page', activePageId: 'db_seances' }, pages), 'Séances');
});

test('resolveTrailEntryLabel handles live row title and blank fallback', () => {
  assert.equal(
    resolveTrailEntryLabel({ pageId: 'db_seances', rowId: 'row_1' }, pages, rowsByPage),
    'Atelier Mardi'
  );
  assert.equal(
    resolveTrailEntryLabel({ pageId: 'db_seances', rowId: 'row_2' }, pages, rowsByPage),
    'Sans titre'
  );
});

test('pushDetailTrailEntry saves previous scrollTop, prevents duplicates, and truncates cycles cleanly', () => {
  const t1 = pushDetailTrailEntry([], { pageId: 'db_seances', rowId: 'row_1' });
  assert.equal(t1.length, 1);

  const t2 = pushDetailTrailEntry(t1, { pageId: 'db_exos', rowId: 'ex_1' }, 240);
  assert.equal(t2.length, 2);
  assert.equal(t2[0].panelScrollTop, 240);

  const t3 = pushDetailTrailEntry(t2, { pageId: 'db_pars', rowId: 'par_1' }, 115);
  assert.equal(t3.length, 3);
  assert.equal(t3[1].panelScrollTop, 115);

  // Navigating back to an existing trail item truncates without creating a cycle
  const backToEx = pushDetailTrailEntry(t3, { pageId: 'db_exos', rowId: 'ex_1' }, 50);
  assert.equal(backToEx.length, 2);
  assert.equal(backToEx[1].panelScrollTop, 115);
});

test('truncateDetailTrailTo slices trail and returns restored scrollTop', () => {
  const trail = [
    { pageId: 'db_seances', rowId: 'row_1', panelScrollTop: 180 },
    { pageId: 'db_exos', rowId: 'ex_1', panelScrollTop: 90 },
    { pageId: 'db_pars', rowId: 'par_1', panelScrollTop: 0 },
  ];
  const res = truncateDetailTrailTo(trail, 0);
  assert.equal(res.nextTrail.length, 1);
  assert.equal(res.restoredScrollTop, 180);
});
