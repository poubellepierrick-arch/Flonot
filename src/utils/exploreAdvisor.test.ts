import test from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseRow, WorkspacePage } from '../types/workspace';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';
import { computeImproEcosystem } from './improEngine';
import { buildImproAdvisorContext, parseExploreResponsePayload } from './exploreAdvisor';

function buildExploreTestModel() {
  const pages: WorkspacePage[] = [
    {
      id: IMPRO_DB_IDS.exercices,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Exercices',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 0,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.exercices.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.seances,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Séances',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 1,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.seances.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.groupes,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Groupes',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 2,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.groupes.nom, name: 'Nom', type: 'text' }],
    },
    {
      id: IMPRO_DB_IDS.participants,
      workspaceId: 'local',
      ownerId: 'local',
      parentId: null,
      title: 'Participants',
      icon: '',
      type: 'database',
      isFavorite: false,
      isTrashed: false,
      order: 3,
      source: 'native',
      blocks: [],
      columns: [{ id: IMPRO_COL_IDS.participants.nom, name: 'Nom', type: 'text' }],
    },
  ];

  const rowsByPage: Record<string, DatabaseRow[]> = {
    [IMPRO_DB_IDS.exercices]: [
      {
        id: 'ex_miroir',
        pageId: IMPRO_DB_IDS.exercices,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.exercices.nom]: 'Miroir',
          [IMPRO_COL_IDS.exercices.etape]: ['Échauffement'],
          [IMPRO_COL_IDS.exercices.tags]: ['Écoute'],
          [IMPRO_COL_IDS.exercices.description]: 'Suivre les mouvements du binôme sans leader.',
        },
      },
      {
        id: 'ex_silence',
        pageId: IMPRO_DB_IDS.exercices,
        workspaceId: 'local',
        ownerId: 'local',
        order: 1,
        cells: {
          [IMPRO_COL_IDS.exercices.nom]: 'Scène muette',
          [IMPRO_COL_IDS.exercices.etape]: ['Construction'],
          [IMPRO_COL_IDS.exercices.tags]: ['Silence', 'Corps'],
          [IMPRO_COL_IDS.exercices.description]: 'Jouer une scène sans aucun mot.',
        },
      },
    ],
    [IMPRO_DB_IDS.groupes]: [
      {
        id: 'grp_apoec',
        pageId: IMPRO_DB_IDS.groupes,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.groupes.nom]: 'Apoec',
          [IMPRO_COL_IDS.groupes.participants]: ['par1', 'par2'],
        },
      },
    ],
    [IMPRO_DB_IDS.participants]: [
      { id: 'par1', pageId: IMPRO_DB_IDS.participants, workspaceId: 'local', ownerId: 'local', order: 0, cells: { [IMPRO_COL_IDS.participants.nom]: 'Alice' } },
      { id: 'par2', pageId: IMPRO_DB_IDS.participants, workspaceId: 'local', ownerId: 'local', order: 1, cells: { [IMPRO_COL_IDS.participants.nom]: 'Bob' } },
    ],
    [IMPRO_DB_IDS.seances]: [
      {
        id: 'sea1',
        pageId: IMPRO_DB_IDS.seances,
        workspaceId: 'local',
        ownerId: 'local',
        order: 0,
        cells: {
          [IMPRO_COL_IDS.seances.nom]: 'Séance 1',
          [IMPRO_COL_IDS.seances.date]: '2026-11-10',
          [IMPRO_COL_IDS.seances.statut]: 'Terminée',
          [IMPRO_COL_IDS.seances.groupe]: ['grp_apoec'],
          [IMPRO_COL_IDS.seances.participants]: ['par1', 'par2'],
          [IMPRO_COL_IDS.seances.exercices]: ['ex_miroir'],
          [IMPRO_COL_IDS.seances.notes]: 'Très bonne énergie sur le miroir.',
        },
      },
    ],
  };

  return computeImproEcosystem(pages, rowsByPage);
}

test('buildImproAdvisorContext includes group stats, never-done exercises, and theme', () => {
  const model = buildExploreTestModel();
  const ctx = buildImproAdvisorContext(model, 'grp_apoec', 'Écoute & silence');

  assert.match(ctx, /GROUPE SÉLECTIONNÉ : Apoec/);
  assert.match(ctx, /THÉMATIQUE DEMANDÉE PAR L'ANIMATEUR: Écoute & silence/);
  assert.match(ctx, /\[id:ex_silence\] Scène muette/);
  assert.match(ctx, /Très bonne énergie sur le miroir/);
});

test('parseExploreResponsePayload extracts exercises/sessions and matches existing exercises by id or name', () => {
  const model = buildExploreTestModel();
  const raw = [
    'Voici une proposition pour **Apoec** :',
    '',
    '- Échauffement progressif',
    '- Travail du silence',
    '',
    '```impro-suggestions',
    JSON.stringify({
      exercises: [
        {
          nom: 'Miroir',
          existingExerciceId: 'ex_miroir',
          durationMin: 12,
          note: 'En duo puis en trio',
        },
        {
          nom: 'Le Cercle du Souffle',
          etape: 'Échauffement',
          tags: ['Respiration', 'Écoute'],
          description: 'Synchroniser la respiration collective les yeux fermés.',
          durationMin: 10,
          note: 'Poser le rythme dès le début',
        },
      ],
      sessions: [
        {
          titre: 'Atelier Silence & Présence',
          objectif: 'Développer l’écoute non verbale',
          dureeTotaleMin: 55,
          steps: [
            { kind: 'custom', nom: 'Accueil', durationMin: 10, note: 'Météo rapide' },
            { kind: 'exercise', nom: 'scène muette', durationMin: 25, note: 'Sans accessoires' },
            {
              kind: 'exercise',
              nom: 'Le Cercle du Souffle',
              etape: 'Échauffement',
              tags: ['Respiration'],
              description: 'Respiration collective',
              durationMin: 20,
            },
          ],
        },
      ],
    }),
    '```',
  ].join('\n');

  const parsed = parseExploreResponsePayload(raw, model);
  assert.ok(!parsed.replyMarkdown.includes('impro-suggestions'));
  assert.match(parsed.replyMarkdown, /Voici une proposition/);

  assert.equal(parsed.suggestedExercises.length, 2);
  assert.equal(parsed.suggestedExercises[0]?.existingExerciceId, 'ex_miroir');
  assert.equal(parsed.suggestedExercises[1]?.existingExerciceId, undefined);
  assert.equal(parsed.suggestedExercises[1]?.nom, 'Le Cercle du Souffle');

  assert.equal(parsed.suggestedSessions.length, 1);
  const sess = parsed.suggestedSessions[0];
  assert.equal(sess?.titre, 'Atelier Silence & Présence');
  assert.equal(sess?.steps[0]?.kind, 'custom');
  // Matched case-insensitively by name to existing ex_silence
  assert.equal(sess?.steps[1]?.existingExerciceId, 'ex_silence');
  assert.equal(sess?.steps[1]?.nom, 'Scène muette');
  assert.equal(sess?.steps[2]?.existingExerciceId, undefined);
});

test('parseExploreResponsePayload falls back cleanly when JSON block is malformed', () => {
  const model = buildExploreTestModel();
  const raw = 'Texte utile\n```impro-suggestions\n{ invalid json\n```';
  const parsed = parseExploreResponsePayload(raw, model);

  assert.equal(parsed.suggestedExercises.length, 0);
  assert.equal(parsed.suggestedSessions.length, 0);
  assert.match(parsed.replyMarkdown, /Texte utile/);
});
