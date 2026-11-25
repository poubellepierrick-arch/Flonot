import type { DatabaseRow, WorkspacePage } from '../types/workspace';
import { getPrimaryColumn } from './columnOrder';
import { IMPRO_DB_IDS } from './improCsvLoader';
import type { ImproEcosystemModel } from './improEngine';
import { isImproDatabasePage } from './improEngine';
import { formatCellText, getComputedRowCells } from './notionFormula';

export type GlobalSearchResultKind =
  | 'exercise'
  | 'seance'
  | 'group'
  | 'participant'
  | 'row'
  | 'page'
  | 'database';

export interface GlobalSearchItem {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle: string;
  targetPageId: string;
  targetRowId?: string;
}

export function searchGlobalWorkspace(
  query: string,
  pages: WorkspacePage[],
  improModel: ImproEcosystemModel,
  limit = 24,
  rowsByPage: Record<string, DatabaseRow[]> = {}
): GlobalSearchItem[] {
  const q = query.trim().toLowerCase();
  const out: GlobalSearchItem[] = [];

  const pushIfMatch = (item: GlobalSearchItem, searchText: string) => {
    if (out.length >= limit) return;
    if (!q || searchText.toLowerCase().includes(q)) {
      out.push(item);
    }
  };

  if (improModel.ready) {
    for (const s of improModel.seances) {
      pushIfMatch(
        {
          id: `sea_${s.id}`,
          kind: 'seance',
          title: s.nom,
          subtitle: `${s.date || 'Sans date'} · ${s.groupeNames.join(', ') || 'Sans groupe'} · ${s.status}`,
          targetPageId: IMPRO_DB_IDS.seances,
          targetRowId: s.id,
        },
        `${s.nom} ${s.date} ${s.groupeNames.join(' ')} ${s.status}`
      );
      if (out.length >= limit) return out;
    }

    const pageById = new Map(pages.filter((p) => !p.isTrashed).map((p) => [p.id, p]));
    const exRows = rowsByPage[IMPRO_DB_IDS.exercices] ?? [];
    const exRowById = new Map(exRows.map((r) => [r.id, r]));

    for (const ex of improModel.exercises) {
      const exRow = exRowById.get(ex.id);
      const linkedPageId = exRow?.linkedPageId;
      const linkedPage = linkedPageId ? pageById.get(linkedPageId) : undefined;
      const inlineBlocks = exRow?.blocks ?? linkedPage?.blocks ?? [];
      const inlineText = inlineBlocks
        .map((b) => `${b.content} ${b.details ?? ''} ${b.url ?? ''}`)
        .join(' ');
      const commentsText = (exRow?.comments ?? [])
        .map((c) => `${c.authorName} ${c.content}`)
        .join(' ');
      const hasInlineMedia = inlineBlocks.some(
        (b) =>
          b.content.trim().length > 0 ||
          Boolean(b.url && b.url.trim() && b.url.trim() !== 'https://') ||
          Boolean(b.details && b.details.trim()) ||
          Boolean(b.tableRows && b.tableRows.length > 0)
      );
      pushIfMatch(
        {
          id: `ex_${ex.id}`,
          kind: 'exercise',
          title: ex.nom,
          subtitle: [
            ex.etapes.join(', '),
            `${ex.usageCount} séances`,
            hasInlineMedia ? 'Contenu intégré' : '',
          ]
            .filter(Boolean)
            .join(' · '),
          targetPageId: IMPRO_DB_IDS.exercices,
          targetRowId: ex.id,
        },
        `${ex.nom} ${ex.etapes.join(' ')} ${ex.tags.join(' ')} ${ex.description} ${inlineText} ${commentsText}`
      );
      if (out.length >= limit) return out;
    }

    for (const g of improModel.groups) {
      pushIfMatch(
        {
          id: `grp_${g.id}`,
          kind: 'group',
          title: g.nom,
          subtitle: `${g.participantIds.length} membres · ${g.sessions.length} séances`,
          targetPageId: IMPRO_DB_IDS.groupes,
          targetRowId: g.id,
        },
        `${g.nom} ${g.participantNames.join(' ')}`
      );
      if (out.length >= limit) return out;
    }

    for (const p of improModel.participants) {
      pushIfMatch(
        {
          id: `par_${p.id}`,
          kind: 'participant',
          title: p.displayLabel,
          subtitle: `${p.groupeNames.join(', ') || 'Sans groupe'} · ${p.presenceCount} présences`,
          targetPageId: IMPRO_DB_IDS.participants,
          targetRowId: p.id,
        },
        `${p.displayLabel} ${p.nom} ${p.groupeNames.join(' ')}`
      );
      if (out.length >= limit) return out;
    }
  }

  const activePages = pages.filter((p) => !p.isTrashed);
  for (const p of activePages) {
    if (isImproDatabasePage(p.id) && improModel.ready) continue;
    const blockText = p.blocks
      .map((b) => `${b.content} ${b.details ?? ''} ${b.url ?? ''}`)
      .join(' ');
    if (!isImproDatabasePage(p.id)) {
      pushIfMatch(
        {
          id: `page_${p.id}`,
          kind: p.type === 'database' ? 'database' : 'page',
          title: p.title || 'Sans titre',
          subtitle: p.type === 'database' ? 'Base de données' : `${p.blocks.length} blocs`,
          targetPageId: p.id,
        },
        `${p.title} ${blockText}`
      );
      if (out.length >= limit) return out;
    }

    if (p.type === 'database') {
      const dbRows = rowsByPage[p.id] ?? [];
      const cols = p.columns ?? [];
      const primaryCol = getPrimaryColumn(cols);
      for (const row of dbRows) {
        const computedCells = getComputedRowCells(p, row, pages, rowsByPage).cells;
        const primaryTitle = primaryCol
          ? formatCellText(primaryCol, computedCells[primaryCol.id], pages, rowsByPage).trim()
          : '';
        const otherTexts = cols
          .filter((c) => c.id !== primaryCol?.id)
          .map((c) => formatCellText(c, computedCells[c.id], pages, rowsByPage).trim())
          .filter((txt) => txt && txt !== '—');
        const title = primaryTitle || otherTexts[0] || 'Sans titre';
        const rowBlocksText = (row.blocks ?? [])
          .map((b) => `${b.content} ${b.details ?? ''} ${b.url ?? ''}`)
          .join(' ');
        const rowCommentsText = (row.comments ?? []).map((c) => c.content).join(' ');
        const subtitleParts = [p.title || 'Base', ...otherTexts.slice(0, 3)];
        const searchText = `${p.title} ${title} ${otherTexts.join(' ')} ${rowBlocksText} ${rowCommentsText}`;
        pushIfMatch(
          {
            id: `row_${p.id}_${row.id}`,
            kind: 'row',
            title,
            subtitle: subtitleParts.join(' · '),
            targetPageId: p.id,
            targetRowId: row.id,
          },
          searchText
        );
        if (out.length >= limit) return out;
      }
    }
  }

  return out;
}
