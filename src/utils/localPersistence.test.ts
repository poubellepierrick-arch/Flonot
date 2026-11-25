import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLocalWorkspaceStorage,
  loadLocalWorkspaceFromStorage,
  parseWorkspaceSnapshot,
  saveLocalWorkspaceToStorage,
  serializeWorkspaceSnapshot,
} from './localPersistence';
import { createSeedWorkspace } from './seedWorkspace';

test('serializeWorkspaceSnapshot & parseWorkspaceSnapshot round-trip cleanly', () => {
  const seed = createSeedWorkspace('local', 'local');
  const json = serializeWorkspaceSnapshot(seed.pages, seed.rowsByPage, seed.pages[0]?.id);
  const parsed = parseWorkspaceSnapshot(json);
  assert.ok(parsed);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.pages.length, seed.pages.length);
  assert.equal(parsed.activePageId, seed.pages[0]?.id);
});

test('parseWorkspaceSnapshot rejects invalid or empty payloads safely', () => {
  assert.equal(parseWorkspaceSnapshot(null), null);
  assert.equal(parseWorkspaceSnapshot('not json'), null);
  assert.equal(parseWorkspaceSnapshot(JSON.stringify({ pages: [], rowsByPage: {} })), null);
});

test('storage helpers save, load, and clear snapshot', () => {
  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  const seed = createSeedWorkspace('local', 'local');
  assert.equal(saveLocalWorkspaceToStorage(seed.pages, seed.rowsByPage, 'page_bienvenue', mockStorage), true);
  const loaded = loadLocalWorkspaceFromStorage(mockStorage);
  assert.ok(loaded);
  assert.equal(loaded.pages.length, seed.pages.length);
  clearLocalWorkspaceStorage(mockStorage);
  assert.equal(loadLocalWorkspaceFromStorage(mockStorage), null);
});

test('parseWorkspaceSnapshot préserve blocks et comments sur les lignes de base de données', () => {
  const seed = createSeedWorkspace('local', 'local');
  const rowsByPage = {
    ...seed.rowsByPage,
    db_test: [
      {
        id: 'row_1',
        pageId: 'db_test',
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: { col_titre: 'Traversée' },
        blocks: [
          { id: 'b1', type: 'audio' as const, url: 'https://cdn.example.com/track.mp3', content: 'Piste' },
        ],
        comments: [
          { id: 'c1', authorName: 'Paul', content: 'Top pour lancer la séance', createdAt: '2026-11-23T10:00:00.000Z' },
        ],
      },
    ],
  };
  const parsed = parseWorkspaceSnapshot(serializeWorkspaceSnapshot(seed.pages, rowsByPage, null));
  assert.ok(parsed);
  assert.equal(parsed.rowsByPage.db_test[0]?.blocks?.[0]?.type, 'audio');
  assert.equal(parsed.rowsByPage.db_test[0]?.comments?.[0]?.content, 'Top pour lancer la séance');
});

test('loadStoredViewSettings, saveStoredViewSettings et clearStoredViewSettings persistent les réglages de page', async () => {
  const {
    clearStoredViewSettings,
    loadStoredViewSettings,
    saveStoredViewSettings,
  } = await import('./localPersistence');
  const { createDefaultWorkspaceViewSettings } = await import('./viewSettings');

  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };

  const state = createDefaultWorkspaceViewSettings('2026-11-24');
  state.nav = { mainView: 'page', activePageId: 'db_impro_exercices' };
  state.databaseByPageId.db_impro_exercices = {
    filterQuery: 'chaise',
    notionSyncFilter: 'synced',
    showAllRows: true,
  };
  state.prepare.session.nom = 'Atelier Jeudi';
  state.prepare.tableFilters.onlyCheckV = true;

  assert.equal(saveStoredViewSettings(state, mockStorage), true);
  const loaded = loadStoredViewSettings(mockStorage);
  assert.equal(loaded.nav.mainView, 'page');
  assert.equal(loaded.nav.activePageId, 'db_impro_exercices');
  assert.equal(loaded.databaseByPageId.db_impro_exercices.filterQuery, 'chaise');
  assert.equal(loaded.databaseByPageId.db_impro_exercices.notionSyncFilter, 'synced');
  assert.equal(loaded.prepare.session.nom, 'Atelier Jeudi');
  assert.equal(loaded.prepare.tableFilters.onlyCheckV, true);

  clearStoredViewSettings(mockStorage);
  const reset = loadStoredViewSettings(mockStorage);
  assert.equal(reset.nav.mainView, 'chronology');
  assert.deepEqual(reset.databaseByPageId, {});
});

