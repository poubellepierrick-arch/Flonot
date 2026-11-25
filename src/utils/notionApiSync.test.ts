import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBiblimproPropertiesFromNotionPage,
  extractNotionUuid,
  formatNotionUuid,
  mapNotionBlocksToFlownoteBlocks,
  mapNotionCommentsToRowComments,
  mergeBiblimproNotionBatch,
  mergeBlocksAppendNotion,
} from './notionApiSync';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';
import type { BlockItem, DatabaseColumn, DatabaseRow } from '../types/workspace';

test('extractNotionUuid et formatNotionUuid reconnaissent URLs Notion et UUID bruts', () => {
  const url = 'https://www.notion.so/mon-espace/Biblimpro-2e2ddc608f9980438568f6cda4766a95?v=123456';
  assert.equal(extractNotionUuid(url), '2e2ddc608f9980438568f6cda4766a95');
  assert.equal(
    formatNotionUuid('2e2ddc608f9980438568f6cda4766a95'),
    '2e2ddc60-8f99-8043-8568-f6cda4766a95'
  );
  assert.equal(extractNotionUuid('texte-invalide'), null);
});

test('mapNotionBlocksToFlownoteBlocks convertit YouTube, Audio Notion, toggles, tableaux et tâches', () => {
  const blocks = mapNotionBlocksToFlownoteBlocks([
    {
      id: 'aaaa1111-1111-1111-1111-111111111111',
      type: 'audio',
      audio: {
        type: 'file',
        file: { url: 'https://prod-files-secure.s3.us-west-2.amazonaws.com/test.mp3' },
        caption: [{ plain_text: 'Musique échauffement' }],
      },
    },
    {
      id: 'bbbb2222-2222-2222-2222-222222222222',
      type: 'video',
      video: {
        type: 'external',
        external: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        caption: [{ plain_text: 'Démo YouTube' }],
      },
    },
    {
      id: 'cccc3333-3333-3333-3333-333333333333',
      type: 'to_do',
      to_do: { checked: true, rich_text: [{ plain_text: 'Vérifier les chaises' }] },
    },
    {
      id: 'dddd4444-4444-4444-4444-444444444444',
      type: 'toggle',
      toggle: { rich_text: [{ plain_text: 'Variante avancée' }] },
      children: [
        {
          id: 'eeee5555-5555-5555-5555-555555555555',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ plain_text: 'Sans parole' }] },
        },
      ],
    },
    {
      id: 'ffff6666-6666-6666-6666-666666666666',
      type: 'table',
      children: [
        {
          id: '11117777-7777-7777-7777-777777777777',
          type: 'table_row',
          table_row: { cells: [[{ plain_text: 'Rôle' }], [{ plain_text: 'Consigne' }]] },
        },
        {
          id: '22228888-8888-8888-8888-888888888888',
          type: 'table_row',
          table_row: { cells: [[{ plain_text: 'Meneur' }], [{ plain_text: 'Donne le top' }]] },
        },
      ],
    },
  ]);

  assert.equal(blocks[0].type, 'audio');
  assert.equal(blocks[0].url, '/api/notion/media/aaaa1111111111111111111111111111');
  assert.equal(blocks[0].content, 'Musique échauffement');

  assert.equal(blocks[1].type, 'youtube');
  assert.equal(blocks[1].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  assert.equal(blocks[2].type, 'todo');
  assert.equal(blocks[2].checked, true);

  assert.equal(blocks[3].type, 'toggle');
  assert.equal(blocks[3].content, 'Variante avancée');
  assert.equal(blocks[3].details, '• Sans parole');

  assert.equal(blocks[4].type, 'table');
  assert.deepEqual(blocks[4].tableRows, [
    { cells: ['Rôle', 'Consigne'] },
    { cells: ['Meneur', 'Donne le top'] },
  ]);
});

test('mergeBlocksAppendNotion conserve les notes locales devant et déduplique les blocs Notion', () => {
  const existing: BlockItem[] = [{ id: 'blk_local_1', type: 'paragraph', content: 'Note perso' }];
  const notion1: BlockItem[] = [
    { id: 'nblk_a1', type: 'heading2', content: 'Règles' },
    { id: 'nblk_a2', type: 'paragraph', content: 'V1' },
  ];
  const afterFirst = mergeBlocksAppendNotion(existing, notion1);
  assert.equal(afterFirst.length, 3);
  assert.equal(afterFirst[0].id, 'blk_local_1');
  assert.equal(afterFirst[2].content, 'V1');

  const notion2: BlockItem[] = [
    { id: 'nblk_a1', type: 'heading2', content: 'Règles' },
    { id: 'nblk_a2', type: 'paragraph', content: 'V2 mise à jour' },
    { id: 'nblk_a3', type: 'todo', checked: false, content: 'Nouveau point' },
  ];
  const afterSecond = mergeBlocksAppendNotion(afterFirst, notion2);
  assert.equal(afterSecond.length, 4);
  assert.equal(afterSecond[0].id, 'blk_local_1');
  assert.equal(afterSecond[2].content, 'V2 mise à jour');
  assert.equal(afterSecond[3].id, 'nblk_a3');
});

