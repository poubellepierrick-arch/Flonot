import type { CellValue, DatabaseRow, DatabaseSortRule } from '../types/workspace';
import { IMPRO_COL_IDS } from './improCsvLoader';

export interface ExerciseRankMutationResult {
  nextRows: DatabaseRow[];
  changedRows: DatabaseRow[];
}

export type ScoreSortDirection = 'asc' | 'desc' | null;

export function getExerciseScoreValue(row: DatabaseRow): number | null {
  const raw = row.cells[IMPRO_COL_IDS.exercices.score];
  if (raw === undefined || raw === null || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export function getActiveScoreSortDir(sortRules: DatabaseSortRule[]): ScoreSortDirection {
  const primary = sortRules[0];
  if (!primary || primary.colId !== IMPRO_COL_IDS.exercices.score) return null;
  return primary.dir;
}

function compareRowsForInitialRanking(
  a: DatabaseRow,
  indexA: number,
  b: DatabaseRow,
  indexB: number
): number {
  const scoreA = getExerciseScoreValue(a);
  const scoreB = getExerciseScoreValue(b);

  if (scoreA !== null && scoreB !== null) {
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (a.order !== b.order) return a.order - b.order;
    return indexA - indexB;
  }
  if (scoreA !== null) return -1;
  if (scoreB !== null) return 1;

  if (a.order !== b.order) return a.order - b.order;
  return indexA - indexB;
}

function reindexOrderedRows(ordered: DatabaseRow[]): ExerciseRankMutationResult {
  const scoreColId = IMPRO_COL_IDS.exercices.score;
  const changedRows: DatabaseRow[] = [];
  const nextRows: DatabaseRow[] = ordered.map((row, idx) => {
    const nextScore = idx + 1;
    const nextOrder = idx;
    const prevRawScore = row.cells[scoreColId];
    const scoreMatches = typeof prevRawScore === 'number' && prevRawScore === nextScore;
    const orderMatches = row.order === nextOrder;

    if (scoreMatches && orderMatches) {
      return row;
    }

    const updated: DatabaseRow = {
      ...row,
      order: nextOrder,
      cells: {
        ...row.cells,
        [scoreColId]: nextScore,
      },
    };
    changedRows.push(updated);
    return updated;
  });

  return { nextRows, changedRows };
}

function getCanonicallyOrderedRows(rows: DatabaseRow[]): DatabaseRow[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => compareRowsForInitialRanking(a.row, a.idx, b.row, b.idx))
    .map((entry) => entry.row);
}

/**
 * Vérifie si tous les exercices disposent déjà d'un score strict continu (1..N) aligné sur row.order.
 */
export function hasValidContinuousExerciseScores(rows: DatabaseRow[]): boolean {
  if (rows.length === 0) return true;
  const seen = new Set<number>();
  for (const row of rows) {
    const raw = row.cells[IMPRO_COL_IDS.exercices.score];
    if (typeof raw !== 'number' || !Number.isInteger(raw)) return false;
    if (raw < 1 || raw > rows.length) return false;
    if (seen.has(raw)) return false;
    if (row.order !== raw - 1) return false;
    seen.add(raw);
  }
  return seen.size === rows.length;
}

/**
 * Normalise tous les exercices en rangs continus stricts 1..N et aligne row.order = score - 1.
 */
export function normalizeExerciseScores(rows: DatabaseRow[]): ExerciseRankMutationResult {
  const ordered = getCanonicallyOrderedRows(rows);
  return reindexOrderedRows(ordered);
}

/**
 * Déplace un exercice avant ou après un exercice cible et réindexe 1..N.
 * Quand le tri affiché est Score décroissant, "before" visuel correspond à un rang numérique plus élevé.
 * Sous tout autre tri actif ou sans tri, "before" place l'exercice juste avant la cible en score (rang inférieur).
 */
export function moveExerciseRelativeToTarget(
  allRows: DatabaseRow[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after',
  options?: { scoreSortDir?: ScoreSortDirection }
): ExerciseRankMutationResult {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { nextRows: allRows, changedRows: [] };
  }

  const ordered = getCanonicallyOrderedRows(allRows);
  const sourceIdx = ordered.findIndex((r) => r.id === sourceId);
  if (sourceIdx === -1) {
    return { nextRows: allRows, changedRows: [] };
  }

  const sourceRow = ordered[sourceIdx];
  const withoutSource = ordered.filter((r) => r.id !== sourceId);
  const targetIdx = withoutSource.findIndex((r) => r.id === targetId);
  if (targetIdx === -1) {
    return { nextRows: allRows, changedRows: [] };
  }

  const isDescScoreSort = options?.scoreSortDir === 'desc';
  const insertIdx = isDescScoreSort
    ? position === 'before'
      ? targetIdx + 1
      : targetIdx
    : position === 'before'
      ? targetIdx
      : targetIdx + 1;

  const reordered = [
    ...withoutSource.slice(0, insertIdx),
    sourceRow,
    ...withoutSource.slice(insertIdx),
  ];

  return reindexOrderedRows(reordered);
}

/**
 * Déplace un exercice d'un cran vers le haut (-1) ou vers le bas (+1) parmi les lignes visibles affichées.
 */
export function stepExerciseInVisibleList(
  allRows: DatabaseRow[],
  visibleRowIds: string[],
  sourceId: string,
  delta: -1 | 1,
  options?: { scoreSortDir?: ScoreSortDirection }
): ExerciseRankMutationResult {
  const visIdx = visibleRowIds.indexOf(sourceId);
  if (visIdx === -1) {
    return { nextRows: allRows, changedRows: [] };
  }
  const targetIdx = visIdx + delta;
  if (targetIdx < 0 || targetIdx >= visibleRowIds.length) {
    return { nextRows: allRows, changedRows: [] };
  }
  const targetId = visibleRowIds[targetIdx];
  return moveExerciseRelativeToTarget(
    allRows,
    sourceId,
    targetId,
    delta === -1 ? 'before' : 'after',
    options
  );
}

/**
 * Modifie directement le score d'un exercice à un rang cible (borné entre 1 et N) puis réindexe 1..N.
 */
export function setExerciseScoreDirect(
  allRows: DatabaseRow[],
  sourceId: string,
  desiredScore: CellValue | undefined
): ExerciseRankMutationResult {
  const parsed =
    typeof desiredScore === 'number'
      ? desiredScore
      : Number(String(desiredScore ?? '').replace(',', '.').trim());
  if (!Number.isFinite(parsed) || allRows.length === 0) {
    return { nextRows: allRows, changedRows: [] };
  }

  const ordered = getCanonicallyOrderedRows(allRows);
  const sourceIdx = ordered.findIndex((r) => r.id === sourceId);
  if (sourceIdx === -1) {
    return { nextRows: allRows, changedRows: [] };
  }

  const clampedRank = Math.max(1, Math.min(ordered.length, Math.round(parsed)));
  const sourceRow = ordered[sourceIdx];
  const withoutSource = ordered.filter((r) => r.id !== sourceId);
  const insertIdx = Math.max(0, Math.min(withoutSource.length, clampedRank - 1));

  const reordered = [
    ...withoutSource.slice(0, insertIdx),
    sourceRow,
    ...withoutSource.slice(insertIdx),
  ];

  return reindexOrderedRows(reordered);
}

/**
 * Insère une nouvelle ligne d'exercice à la position souhaitée ('top' = rang 1, 'bottom' = rang N+1)
 * ou à un rang explicite si défini dans newRow.cells[score], et réindexe 1..N+1.
 */
export function insertExerciseWithRank(
  existingRows: DatabaseRow[],
  newRow: DatabaseRow,
  insertAt: 'top' | 'bottom' = 'top'
): ExerciseRankMutationResult {
  const ordered = getCanonicallyOrderedRows(existingRows);
  const explicitScore = getExerciseScoreValue(newRow);

  let insertIdx: number;
  if (explicitScore !== null) {
    insertIdx = Math.max(0, Math.min(ordered.length, Math.round(explicitScore) - 1));
  } else {
    insertIdx = insertAt === 'bottom' ? ordered.length : 0;
  }

  const combined = [...ordered.slice(0, insertIdx), newRow, ...ordered.slice(insertIdx)];
  return reindexOrderedRows(combined);
}
