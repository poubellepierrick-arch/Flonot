import test from 'node:test';
import assert from 'node:assert/strict';
import { searchGlobalWorkspace } from './globalSearch';
import { computeImproEcosystem } from './improEngine';
import { createSeedWorkspace } from './seedWorkspace';

test('searchGlobalWorkspace finds pages and blocks cleanly', () => {
  const seed = createSeedWorkspace('local', 'local');
  const emptyImpro = computeImproEcosystem(seed.pages, seed.rowsByPage);
  const hits = searchGlobalWorkspace('AppFlowy', seed.pages, emptyImpro);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].kind, 'page');
});

test('searchGlobalWorkspace indexes custom database rows with targetRowId', () => {
  const seed = createSeedWorkspace('local', 'local');
  const customDb = {
    id: 'db_custom_mat',
    workspaceId: 'local',
    ownerId: 'local',
    parentId: null,
    title: 'Matériel',
    icon: '🎭',
    type: 'database' as const,
    isFavorite: false,
    isTrashed: false,
    order: 99,
    source: 'native' as const,
    blocks: [],
    columns: [
      { id: 'col_titre', name: 'Nom', type: 'text' as const },
      { id: 'col_lieu', name: 'Lieu', type: 'text' as const },
    ],
  };
  const rowsByPage = {
    ...seed.rowsByPage,
    db_custom_mat: [
      {
        id: 'row_chapeau',
        pageId: 'db_custom_mat',
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: { col_titre: 'Chapeau melon', col_lieu: 'Loge B' },
      },
    ],
  };
  const pages = [...seed.pages, customDb];
  const emptyImpro = computeImproEcosystem(pages, rowsByPage);
  const hits = searchGlobalWorkspace('Chapeau melon', pages, emptyImpro, 24, rowsByPage);
  const rowHit = hits.find((h) => h.kind === 'row');
  assert.ok(rowHit);
  assert.equal(rowHit.targetPageId, 'db_custom_mat');
  assert.equal(rowHit.targetRowId, 'row_chapeau');
});

test('searchGlobalWorkspace indexes inline blocks and comments on Biblimpro exercises', () => {
  const exPage = {
    id: 'db_impro_exercices',
    workspaceId: 'local',
    ownerId: 'local',
    parentId: null,
    title: 'Biblimpro',
    icon: '🎭',
    type: 'database' as const,
    isFavorite: false,
    isTrashed: false,
    order: 1,
    source: 'native' as const,
    blocks: [],
    columns: [
      { id: 'col_ex_nom', name: 'Nom', type: 'text' as const },
      { id: 'col_ex_etape', name: 'Étape', type: 'multi_select' as const },
      { id: 'col_ex_tags', name: 'Tags', type: 'multi_select' as const },
      { id: 'col_ex_description', name: 'Description', type: 'text' as const },
    ],
  };
  const rowsByPage = {
    db_impro_exercices: [
      {
        id: 'ex_traversee',
        pageId: 'db_impro_exercices',
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          col_ex_nom: 'Traversée',
          col_ex_etape: ['Échauffement'],
          col_ex_tags: ['réactivité'],
          col_ex_description: 'Synchro avec sa ligne',
        },
        blocks: [
          {
            id: 'b_aud',
            type: 'audio' as const,
            url: 'https://cdn.example.com/french79.mp3',
            content: 'Sailing French 79',
          },
        ],
        comments: [
          {
            id: 'cmt_1',
            authorName: 'Paul',
            content: 'Penser à couper le tempo au milieu',
            createdAt: '2026-11-23T12:00:00.000Z',
          },
        ],
      },
    ],
    db_impro_seances: [],
    db_impro_groupes: [],
    db_impro_participants: [],
  };
  const makeStubDb = (id: string, title: string) => ({
    id,
    workspaceId: 'local',
    ownerId: 'local',
    parentId: null,
    title,
    icon: '📋',
    type: 'database' as const,
    isFavorite: false,
    isTrashed: false,
    order: 2,
    source: 'native' as const,
    blocks: [],
    columns: [{ id: 'col_nom', name: 'Nom', type: 'text' as const }],
  });
  const pages = [
    exPage,
    makeStubDb('db_impro_seances', 'Séances'),
    makeStubDb('db_impro_groupes', 'Groupe'),
    makeStubDb('db_impro_participants', 'Participants'),
  ];
  const model = computeImproEcosystem(pages, rowsByPage);
  const audioHits = searchGlobalWorkspace('French 79', pages, model, 24, rowsByPage);
  assert.equal(audioHits[0]?.kind, 'exercise');
  assert.equal(audioHits[0]?.targetRowId, 'ex_traversee');

  const commentHits = searchGlobalWorkspace('tempo', pages, model, 24, rowsByPage);
  assert.equal(commentHits[0]?.kind, 'exercise');
  assert.equal(commentHits[0]?.targetRowId, 'ex_traversee');
});