test('mergeBiblimproNotionBatch associe par titre, synchronise propriétés/commentaires et crée les nouveaux exercices', () => {
  const props = extractBiblimproPropertiesFromNotionPage({
    id: '11111111-2222-3333-4444-555555555555',
    properties: {
      Nom: { type: 'title', title: [{ plain_text: 'Traversée' }] },
      étape: { type: 'multi_select', multi_select: [{ name: 'échauffement' }] },
      tag: { type: 'multi_select', multi_select: [{ name: 'écoute' }, { name: 'rythme' }] },
      description: { type: 'rich_text', rich_text: [{ plain_text: 'Nouvelle consigne' }] },
      '1': { type: 'checkbox', checkbox: true },
      V: { type: 'checkbox', checkbox: true },
    },
  });

  const existingRow: DatabaseRow = {
    id: 'ex_row_0',
    pageId: IMPRO_DB_IDS.exercices,
    workspaceId: 'ws_1',
    ownerId: 'u_1',
    order: 0,
    cells: {
      [IMPRO_COL_IDS.exercices.nom]: 'traversée',
      [IMPRO_COL_IDS.exercices.etape]: [],
      [IMPRO_COL_IDS.exercices.tags]: [],
      [IMPRO_COL_IDS.exercices.description]: 'Ancienne',
    },
    blocks: [{ id: 'blk_local', type: 'paragraph', content: 'Ma note FlowNote' }],
  };

  const columns: DatabaseColumn[] = [
    { id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' },
    { id: IMPRO_COL_IDS.exercices.etape, name: 'étape', type: 'multi_select', options: [] },
    { id: IMPRO_COL_IDS.exercices.tags, name: 'tag', type: 'multi_select', options: [] },
  ];

  const comments = mapNotionCommentsToRowComments([
    {
      id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
      created_time: '2026-11-20T10:00:00.000Z',
      created_by: { id: 'usr_1', name: 'Pierrick' },
      rich_text: [{ plain_text: 'Super sur scène !' }],
    },
  ]);

  const merged = mergeBiblimproNotionBatch({
    payloads: [
      {
        notionPageId: '11111111222233334444555555555555',
        properties: props,
        blocks: [{ id: 'nblk_1', type: 'audio', url: '/api/notion/media/abc', content: 'Sailing' }],
        comments,
      },
      {
        notionPageId: 'aaaaaaaa222233334444555555555555',
        properties: {
          nom: 'Nouvel exo Notion',
          etapes: ['jeu'],
          tags: ['corps'],
          description: 'Ajouté dans Notion',
          seanceNotionIds: [],
        },
        blocks: [{ id: 'nblk_2', type: 'paragraph', content: 'Consigne détaillée' }],
        comments: [],
      },
    ],
    existingExerciseRows: [existingRow],
    existingSeanceRows: [],
    existingColumns: columns,
    workspaceId: 'ws_1',
    ownerId: 'u_1',
  });

  assert.equal(merged.summary.updatedCount, 1);
  assert.equal(merged.summary.createdCount, 1);
  assert.equal(merged.nextRows.length, 2);

  const updated = merged.nextRows[0];
  assert.equal(updated.id, 'ex_row_0');
  assert.equal(updated.notionPageId, '11111111222233334444555555555555');
  assert.equal(updated.cells[IMPRO_COL_IDS.exercices.description], 'Nouvelle consigne');
  assert.equal(updated.blocks?.length, 2);
  assert.equal(updated.blocks?.[0].id, 'blk_local');
  assert.equal(updated.blocks?.[1].type, 'audio');
  assert.equal(updated.comments?.length, 1);
  assert.equal(updated.comments?.[0].authorName, 'Pierrick');

  const created = merged.nextRows[1];
  assert.equal(created.id, 'ex_notion_aaaaaaaa2222333344445555');
  assert.equal(created.cells[IMPRO_COL_IDS.exercices.nom], 'Nouvel exo Notion');
  assert.equal(merged.columnsChanged, true);
});
