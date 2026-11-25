import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DatabaseRow } from '../types/workspace';
import {
  getActiveScoreSortDir,
  getExerciseScoreValue,
  hasValidContinuousExerciseScores,
  insertExerciseWithRank,
  moveExerciseRelativeToTarget,
  normalizeExerciseScores,
  setExerciseScoreDirect,
  stepExerciseInVisibleList,
} from './exerciseRanking';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';

function makeRow(id: string, order: number, score?: number): DatabaseRow {
  return {
    id,
    pageId: IMPRO_DB_IDS.exercices,
    workspaceId: 'ws_test',
    ownerId: 'u_test',
    order,
    cells: {
      [IMPRO_COL_IDS.exercices.nom]: `Exo ${id}`,
      ...(score !== undefined ? { [IMPRO_COL_IDS.exercices.score]: score } : {}),
    },
  };
}

function scoresOf(rows: DatabaseRow[]): Array<[string, number | null, number]> {
  return rows.map((r) => [r.id, getExerciseScoreValue(r), r.order]);
}

describe('exerciseRanking', () => {
  it('initialise et normalise des scores continus 1..N selon order puis dédoublonne', () => {
    const raw = [makeRow('b', 20), makeRow('a', 10), makeRow('c', 30)];
    assert.equal(hasValidContinuousExerciseScores(raw), false);

    const { nextRows, changedRows } = normalizeExerciseScores(raw);
    assert.deepEqual(scoresOf(nextRows), [
      ['a', 1, 0],
      ['b', 2, 1],
      ['c', 3, 2],
    ]);
    assert.equal(changedRows.length, 3);
    assert.equal(hasValidContinuousExerciseScores(nextRows), true);

    // Déduplique des scores existants avec trous ou doublons
    const messy = [makeRow('x', 0, 5), makeRow('y', 1, 5), makeRow('z', 2, 12)];
    const norm = normalizeExerciseScores(messy);
    assert.deepEqual(scoresOf(norm.nextRows), [
      ['x', 1, 0],
      ['y', 2, 1],
      ['z', 3, 2],
    ]);
  });

  it('déplace un exercice avant/après une cible et réindexe uniquement les lignes modifiées', () => {
    const initial = normalizeExerciseScores([
      makeRow('e1', 0),
      makeRow('e2', 1),
      makeRow('e3', 2),
      makeRow('e4', 3),
    ]).nextRows;

    // Déplacer e4 avant e2 -> ordre attendu e1(1), e4(2), e2(3), e3(4)
    const moved = moveExerciseRelativeToTarget(initial, 'e4', 'e2', 'before');
    assert.deepEqual(scoresOf(moved.nextRows), [
      ['e1', 1, 0],
      ['e4', 2, 1],
      ['e2', 3, 2],
      ['e3', 4, 3],
    ]);
    // e1 n'a pas changé
    assert.deepEqual(
      moved.changedRows.map((r) => r.id).sort(),
      ['e2', 'e3', 'e4']
    );

    // Déplacer e1 après e3 -> ordre attendu e4(1), e2(2), e3(3), e1(4)
    const movedAfter = moveExerciseRelativeToTarget(moved.nextRows, 'e1', 'e3', 'after');
    assert.deepEqual(scoresOf(movedAfter.nextRows), [
      ['e4', 1, 0],
      ['e2', 2, 1],
      ['e3', 3, 2],
      ['e1', 4, 3],
    ]);
  });

  it('respecte le tri décroissant sur Score lors dun glisser-déposer ou dun pas haut/bas', () => {
    const initial = normalizeExerciseScores([
      makeRow('e1', 0),
      makeRow('e2', 1),
      makeRow('e3', 2),
    ]).nextRows;

    // En tri Score DESC, la liste affichée est [e3(3), e2(2), e1(1)]
    // Monter e1 d'un cran (-1) signifie le placer visuellement avant e2 -> son score devient supérieur à e2
    const sortDir = getActiveScoreSortDir([{ colId: IMPRO_COL_IDS.exercices.score, dir: 'desc' }]);
    assert.equal(sortDir, 'desc');

    const stepped = stepExerciseInVisibleList(initial, ['e3', 'e2', 'e1'], 'e1', -1, {
      scoreSortDir: sortDir,
    });
    assert.deepEqual(scoresOf(stepped.nextRows), [
      ['e2', 1, 0],
      ['e1', 2, 1],
      ['e3', 3, 2],
    ]);
  });

  it('ajuste le score entre voisins affichés sans casser un tri tiers (ex: Nouveauté)', () => {
    const initial = normalizeExerciseScores([
      makeRow('e1', 0),
      makeRow('e2', 1),
      makeRow('e3', 2),
      makeRow('e4', 3),
    ]).nextRows;

    const sortDir = getActiveScoreSortDir([{ colId: 'ded_prep_novelty', dir: 'asc' }]);
    assert.equal(sortDir, null);

    // Sous un autre tri, la vue affiche [e3, e1, e4] (e2 filtré)
    // Monter e4 d'un cran dans la liste visible (donc avant e1) place son score juste avant e1
    const stepped = stepExerciseInVisibleList(initial, ['e3', 'e1', 'e4'], 'e4', -1, {
      scoreSortDir: sortDir,
    });
    const scoreMap = new Map(stepped.nextRows.map((r) => [r.id, getExerciseScoreValue(r)]));
    assert.ok((scoreMap.get('e4') ?? 99) < (scoreMap.get('e1') ?? 0));
    assert.equal(hasValidContinuousExerciseScores(stepped.nextRows), true);
  });

  it('permet de saisir un rang direct borné entre 1 et N et réindexe', () => {
    const initial = normalizeExerciseScores([
      makeRow('e1', 0),
      makeRow('e2', 1),
      makeRow('e3', 2),
      makeRow('e4', 3),
    ]).nextRows;

    const direct = setExerciseScoreDirect(initial, 'e4', 2);
    assert.deepEqual(scoresOf(direct.nextRows), [
      ['e1', 1, 0],
      ['e4', 2, 1],
      ['e2', 3, 2],
      ['e3', 4, 3],
    ]);

    const clamped = setExerciseScoreDirect(direct.nextRows, 'e1', 999);
    assert.deepEqual(scoresOf(clamped.nextRows), [
      ['e4', 1, 0],
      ['e2', 2, 1],
      ['e3', 3, 2],
      ['e1', 4, 3],
    ]);
  });

  it('insère un nouvel exercice en haut (rang 1) ou en bas (rang N+1) sans trou', () => {
    const initial = normalizeExerciseScores([makeRow('e1', 0), makeRow('e2', 1)]).nextRows;

    const topInsert = insertExerciseWithRank(initial, makeRow('newTop', 0), 'top');
    assert.deepEqual(scoresOf(topInsert.nextRows), [
      ['newTop', 1, 0],
      ['e1', 2, 1],
      ['e2', 3, 2],
    ]);

    const bottomInsert = insertExerciseWithRank(
      topInsert.nextRows,
      makeRow('newBot', 0),
      'bottom'
    );
    assert.deepEqual(scoresOf(bottomInsert.nextRows), [
      ['newTop', 1, 0],
      ['e1', 2, 1],
      ['e2', 3, 2],
      ['newBot', 4, 3],
    ]);
  });
});
