import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultWorkspaceViewSettings,
  extractDatabasePageIdFromDocId,
  getDatabaseSettingDocId,
  sanitizeDatabaseViewSettings,
  sanitizePrepareViewSettings,
  sanitizeTimelineViewSettings,
  sanitizeWorkspaceViewSettings,
} from './viewSettings';

test('sanitizeDatabaseViewSettings normalise et borne les filtres de base', () => {
  const clean = sanitizeDatabaseViewSettings({
    filterQuery: '  écoute  ',
    notionSyncFilter: 'synced',
    showAllRows: true,
  });
  assert.equal(clean.filterQuery, '  écoute  ');
  assert.equal(clean.notionSyncFilter, 'synced');
  assert.equal(clean.showAllRows, true);

  const fallback = sanitizeDatabaseViewSettings({
    notionSyncFilter: 'invalid',
    filterQuery: 'a'.repeat(500),
    showAllRows: 'truthy',
  });
  assert.equal(fallback.notionSyncFilter, 'all');
  assert.equal(fallback.filterQuery.length, 200);
  assert.equal(fallback.showAllRows, true);
});

test('sanitizePrepareViewSettings préserve le brouillon, déroulé et filtres sans undefined', () => {
  const clean = sanitizePrepareViewSettings(
    {
      targetDurationMin: 120,
      session: {
        editingSeanceId: 'row_s1',
        nom: 'Atelier Mardi',
        date: '2026-11-24',
        groupeId: 'row_g1',
        presentIds: ['p1', 'p2', 'p1'],
        showAllParticipants: true,
        participantsExpanded: false,
        steps: [
          { id: 'st1', kind: 'exercise', exerciceId: 'ex1', durationMin: 20, note: 'Sans parler' },
          { id: 'st2', kind: 'custom', label: 'Météo', durationMin: 10, note: '' },
          { id: 'st3', kind: 'exercise', durationMin: 15, note: 'manque exerciceId' },
        ],
        notes: 'Penser aux chaises',
        status: 'Préparée',
        activeSubTab: 'deroule',
        sortRules: [{ colId: 'col_ex_score', dir: 'asc' }],
      },
      tableFilters: {
        noveltyTab: 'majority',
        searchQuery: 'statut',
        etapeFilter: 'Échauffement',
        tagFilter: 'Écoute',
        onlyCheck1: true,
        onlyCheck2: false,
        onlyCheckV: true,
        showAllRows: true,
      },
    },
    '2026-11-24'
  );

  assert.equal(clean.targetDurationMin, 120);
  assert.equal(clean.session.editingSeanceId, 'row_s1');
  assert.deepEqual(clean.session.presentIds, ['p1', 'p2']);
  assert.equal(clean.session.steps.length, 2);
  assert.equal(clean.session.steps[0].kind, 'exercise');
  assert.equal('label' in clean.session.steps[0], false);
  assert.equal(clean.session.steps[1].kind, 'custom');
  assert.equal('exerciceId' in clean.session.steps[1], false);
  assert.equal(clean.session.activeSubTab, 'deroule');
  assert.deepEqual(clean.session.sortRules, [{ colId: 'col_ex_score', dir: 'asc' }]);
  assert.equal(clean.tableFilters.noveltyTab, 'majority');
  assert.equal(clean.tableFilters.onlyCheck1, true);
  assert.equal(clean.tableFilters.onlyCheckV, true);
});

test('sanitizeTimelineViewSettings distingue matrixGroupId null vs chaîne vide', () => {
  const unset = sanitizeTimelineViewSettings({});
  assert.equal(unset.matrixGroupId, null);

  const explicitAll = sanitizeTimelineViewSettings({ matrixGroupId: '' });
  assert.equal(explicitAll.matrixGroupId, '');

  const specific = sanitizeTimelineViewSettings({ matrixGroupId: 'grp_1' });
  assert.equal(specific.matrixGroupId, 'grp_1');
});

test('sanitizeWorkspaceViewSettings et helpers IDs gèrent un état complet', () => {
  const defaults = createDefaultWorkspaceViewSettings('2026-11-24');
  assert.equal(defaults.nav.mainView, 'chronology');
  assert.equal(defaults.prepare.session.date, '2026-11-24');

  const docId = getDatabaseSettingDocId('db_impro_exercices');
  assert.equal(docId, 'db_db_impro_exercices');
  assert.equal(extractDatabasePageIdFromDocId(docId), 'db_impro_exercices');

  const restored = sanitizeWorkspaceViewSettings(
    {
      nav: { mainView: 'prepare', activePageId: 'db_impro_exercices' },
      databaseByPageId: {
        db_impro_exercices: { filterQuery: 'mime', notionSyncFilter: 'pending', showAllRows: true },
      },
      stats: { groupId: 'g1', parSortKey: 'attendancePct', parSortAsc: true, exerciseTab: 'never' },
      explore: { draftTier: 'max', draftUseWebSearch: true, activeThreadId: 'exp_1' },
      search: { query: 'miroir' },
    },
    '2026-11-24'
  );

  assert.equal(restored.nav.mainView, 'prepare');
  assert.equal(restored.nav.activePageId, 'db_impro_exercices');
  assert.equal(restored.databaseByPageId.db_impro_exercices.filterQuery, 'mime');
  assert.equal(restored.databaseByPageId.db_impro_exercices.notionSyncFilter, 'pending');
  assert.equal(restored.stats.exerciseTab, 'never');
  assert.equal(restored.explore.draftTier, 'max');
  assert.equal(restored.explore.activeThreadId, 'exp_1');
  assert.equal(restored.search.query, 'miroir');
});
