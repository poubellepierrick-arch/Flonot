import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Plus, Search, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { CellValue, DatabaseColumn } from '../types/workspace';
import { getPrimaryColumn } from '../utils/columnOrder';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { formatCellText, getComputedRowCells } from '../utils/notionFormula';
import { DetailBreadcrumbBar } from './DetailBreadcrumbBar';
import { RelationActionChip, RelationActionRow } from './RelationActionRow';

export function RowDetailPanel() {
  const {
    pages,
    rowsByPage,
    improModel,
    improDetailTarget,
    openImproDetail,
    closeImproDetail,
    updateDatabaseRow,
    deleteDatabaseRow,
    openOrCreateRowPage,
    restoreFromTrash,
    selectPage,
  } = useWorkspace();

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [newTagByCol, setNewTagByCol] = useState<Record<string, string>>({});
  const [relSearchByCol, setRelSearchByCol] = useState<Record<string, string>>({});

  const targetPage = useMemo(() => {
    if (!improDetailTarget) return null;
    return pages.find((p) => p.id === improDetailTarget.pageId) ?? null;
  }, [improDetailTarget, pages]);

  const targetRow = useMemo(() => {
    if (!improDetailTarget) return null;
    return (rowsByPage[improDetailTarget.pageId] ?? []).find(
      (r) => r.id === improDetailTarget.rowId
    ) ?? null;
  }, [improDetailTarget, rowsByPage]);

  useEffect(() => {
    setRelSearchByCol({});
  }, [improDetailTarget?.pageId, improDetailTarget?.rowId]);

  useEffect(() => {
    if (!improDetailTarget?.focusTick || !targetRow) return;
    titleInputRef.current?.focus();
    const raf = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [improDetailTarget?.rowId, improDetailTarget?.focusTick, Boolean(targetRow)]);

  const computed = useMemo(() => {
    if (!targetPage || !targetRow) return null;
    return getComputedRowCells(targetPage, targetRow, pages, rowsByPage);
  }, [targetPage, targetRow, pages, rowsByPage]);

  if (!improDetailTarget) return null;

  if (!targetPage || !targetRow) {
    return (
      <aside
        aria-label="Fiche introuvable"
        className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 bg-stone-50/70 dark:bg-[#0D1320]">
          <DetailBreadcrumbBar />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {targetPage?.title || 'Fiche'}
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
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {!targetPage
              ? 'La base associée à cette fiche est introuvable ou a été supprimée.'
              : 'Cette ligne est introuvable ou a été supprimée.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {targetPage && !targetPage.isTrashed && (
              <button
                type="button"
                onClick={() => selectPage(targetPage.id)}
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
  }

  const columns: DatabaseColumn[] =
    targetPage.columns && targetPage.columns.length > 0
      ? targetPage.columns
      : [{ id: 'col_titre', name: 'Nom', type: 'text' }];

  const primaryCol = getPrimaryColumn(columns) ?? columns[0];
  const otherCols = columns.filter((c) => c.id !== primaryCol.id);

  const updateCell = (colId: string, val: CellValue) => {
    updateDatabaseRow(targetPage.id, targetRow.id, {
      ...targetRow.cells,
      [colId]: val,
    });
  };

  const renderFieldEditor = (col: DatabaseColumn) => {
    const val = targetRow.cells[col.id];

    if (col.type === 'formula' || col.type === 'rollup') {
      const compVal = (computed?.cells ?? targetRow.cells)[col.id];
      const err = computed?.errors[col.id];
      return (
        <div className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
          {err ? <span className="text-red-600 dark:text-red-400">{err}</span> : formatCellText(col, compVal, pages, rowsByPage) || '—'}
        </div>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-1">
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => updateCell(col.id, e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600"
          />
          <span>{Boolean(val) ? 'Oui' : 'Non'}</span>
        </label>
      );
    }

    if (col.type === 'select') {
      const options = col.options ?? [];
      const current = String(val ?? '');
      return (
        <select
          value={current}
          onChange={(e) => updateCell(col.id, e.target.value)}
          aria-label={col.name}
          className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === 'multi_select') {
      const currentList = Array.isArray(val)
        ? val.map(String).filter(Boolean)
        : typeof val === 'string' && val.trim()
          ? val.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const allOptions = Array.from(new Set([...(col.options ?? []), ...currentList]));
      const draftTag = newTagByCol[col.id] ?? '';

      const toggleTag = (tag: string) => {
        const next = currentList.includes(tag)
          ? currentList.filter((t) => t !== tag)
          : [...currentList, tag];
        updateCell(col.id, next);
      };

      const addCustomTag = () => {
        const trimmed = draftTag.trim();
        if (!trimmed) return;
        if (!currentList.includes(trimmed)) {
          updateCell(col.id, [...currentList, trimmed]);
        }
        setNewTagByCol((prev) => ({ ...prev, [col.id]: '' }));
      };

      return (
        <div className="space-y-2">
          {allOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allOptions.map((opt) => {
                const active = currentList.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleTag(opt)}
                    className={`px-2 py-0.5 rounded-md border text-xs transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 font-medium'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={draftTag}
              onChange={(e) => setNewTagByCol((prev) => ({ ...prev, [col.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomTag();
                }
              }}
              placeholder="Ajouter une option..."
              aria-label={`Nouvelle option pour ${col.name}`}
              className="flex-1 h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent text-xs focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={addCustomTag}
              aria-label={`Ajouter option à ${col.name}`}
              className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    if (col.type === 'relation') {
      const targetDbId = col.relationTargetPageId;
      const targetDb = targetDbId ? pages.find((p) => p.id === targetDbId) : null;
      const targetRows = targetDbId ? rowsByPage[targetDbId] ?? [] : [];
      const targetPrimary = targetDb?.columns ? getPrimaryColumn(targetDb.columns) : undefined;
      const selectedIds = Array.isArray(val) ? val.map(String).filter(Boolean) : [];
      const rowMap = new Map(targetRows.map((r) => [r.id, r]));
      const resolveLabel = (rid: string) => {
        if (targetDbId === IMPRO_DB_IDS.participants && improModel.ready) {
          return improModel.participantById.get(rid)?.displayLabel ?? rid;
        }
        const tr = rowMap.get(rid);
        if (tr && targetPrimary) {
          return String(tr.cells[targetPrimary.id] || tr.id);
        }
        return rid;
      };
      const rq = (relSearchByCol[col.id] ?? '').trim().toLowerCase();
      const filteredTargets = targetRows.filter((tr) => {
        if (!rq) return true;
        return resolveLabel(tr.id).toLowerCase().includes(rq);
      });

      return (
        <div className="space-y-2">
          {selectedIds.length > 0 && targetDbId && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((rid) => (
                <RelationActionChip
                  key={rid}
                  label={resolveLabel(rid)}
                  isLinked={true}
                  onOpen={() => openImproDetail(targetDbId, rid)}
                  onRemove={() =>
                    updateCell(
                      col.id,
                      selectedIds.filter((id) => id !== rid)
                    )
                  }
                />
              ))}
            </div>
          )}

          {targetRows.length === 0 ? (
            <span className="text-xs text-slate-400">Aucune ligne cible disponible</span>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 space-y-1.5">
              {targetRows.length > 6 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={relSearchByCol[col.id] ?? ''}
                    onChange={(e) =>
                      setRelSearchByCol((prev) => ({ ...prev, [col.id]: e.target.value }))
                    }
                    placeholder="Chercher..."
                    className="w-full h-7 pl-7 pr-2 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-xs focus:outline-none"
                  />
                </div>
              )}
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredTargets.map((tr) => {
                  const label = resolveLabel(tr.id);
                  const checked = selectedIds.includes(tr.id);
                  return (
                    <RelationActionRow
                      key={tr.id}
                      compact
                      label={label || 'Sans titre'}
                      isLinked={checked}
                      onOpen={() => targetDbId && openImproDetail(targetDbId, tr.id)}
                      onAdd={() => {
                        if (!checked) updateCell(col.id, [...selectedIds, tr.id]);
                      }}
                      onRemove={() => {
                        if (checked) {
                          updateCell(
                            col.id,
                            selectedIds.filter((id) => id !== tr.id)
                          );
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={String(val ?? '')}
          onChange={(e) => updateCell(col.id, e.target.value)}
          aria-label={col.name}
          className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent font-mono text-xs tabular-nums focus:outline-none focus:border-indigo-500"
        />
      );
    }

    if (col.type === 'number') {
      return (
        <input
          type="number"
          value={val === undefined || val === null ? '' : String(val)}
          onChange={(e) =>
            updateCell(col.id, e.target.value === '' ? '' : Number(e.target.value))
          }
          aria-label={col.name}
          className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent font-mono text-xs tabular-nums focus:outline-none focus:border-indigo-500"
        />
      );
    }

    if (col.type === 'url') {
      const str = String(val ?? '');
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            value={str}
            onChange={(e) => updateCell(col.id, e.target.value)}
            placeholder="https://..."
            aria-label={col.name}
            className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs text-indigo-600 dark:text-indigo-400 focus:outline-none focus:border-indigo-500"
          />
          {/^https?:\/\//i.test(str) && (
            <a
              href={str}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ouvrir ${col.name}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        value={String(val ?? '')}
        onChange={(e) => updateCell(col.id, e.target.value)}
        placeholder={`${col.name}...`}
        aria-label={col.name}
        className="w-full h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
      />
    );
  };

  return (
    <aside
      aria-label="Fiche ligne"
      className="w-full lg:w-[400px] xl:w-[430px] shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] flex flex-col max-h-[75vh] lg:max-h-none lg:h-full"
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0 bg-stone-50/70 dark:bg-[#0D1320]">
        <DetailBreadcrumbBar />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
            {targetPage.title || 'Base'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => selectPage(targetPage.id)}
              className="h-7 px-2 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Voir la base</span>
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
          value={String(targetRow.cells[primaryCol.id] ?? '')}
          onChange={(e) => updateCell(primaryCol.id, e.target.value)}
          placeholder="Sans titre..."
          aria-label={`Nom ${primaryCol.name.toLowerCase()}`}
          className="w-full bg-transparent font-display text-lg font-semibold text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none border-b border-transparent focus:border-indigo-400 pb-0.5"
        />
      </div>

      <div data-detail-scroll="true" className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {targetPage.isTrashed && (
          <div className="p-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
            <span>Cette base est dans la corbeille.</span>
            <button
              type="button"
              onClick={() => void restoreFromTrash(targetPage.id)}
              className="font-medium underline shrink-0"
            >
              Restaurer
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!targetPage.isTrashed && (
            <button
              type="button"
              onClick={() => void openOrCreateRowPage(targetPage.id, targetRow.id)}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ouvrir en page complète</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteDatabaseRow(targetPage.id, targetRow.id)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Supprimer</span>
          </button>
        </div>

        <div className="space-y-3 pt-1">
          {otherCols.map((col) => (
            <div key={col.id} className="space-y-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {col.name}
              </div>
              {renderFieldEditor(col)}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
