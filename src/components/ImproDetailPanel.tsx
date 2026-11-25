import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { ImproPlanStep, RowComment } from '../types/workspace';
import { summarizeExerciseContentBlocks } from '../utils/exerciseContentTemplate';
import { generateId } from '../utils/id';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import {
  getSessionTotalDuration,
  parseSessionPlan,
  serializeSessionPlan,
} from '../utils/improEngine';
import { BlockEditor } from './BlockEditor';
import { DetailBreadcrumbBar } from './DetailBreadcrumbBar';
import { RelationActionChip, RelationActionRow } from './RelationActionRow';
import { ScoreRankInput } from './ScoreRankInput';

export function ImproDetailPanel() {
  const {
    user,
    pages,
    rowsByPage,
    improModel,
    improDetailTarget,
    openImproDetail,
    closeImproDetail,
    selectPage,
    restoreFromTrash,
    updateDatabaseRow,
    deleteDatabaseRows,
    updateRowBlocks,
    updateRowComments,
    prefillSeanceFromGroup,
    navigateToPrepare,
    navigateToTimeline,
    openLiveAnimation,
    syncSingleExerciseFromNotion,
    setExerciseScore,
  } = useWorkspace();

  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [subTab, setSubTab] = useState<'done' | 'never' | 'sessions'>('done');
  const [neverEtapeFilter, setNeverEtapeFilter] = useState('');
  const [customEtapeInput, setCustomEtapeInput] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [expandedDrawer, setExpandedDrawer] = useState(false);
  const [syncingFiche, setSyncingFiche] = useState(false);
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState(false);
  const [deletingExercise, setDeletingExercise] = useState(false);
  const [ficheSyncFeedback, setFicheSyncFeedback] = useState<{
    kind: 'ok' | 'error';
    message: string;
  } | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const targetRow = useMemo(() => {
    if (!improDetailTarget) return null;
    return (rowsByPage[improDetailTarget.pageId] ?? []).find(
      (r) => r.id === improDetailTarget.rowId
    );
  }, [improDetailTarget, rowsByPage]);

  useEffect(() => {
    setEditingBlock(null);
    setPickerQuery('');
    setCommentDraft('');
    setFicheSyncFeedback(null);
    setConfirmDeleteExercise(false);
    setDeletingExercise(false);
  }, [improDetailTarget?.pageId, improDetailTarget?.rowId]);

  useEffect(() => {
    if (!improDetailTarget?.focusTick || !targetRow) return;
    titleInputRef.current?.focus();
    const raf = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [improDetailTarget?.rowId, improDetailTarget?.focusTick, Boolean(targetRow)]);

  if (!improDetailTarget) return null;

  const { pageId, rowId } = improDetailTarget;
  const targetDbPage = pages.find((p) => p.id === pageId) ?? null;

  const renderFallbackPanel = (reason: string) => (
    <aside
      aria-label="Fiche introuvable"
      className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 bg-stone-50/70 dark:bg-[#0D1320]">
        <DetailBreadcrumbBar />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {targetDbPage?.title || 'Fiche'}
          </span>
          <button
            type="button"
            onClick={closeImproDetail}
            aria-label="Fermer la fiche"
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="p-5 space-y-4 text-sm">
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{reason}</p>
        <div className="flex flex-wrap items-center gap-2">
          {targetDbPage?.isTrashed && (
            <button
              type="button"
              onClick={() => void restoreFromTrash(targetDbPage.id)}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium whitespace-nowrap"
            >
              Restaurer la base
            </button>
          )}
          {targetDbPage && !targetDbPage.isTrashed && (
            <button
              type="button"
              onClick={() => selectPage(targetDbPage.id)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Voir la base</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeImproDetail}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Fermer
          </button>
        </div>
      </div>
    </aside>
  );

  if (!improModel.ready || !targetRow) {
    return renderFallbackPanel(
      targetDbPage?.isTrashed
        ? 'Cette base a été placée dans la corbeille. Restaurez-la pour consulter cette fiche.'
        : 'Cette fiche est introuvable ou a été supprimée.'
    );
  }

  const getRelationIds = (colId: string): string[] => {
    const raw = targetRow.cells[colId];
    return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
  };

  const addRelationId = (colId: string, targetId: string) => {
    const current = getRelationIds(colId);
    if (current.includes(targetId)) return;
    updateDatabaseRow(pageId, rowId, { ...targetRow.cells, [colId]: [...current, targetId] });
  };

  const removeRelationId = (colId: string, targetId: string) => {
    const current = getRelationIds(colId);
    if (!current.includes(targetId)) return;
    updateDatabaseRow(pageId, rowId, {
      ...targetRow.cells,
      [colId]: current.filter((id) => id !== targetId),
    });
  };

  const resetPicker = (blockName: string) => {
    setPickerQuery('');
    setEditingBlock((prev) => (prev === blockName ? null : blockName));
  };

  const renderHeader = (kindLabel: string, _title: string, nameColId: string) => (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 bg-stone-50/70 dark:bg-[#0D1320]">
      <DetailBreadcrumbBar />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{kindLabel}</span>
        <div className="flex items-center gap-1">
          {pageId === IMPRO_DB_IDS.exercices && (
            <button
              type="button"
              onClick={() => setExpandedDrawer((v) => !v)}
              aria-label={expandedDrawer ? 'Réduire la largeur du panneau' : 'Élargir le panneau'}
              title={expandedDrawer ? 'Réduire la largeur' : 'Élargir la fiche'}
              className="hidden lg:flex w-7 h-7 rounded-md items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              {expandedDrawer ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => selectPage(pageId)}
            className="h-7 px-2 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Voir dans la base</span>
          </button>
          <button
            type="button"
            onClick={closeImproDetail}
            aria-label="Fermer la fiche"
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <input
        ref={titleInputRef}
        type="text"
        value={String(targetRow.cells[nameColId] ?? '')}
        onChange={(e) =>
          updateDatabaseRow(pageId, rowId, { ...targetRow.cells, [nameColId]: e.target.value })
        }
        placeholder={`Nom (${kindLabel.toLowerCase()})...`}
        aria-label={`Nom ${kindLabel.toLowerCase()}`}
        className="w-full bg-transparent font-display text-lg font-semibold text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none border-b border-transparent focus:border-indigo-400 pb-0.5"
      />
    </div>
  );

  // 1. FICHE EXERCICE
  if (pageId === IMPRO_DB_IDS.exercices) {
    const ex = improModel.exerciseById.get(rowId);
    if (!ex) return renderFallbackPanel('Cet exercice est introuvable ou a été supprimé.');

    const participantStats = new Map<string, { count: number; lastDate: string }>();
    for (const s of ex.sessions) {
      for (const pid of s.participantIds) {
        const cur = participantStats.get(pid) ?? { count: 0, lastDate: '' };
        cur.count += 1;
        if (!cur.lastDate || s.date > cur.lastDate) cur.lastDate = s.date;
        participantStats.set(pid, cur);
      }
    }

    const q = pickerQuery.trim().toLowerCase();
    const filteredSeances = improModel.seances.filter(
      (s) => !q || s.nom.toLowerCase().includes(q) || s.date.includes(q)
    );

    return (
      <aside
        aria-label="Fiche exercice"
        className={`w-full ${
          expandedDrawer ? 'lg:w-[680px] xl:w-[780px]' : 'lg:w-[540px] xl:w-[640px]'
        } shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full transition-[width] duration-200`}
      >
        {renderHeader('Exercice Biblimpro', ex.nom, IMPRO_COL_IDS.exercices.nom)}
        <div data-detail-scroll="true" className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{ex.usageCount} séances</span>
            {ex.plannedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-600 dark:text-amber-400">{ex.plannedCount} prévues</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{ex.groupIds.length} groupes</span>
            <span aria-hidden="true">·</span>
            <span>{ex.participantIds.length} participants</span>
            {ex.lastDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>Dernière : {ex.lastDate}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {targetRow.notionSyncedAt
                ? `Synchro Notion : ${(() => {
                    try {
                      return new Date(targetRow.notionSyncedAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                      });
                    } catch {
                      return targetRow.notionSyncedAt.slice(0, 10);
                    }
                  })()}`
                : 'Non synchronisée Notion'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPrepare({ addExerciseIds: [ex.id] })}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Ajouter à Préparer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'chronology', exerciseId: ex.id })}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Chronologie
            </button>
            <button
              type="button"
              disabled={syncingFiche}
              onClick={async () => {
                setSyncingFiche(true);
                setFicheSyncFeedback(null);
                try {
                  const res = await syncSingleExerciseFromNotion(ex.id);
                  const details = [
                    `${res.blocksCount} ${res.blocksCount > 1 ? 'blocs' : 'bloc'}`,
                    `${res.commentsCount} ${res.commentsCount > 1 ? 'commentaires' : 'commentaire'}`,
                  ].join(' · ');
                  setFicheSyncFeedback({
                    kind: 'ok',
                    message: res.warning
                      ? `${details} (${res.warning})`
                      : `Fiche synchronisée (${details}).`,
                  });
                } catch (err) {
                  setFicheSyncFeedback({
                    kind: 'error',
                    message:
                      err instanceof Error
                        ? err.message
                        : 'Synchronisation Notion impossible pour cette fiche.',
                  });
                } finally {
                  setSyncingFiche(false);
                }
              }}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {syncingFiche ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{syncingFiche ? 'Synchro…' : 'Synchro Notion'}</span>
            </button>
            {confirmDeleteExercise ? (
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={deletingExercise}
                  onClick={async () => {
                    if (deletingExercise) return;
                    setDeletingExercise(true);
                    try {
                      await deleteDatabaseRows(IMPRO_DB_IDS.exercices, [ex.id]);
                      setConfirmDeleteExercise(false);
                    } finally {
                      setDeletingExercise(false);
                    }
                  }}
                  className="h-8 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 whitespace-nowrap"
                >
                  {deletingExercise ? 'Suppression…' : 'Confirmer'}
                </button>
                <button
                  type="button"
                  disabled={deletingExercise}
                  onClick={() => setConfirmDeleteExercise(false)}
                  className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  Non
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteExercise(true)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer</span>
              </button>
            )}
          </div>

          {ficheSyncFeedback && (
            <div
              className={`px-3 py-2 rounded-lg border text-xs ${
                ficheSyncFeedback.kind === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300'
                  : 'border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 text-red-700 dark:text-red-300'
              }`}
            >
              {ficheSyncFeedback.message}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700 dark:text-slate-300 py-2 border-y border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-4">
              {(
                [
                  { colId: IMPRO_COL_IDS.exercices.check1, label: 'Niveau 1', checked: ex.check1 },
                  { colId: IMPRO_COL_IDS.exercices.check2, label: 'Niveau 2', checked: ex.check2 },
                  { colId: IMPRO_COL_IDS.exercices.checkV, label: 'Validé (V)', checked: ex.checkV },
                ] as const
              ).map((item) => (
                <label key={item.colId} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) =>
                      updateDatabaseRow(pageId, rowId, {
                        ...targetRow.cells,
                        [item.colId]: e.target.checked,
                      })
                    }
                    className="w-3.5 h-3.5 rounded accent-indigo-600"
                  />
                  <span className="font-medium">{item.label}</span>
                </label>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 shrink-0">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Score</span>
              <div className="w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                <ScoreRankInput
                  value={targetRow.cells[IMPRO_COL_IDS.exercices.score]}
                  maxRank={Math.max(1, (rowsByPage[IMPRO_DB_IDS.exercices] ?? []).length)}
                  ariaLabel={`Score de classement pour ${ex.nom}`}
                  onCommit={(nextRank) => setExerciseScore(rowId, nextRank)}
                />
              </div>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                / {Math.max(1, (rowsByPage[IMPRO_DB_IDS.exercices] ?? []).length)}
              </span>
            </label>
          </div>

          {(() => {
            const exPage = pages.find((p) => p.id === IMPRO_DB_IDS.exercices);
            const etapeCol = exPage?.columns?.find((c) => c.id === IMPRO_COL_IDS.exercices.etape);
            const tagsCol = exPage?.columns?.find((c) => c.id === IMPRO_COL_IDS.exercices.tags);
            const etapeOptions = Array.from(
              new Set([...(etapeCol?.options ?? []), ...improModel.allEtapes, ...ex.etapes])
            );
            const tagOptions = Array.from(
              new Set([...(tagsCol?.options ?? []), ...ex.tags])
            );
            const toggleMultiCell = (colId: string, current: string[], value: string) => {
              const next = current.includes(value)
                ? current.filter((v) => v !== value)
                : [...current, value];
              updateDatabaseRow(pageId, rowId, { ...targetRow.cells, [colId]: next });
            };
            const addCustomMultiCell = (
              colId: string,
              current: string[],
              raw: string,
              clear: () => void
            ) => {
              const trimmed = raw.trim();
              if (!trimmed) return;
              if (!current.includes(trimmed)) {
                updateDatabaseRow(pageId, rowId, {
                  ...targetRow.cells,
                  [colId]: [...current, trimmed],
                });
              }
              clear();
            };

            return (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Étape
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {etapeOptions.map((et) => {
                      const active = ex.etapes.includes(et);
                      return (
                        <button
                          key={et}
                          type="button"
                          onClick={() => toggleMultiCell(IMPRO_COL_IDS.exercices.etape, ex.etapes, et)}
                          className={`px-2 py-0.5 rounded-md border text-xs transition-colors ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                          }`}
                        >
                          {et}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <input
                      type="text"
                      value={customEtapeInput}
                      onChange={(e) => setCustomEtapeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomMultiCell(
                            IMPRO_COL_IDS.exercices.etape,
                            ex.etapes,
                            customEtapeInput,
                            () => setCustomEtapeInput('')
                          );
                        }
                      }}
                      placeholder="Ajouter une étape..."
                      aria-label="Ajouter une étape"
                      className="flex-1 h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        addCustomMultiCell(
                          IMPRO_COL_IDS.exercices.etape,
                          ex.etapes,
                          customEtapeInput,
                          () => setCustomEtapeInput('')
                        )
                      }
                      aria-label="Valider étape"
                      className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Tags
                  </div>
                  {tagOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagOptions.slice(0, 24).map((tag) => {
                        const active = ex.tags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleMultiCell(IMPRO_COL_IDS.exercices.tags, ex.tags, tag)}
                            className={`px-2 py-0.5 rounded-md border text-xs transition-colors ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomMultiCell(
                            IMPRO_COL_IDS.exercices.tags,
                            ex.tags,
                            customTagInput,
                            () => setCustomTagInput('')
                          );
                        }
                      }}
                      placeholder="Ajouter un tag..."
                      aria-label="Ajouter un tag"
                      className="flex-1 h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        addCustomMultiCell(
                          IMPRO_COL_IDS.exercices.tags,
                          ex.tags,
                          customTagInput,
                          () => setCustomTagInput('')
                        )
                      }
                      aria-label="Valider tag"
                      className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="space-y-1.5">
            <label
              htmlFor="impro-ex-desc"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Description / Consignes
            </label>
            <textarea
              id="impro-ex-desc"
              rows={4}
              value={String(targetRow.cells[IMPRO_COL_IDS.exercices.description] ?? '')}
              onChange={(e) =>
                updateDatabaseRow(pageId, rowId, {
                  ...targetRow.cells,
                  [IMPRO_COL_IDS.exercices.description]: e.target.value,
                })
              }
              placeholder="Ajouter une consigne, une variante ou un rappel..."
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Discussions & Contenu intégré directement dans la fiche */}
          {(() => {
            const legacyLinkedPage = targetRow.linkedPageId
              ? pages.find((p) => p.id === targetRow.linkedPageId && !p.isTrashed) ?? null
              : null;
            const inlineBlocks = targetRow.blocks ?? legacyLinkedPage?.blocks ?? [];
            const comments: RowComment[] = targetRow.comments ?? [];
            const authorDisplayName =
              user?.displayName?.trim() ||
              user?.email?.split('@')[0] ||
              'Animateur';
            const authorInitial = authorDisplayName.charAt(0).toUpperCase() || 'A';

            const submitComment = () => {
              const trimmed = commentDraft.trim();
              if (!trimmed) return;
              const nextComment: RowComment = {
                id: generateId('cmt'),
                authorName: authorDisplayName.slice(0, 80),
                content: trimmed.slice(0, 2000),
                createdAt: new Date().toISOString(),
              };
              updateRowComments(pageId, rowId, [...comments, nextComment]);
              setCommentDraft('');
            };

            const deleteComment = (commentId: string) => {
              updateRowComments(
                pageId,
                rowId,
                comments.filter((c) => c.id !== commentId)
              );
            };

            const summary = summarizeExerciseContentBlocks(inlineBlocks);
            const summaryParts = summary.hasMeaningfulContent
              ? [
                  summary.videoCount > 0
                    ? `${summary.videoCount} ${summary.videoCount > 1 ? 'vidéos' : 'vidéo'}`
                    : '',
                  summary.audioCount > 0
                    ? `${summary.audioCount} ${summary.audioCount > 1 ? 'audios' : 'audio'}`
                    : '',
                  summary.todoTotal > 0 ? `${summary.todoDone}/${summary.todoTotal} cochées` : '',
                ].filter(Boolean)
              : [];

            return (
              <div className="space-y-4 pt-1">
                {/* Discussions */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Discussions{comments.length > 0 ? ` (${comments.length})` : ''}
                    </span>
                  </div>

                  {comments.length > 0 && (
                    <div className="space-y-2">
                      {comments.map((cmt) => {
                        const initial = (cmt.authorName || 'A').charAt(0).toUpperCase();
                        let timeLabel = '';
                        try {
                          timeLabel = new Date(cmt.createdAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                          });
                        } catch {
                          timeLabel = '';
                        }
                        return (
                          <div
                            key={cmt.id}
                            className="group flex items-start gap-2.5 text-xs"
                          >
                            <div
                              aria-hidden="true"
                              className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium flex items-center justify-center shrink-0 mt-0.5"
                            >
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {cmt.authorName}
                                </span>
                                {timeLabel && (
                                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                                    {timeLabel}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {cmt.content}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteComment(cmt.id)}
                              aria-label="Supprimer le commentaire"
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-opacity shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <div
                      aria-hidden="true"
                      className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center justify-center shrink-0"
                    >
                      {authorInitial}
                    </div>
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitComment();
                        }
                      }}
                      placeholder="Ajouter un commentaire..."
                      aria-label="Ajouter un commentaire"
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-800 focus:border-indigo-500 bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                    />
                    {commentDraft.trim() && (
                      <button
                        type="button"
                        onClick={submitComment}
                        aria-label="Envoyer le commentaire"
                        className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        <Send className="w-3 h-3" />
                        <span>Envoyer</span>
                      </button>
                    )}
                  </div>
                </div>

                <hr className="border-slate-200 dark:border-slate-800" />

                {/* Contenu riche intégré directement dans la fiche */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Contenu de la fiche
                    </span>
                    {summaryParts.length > 0 && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {summaryParts.join(' · ')}
                      </span>
                    )}
                  </div>
                  <BlockEditor
                    embedded
                    editorKey={rowId}
                    titleForPaste={ex.nom}
                    blocks={inlineBlocks}
                    onChangeBlocks={(next) => updateRowBlocks(pageId, rowId, next)}
                    emptyPlaceholder="Écrire, coller un lien YouTube/audio ou taper /..."
                  />
                </div>
              </div>
            );
          })()}

          {/* Groupes ayant pratiqué */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Groupes ({ex.groupIds.length})
            </div>
            {ex.groupIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun groupe</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ex.groupIds.map((gid) => {
                  const g = improModel.groupById.get(gid);
                  return (
                    <button
                      key={gid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                    >
                      {g?.nom ?? gid}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Participants ayant pratiqué */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Participants ({ex.participantIds.length})
            </div>
            {ex.participantIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun participant</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ex.participantIds.map((pid) => {
                  const p = improModel.participantById.get(pid);
                  const st = participantStats.get(pid);
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                    >
                      {p?.displayLabel ?? pid}
                      {st && st.count > 1 ? ` (${st.count}×)` : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Séances liées */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Séances ({ex.sessions.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('ex_seances')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {editingBlock === 'ex_seances' ? 'Terminer' : '+ Ajouter'}
              </button>
            </div>
            {editingBlock === 'ex_seances' && (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher une séance..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredSeances.map((s) => (
                    <RelationActionRow
                      key={s.id}
                      compact
                      label={s.nom}
                      meta={s.date || '—'}
                      isLinked={ex.seanceIds.includes(s.id)}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                      onAdd={() => addRelationId(IMPRO_COL_IDS.exercices.seances, s.id)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.exercices.seances, s.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {ex.sessions.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune séance enregistrée</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {ex.sessions.map((s) => (
                  <RelationActionRow
                    key={s.id}
                    label={s.nom}
                    meta={`${s.date || '—'} · ${s.groupeNames[0] || 'Sans groupe'}`}
                    isLinked={true}
                    onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                    onRemove={() => removeRelationId(IMPRO_COL_IDS.exercices.seances, s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 2. FICHE SÉANCE
  if (pageId === IMPRO_DB_IDS.seances) {
    const sea = improModel.seanceById.get(rowId);
    if (!sea) return renderFallbackPanel('Cette séance est introuvable ou a été supprimée.');

    const q = pickerQuery.trim().toLowerCase();
    const filteredExos = improModel.exercises.filter(
      (e) =>
        !q ||
        e.nom.toLowerCase().includes(q) ||
        e.etapes.some((et) => et.toLowerCase().includes(q))
    );
    const filteredPars = improModel.participants.filter(
      (p) => !q || p.displayLabel.toLowerCase().includes(q)
    );

    const rawExIds = getRelationIds(IMPRO_COL_IDS.seances.exercices);
    const steps = parseSessionPlan(targetRow.cells[IMPRO_COL_IDS.seances.deroule], rawExIds);
    const totalDurationMin = getSessionTotalDuration(steps);

    const commitSeanceSteps = (nextSteps: ImproPlanStep[]) => {
      const nextExIds = Array.from(
        new Set(
          nextSteps
            .filter((st) => st.kind === 'exercise' && st.exerciceId)
            .map((st) => st.exerciceId!)
        )
      );
      updateDatabaseRow(pageId, rowId, {
        ...targetRow.cells,
        [IMPRO_COL_IDS.seances.exercices]: nextExIds,
        [IMPRO_COL_IDS.seances.deroule]: serializeSessionPlan(nextSteps),
      });
    };

    const addExerciseToSeance = (exerciceId: string) => {
      if (rawExIds.includes(exerciceId)) return;
      commitSeanceSteps([
        ...steps,
        {
          id: generateId('step'),
          kind: 'exercise',
          exerciceId,
          durationMin: 15,
          note: '',
        },
      ]);
    };

    const removeExerciseFromSeance = (exerciceId: string) => {
      commitSeanceSteps(
        steps.filter((st) => !(st.kind === 'exercise' && st.exerciceId === exerciceId))
      );
    };

    const addCustomStepToSeance = () => {
      commitSeanceSteps([
        ...steps,
        {
          id: generateId('step'),
          kind: 'custom',
          label: steps.length === 0 ? 'Accueil & météo' : 'Temps libre',
          durationMin: 10,
          note: '',
        },
      ]);
    };

    const updateSeanceStep = (stepId: string, patch: Partial<ImproPlanStep>) => {
      commitSeanceSteps(steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)));
    };

    const moveSeanceStep = (index: number, delta: -1 | 1) => {
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= steps.length) return;
      const next = [...steps];
      const [item] = next.splice(index, 1);
      next.splice(targetIdx, 0, item);
      commitSeanceSteps(next);
    };

    const removeSeanceStep = (stepId: string) => {
      commitSeanceSteps(steps.filter((st) => st.id !== stepId));
    };

    return (
      <aside
        aria-label="Fiche séance"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Séance', sea.nom, IMPRO_COL_IDS.seances.nom)}
        <div data-detail-scroll="true" className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openLiveAnimation(sea.id)}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Animer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToPrepare({ seanceId: sea.id })}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>Éditer dans Préparer</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToPrepare({ duplicateFromId: sea.id })}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
            >
              <Copy className="w-3 h-3" />
              <span>Dupliquer</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label
                htmlFor="impro-sea-date"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Date
              </label>
              <input
                id="impro-sea-date"
                type="date"
                value={String(targetRow.cells[IMPRO_COL_IDS.seances.date] ?? '')}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.date]: e.target.value,
                  })
                }
                className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent font-mono text-xs tabular-nums focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="impro-sea-statut"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Statut
              </label>
              <select
                id="impro-sea-statut"
                value={sea.status}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.statut]: e.target.value,
                  })
                }
                className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none"
              >
                <option value="Réalisée">Réalisée</option>
                <option value="Préparée">Préparée</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <label
                  htmlFor="impro-sea-grp"
                  className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  Groupe
                </label>
                {sea.groupeIds[0] && (
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, sea.groupeIds[0])}
                    aria-label="Ouvrir la fiche du groupe"
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Fiche
                  </button>
                )}
              </div>
              <select
                id="impro-sea-grp"
                value={sea.groupeIds[0] ?? ''}
                onChange={(e) =>
                  updateDatabaseRow(pageId, rowId, {
                    ...targetRow.cells,
                    [IMPRO_COL_IDS.seances.groupe]: e.target.value ? [e.target.value] : [],
                  })
                }
                className="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none"
              >
                <option value="">Aucun</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom}
                  </option>
                ))}
              </select>
              {sea.groupeIds.length > 1 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {sea.groupeIds.map((gid) => {
                    const g = improModel.groupById.get(gid);
                    return (
                      <button
                        key={gid}
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {g?.nom ?? gid}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="impro-sea-notes"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Notes de séance
            </label>
            <textarea
              id="impro-sea-notes"
              rows={2}
              value={String(targetRow.cells[IMPRO_COL_IDS.seances.notes] ?? '')}
              onChange={(e) =>
                updateDatabaseRow(pageId, rowId, {
                  ...targetRow.cells,
                  [IMPRO_COL_IDS.seances.notes]: e.target.value,
                })
              }
              placeholder="Intention, retours à chaud..."
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Présents */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Participants ({sea.participantIds.length})
              </span>
              <div className="flex items-center gap-2">
                {sea.groupeIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => prefillSeanceFromGroup(sea.id, 'merge')}
                    className="text-xs text-slate-600 dark:text-slate-300 hover:underline inline-flex items-center gap-1"
                  >
                    <Users className="w-3 h-3" />
                    <span>+ Groupe</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => resetPicker('sea_pars')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {editingBlock === 'sea_pars' ? 'Terminer' : '+ Ajouter'}
                </button>
              </div>
            </div>

            {editingBlock === 'sea_pars' && (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher un participant..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredPars.map((p) => (
                    <RelationActionRow
                      key={p.id}
                      compact
                      label={p.displayLabel}
                      isLinked={sea.participantIds.includes(p.id)}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                      onAdd={() => addRelationId(IMPRO_COL_IDS.seances.participants, p.id)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.seances.participants, p.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {sea.participantIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun participant</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sea.participantIds.map((pid) => {
                  const p = improModel.participantById.get(pid);
                  return (
                    <RelationActionChip
                      key={pid}
                      label={p?.displayLabel ?? pid}
                      isLinked={true}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.seances.participants, pid)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Déroulé & Exercices (Éditeur complet intégré) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Déroulé ({steps.length})
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  · {totalDurationMin} min
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCustomStepToSeance}
                  className="text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline whitespace-nowrap"
                >
                  + Temps libre
                </button>
                <button
                  type="button"
                  onClick={() => resetPicker('sea_exos')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                >
                  {editingBlock === 'sea_exos' ? 'Terminer' : '+ Exercice'}
                </button>
              </div>
            </div>

            {editingBlock === 'sea_exos' && (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher un exercice..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredExos.slice(0, 120).map((ex) => (
                    <RelationActionRow
                      key={ex.id}
                      compact
                      label={ex.nom}
                      meta={ex.etapes[0] || ''}
                      isLinked={rawExIds.includes(ex.id)}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      onAdd={() => addExerciseToSeance(ex.id)}
                      onRemove={() => removeExerciseFromSeance(ex.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {steps.length === 0 ? (
              <p className="text-xs text-slate-400">
                Aucune séquence. Ajoutez un exercice ou un temps libre.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {steps.map((st, idx) => {
                  const ex =
                    st.kind === 'exercise' && st.exerciceId
                      ? improModel.exerciseById.get(st.exerciceId)
                      : undefined;
                  return (
                    <div key={st.id} className="p-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="font-mono tabular-nums text-slate-400 shrink-0">
                            {String(idx + 1).padStart(2, '0')}.
                          </span>
                          {st.kind === 'exercise' && st.exerciceId ? (
                            <button
                              type="button"
                              onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, st.exerciceId!)}
                              title={`Ouvrir la fiche : ${ex?.nom ?? st.exerciceId}`}
                              className="text-left font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
                            >
                              {ex?.nom ?? st.exerciceId}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={st.label ?? ''}
                              onChange={(e) => updateSeanceStep(st.id, { label: e.target.value })}
                              placeholder="Temps libre..."
                              aria-label={`Nom étape ${idx + 1}`}
                              className="flex-1 min-w-0 h-6 px-1.5 rounded border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={240}
                            value={st.durationMin}
                            onChange={(e) =>
                              updateSeanceStep(st.id, {
                                durationMin: Math.max(0, Math.min(240, Number(e.target.value) || 0)),
                              })
                            }
                            aria-label={`Durée étape ${idx + 1}`}
                            className="w-12 h-6 px-1 rounded border border-slate-200 dark:border-slate-800 bg-transparent text-right font-mono text-[11px] tabular-nums focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-[11px] text-slate-400">min</span>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSeanceStep(idx, -1)}
                            aria-label={`Monter étape ${idx + 1}`}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === steps.length - 1}
                            onClick={() => moveSeanceStep(idx, 1)}
                            aria-label={`Descendre étape ${idx + 1}`}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSeanceStep(st.id)}
                            aria-label={`Retirer étape ${idx + 1}`}
                            title="Retirer du déroulé"
                            className="w-6 h-6 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 text-slate-400 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="pl-6">
                        <input
                          type="text"
                          value={st.note}
                          onChange={(e) => updateSeanceStep(st.id, { note: e.target.value })}
                          placeholder="Consigne, variante..."
                          aria-label={`Note étape ${idx + 1}`}
                          className="w-full h-6 px-2 rounded border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 3. FICHE GROUPE
  if (pageId === IMPRO_DB_IDS.groupes) {
    const grp = improModel.groupById.get(rowId);
    if (!grp) return renderFallbackPanel('Ce groupe est introuvable ou a été supprimé.');

    const q = pickerQuery.trim().toLowerCase();
    const filteredPars = improModel.participants.filter(
      (p) => !q || p.displayLabel.toLowerCase().includes(q)
    );
    const filteredSeances = improModel.seances.filter(
      (s) => !q || s.nom.toLowerCase().includes(q) || s.date.includes(q)
    );
    const filteredNever = grp.neverDoneExercises.filter(
      (e) => !neverEtapeFilter || e.etapes.includes(neverEtapeFilter)
    );

    return (
      <aside
        aria-label="Fiche groupe"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Groupe', grp.nom, IMPRO_COL_IDS.groupes.nom)}
        <div data-detail-scroll="true" className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{grp.participantIds.length} membres</span>
            <span aria-hidden="true">·</span>
            <span>{grp.sessions.length} séances</span>
            <span aria-hidden="true">·</span>
            <span>{grp.attendancePct}% assiduité</span>
            <span aria-hidden="true">·</span>
            <span>{grp.coveragePct}% répertoire</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToPrepare({ groupId: grp.id })}
              className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Préparer un atelier</span>
            </button>
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'matrix', groupId: grp.id })}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Matrice
            </button>
          </div>

          {/* Membres */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Membres ({grp.participantIds.length})
              </span>
              <button
                type="button"
                onClick={() => resetPicker('grp_pars')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {editingBlock === 'grp_pars' ? 'Terminer' : '+ Ajouter'}
              </button>
            </div>
            {editingBlock === 'grp_pars' && (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Chercher un participant..."
                    className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredPars.map((p) => (
                    <RelationActionRow
                      key={p.id}
                      compact
                      label={p.displayLabel}
                      isLinked={grp.participantIds.includes(p.id)}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                      onAdd={() => addRelationId(IMPRO_COL_IDS.groupes.participants, p.id)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.groupes.participants, p.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {grp.participantIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun membre</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {grp.participantIds.map((pid) => {
                  const p = improModel.participantById.get(pid);
                  return (
                    <RelationActionChip
                      key={pid}
                      label={p?.displayLabel ?? pid}
                      isLinked={true}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.groupes.participants, pid)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Onglets Faits / Jamais faits / Séances */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'done', label: `Pratiqués (${grp.practicedExercises.length})` },
                  { id: 'never', label: `Jamais (${grp.neverDoneExercises.length})` },
                  { id: 'sessions', label: `Séances (${grp.sessions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex-1 py-1 px-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    subTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {subTab === 'done' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-80 overflow-y-auto">
                {grp.practicedExercises.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">Aucun exercice</p>
                ) : (
                  grp.practicedExercises.map((rec) => (
                    <RelationActionRow
                      key={rec.exerciceId}
                      label={rec.nom}
                      meta={`${rec.count}× · ${rec.lastDate || '—'}`}
                      isLinked={false}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                      onAdd={() =>
                        navigateToPrepare({
                          groupId: grp.id,
                          addExerciseIds: [rec.exerciceId],
                        })
                      }
                    />
                  ))
                )}
              </div>
            )}

            {subTab === 'never' && (
              <div className="space-y-2">
                <select
                  value={neverEtapeFilter}
                  onChange={(e) => setNeverEtapeFilter(e.target.value)}
                  aria-label="Filtrer par étape"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="">Toutes les étapes</option>
                  {improModel.allEtapes.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-72 overflow-y-auto">
                  {filteredNever.slice(0, 150).map((ex) => (
                    <RelationActionRow
                      key={ex.id}
                      label={ex.nom}
                      meta={ex.etapes.join(', ')}
                      isLinked={false}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      onAdd={() =>
                        navigateToPrepare({
                          groupId: grp.id,
                          addExerciseIds: [ex.id],
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {subTab === 'sessions' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Séances liées
                  </span>
                  <button
                    type="button"
                    onClick={() => resetPicker('grp_seances')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {editingBlock === 'grp_seances' ? 'Terminer' : '+ Ajouter'}
                  </button>
                </div>
                {editingBlock === 'grp_seances' && (
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Chercher une séance..."
                        className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredSeances.map((s) => (
                        <RelationActionRow
                          key={s.id}
                          compact
                          label={s.nom}
                          meta={s.date || '—'}
                          isLinked={grp.seanceIds.includes(s.id)}
                          onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                          onAdd={() => addRelationId(IMPRO_COL_IDS.groupes.seances, s.id)}
                          onRemove={() => removeRelationId(IMPRO_COL_IDS.groupes.seances, s.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-80 overflow-y-auto">
                  {grp.sessions.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">Aucune séance</p>
                  ) : (
                    grp.sessions.map((s) => (
                      <RelationActionRow
                        key={s.id}
                        label={s.nom}
                        meta={s.date || '—'}
                        isLinked={true}
                        onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                        onRemove={() => removeRelationId(IMPRO_COL_IDS.groupes.seances, s.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 4. FICHE PARTICIPANT
  if (pageId === IMPRO_DB_IDS.participants) {
    const par = improModel.participantById.get(rowId);
    if (!par) return renderFallbackPanel('Ce participant est introuvable ou a été supprimé.');

    const q = pickerQuery.trim().toLowerCase();
    const filteredNever = par.neverDoneExercises.filter(
      (e) => !neverEtapeFilter || e.etapes.includes(neverEtapeFilter)
    );
    const filteredSeances = improModel.seances.filter(
      (s) => !q || s.nom.toLowerCase().includes(q) || s.date.includes(q)
    );

    return (
      <aside
        aria-label="Fiche participant"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        {renderHeader('Participant', par.displayLabel, IMPRO_COL_IDS.participants.nom)}
        <div data-detail-scroll="true" className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono tabular-nums">
            <span>{par.presenceCount} présences</span>
            <span aria-hidden="true">·</span>
            <span>{par.attendancePct}% assiduité</span>
            <span aria-hidden="true">·</span>
            <span>{par.doneExercises.length} faits</span>
            <span aria-hidden="true">·</span>
            <span>{par.neverDoneExercises.length} jamais faits</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateToTimeline({ mode: 'participant', participantId: par.id })}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Bilan complet
            </button>
          </div>

          {/* Groupes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Groupe</span>
              <button
                type="button"
                onClick={() => resetPicker('par_grps')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {editingBlock === 'par_grps' ? 'Terminer' : '+ Ajouter'}
              </button>
            </div>
            {editingBlock === 'par_grps' && (
              <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {improModel.groups.map((g) => (
                  <RelationActionRow
                    key={g.id}
                    compact
                    label={g.nom}
                    meta={`${g.participantIds.length} membres`}
                    isLinked={par.groupeIds.includes(g.id)}
                    onOpen={() => openImproDetail(IMPRO_DB_IDS.groupes, g.id)}
                    onAdd={() => addRelationId(IMPRO_COL_IDS.participants.groupe, g.id)}
                    onRemove={() => removeRelationId(IMPRO_COL_IDS.participants.groupe, g.id)}
                  />
                ))}
              </div>
            )}
            {par.groupeIds.length === 0 ? (
              <p className="text-xs text-slate-400">Aucun groupe</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {par.groupeIds.map((gid) => {
                  const g = improModel.groupById.get(gid);
                  return (
                    <RelationActionChip
                      key={gid}
                      label={g?.nom ?? gid}
                      isLinked={true}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                      onRemove={() => removeRelationId(IMPRO_COL_IDS.participants.groupe, gid)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Onglets Faits / Jamais faits / Séances */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'done', label: `Faits (${par.doneExercises.length})` },
                  { id: 'never', label: `Jamais (${par.neverDoneExercises.length})` },
                  { id: 'sessions', label: `Séances (${par.sessions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`flex-1 py-1 px-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    subTab === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {subTab === 'done' && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-80 overflow-y-auto">
                {par.doneExercises.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">Aucun exercice fait</p>
                ) : (
                  par.doneExercises.map((rec) => (
                    <RelationActionRow
                      key={rec.exerciceId}
                      label={rec.nom}
                      meta={`${rec.count}× · ${rec.lastDate || '—'}`}
                      isLinked={false}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                      onAdd={() =>
                        navigateToPrepare({
                          groupId: par.groupeIds[0] || undefined,
                          addExerciseIds: [rec.exerciceId],
                        })
                      }
                    />
                  ))
                )}
              </div>
            )}

            {subTab === 'never' && (
              <div className="space-y-2">
                <select
                  value={neverEtapeFilter}
                  onChange={(e) => setNeverEtapeFilter(e.target.value)}
                  aria-label="Filtrer par étape"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="">Toutes les étapes</option>
                  {improModel.allEtapes.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-72 overflow-y-auto">
                  {filteredNever.slice(0, 150).map((ex) => (
                    <RelationActionRow
                      key={ex.id}
                      label={ex.nom}
                      meta={ex.etapes.join(', ')}
                      isLinked={false}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      onAdd={() =>
                        navigateToPrepare({
                          groupId: par.groupeIds[0] || undefined,
                          addExerciseIds: [ex.id],
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {subTab === 'sessions' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Présences enregistrées
                  </span>
                  <button
                    type="button"
                    onClick={() => resetPicker('par_seances')}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {editingBlock === 'par_seances' ? 'Terminer' : '+ Ajouter'}
                  </button>
                </div>
                {editingBlock === 'par_seances' && (
                  <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={pickerQuery}
                        onChange={(e) => setPickerQuery(e.target.value)}
                        placeholder="Chercher une séance..."
                        className="w-full h-7 pl-7 pr-2 text-xs rounded border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                      {filteredSeances.map((s) => (
                        <RelationActionRow
                          key={s.id}
                          compact
                          label={s.nom}
                          meta={s.date || '—'}
                          isLinked={par.seanceIds.includes(s.id)}
                          onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                          onAdd={() => addRelationId(IMPRO_COL_IDS.participants.seances, s.id)}
                          onRemove={() => removeRelationId(IMPRO_COL_IDS.participants.seances, s.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-lg max-h-80 overflow-y-auto">
                  {par.sessions.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">Aucune séance</p>
                  ) : (
                    par.sessions.map((s) => (
                      <RelationActionRow
                        key={s.id}
                        label={s.nom}
                        meta={`${s.date || '—'} · ${s.groupeNames[0] || 'Sans groupe'}`}
                        isLinked={true}
                        onOpen={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                        onRemove={() => removeRelationId(IMPRO_COL_IDS.participants.seances, s.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
