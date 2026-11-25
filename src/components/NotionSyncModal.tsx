import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  fetchNotionSyncStatus,
  NotionSyncPartialError,
  type NotionBiblimproSyncProgress,
} from '../services/notionSyncService';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import type {
  NotionSyncMergeSummary,
  NotionSyncStatusResponse,
} from '../utils/notionApiSync';

export function NotionSyncModal() {
  const {
    rowsByPage,
    notionSyncModalOpen,
    setNotionSyncModalOpen,
    syncBiblimproFromNotion,
  } = useWorkspace();

  const { totalCount, syncedCount, pendingCount } = useMemo(() => {
    const exRows = rowsByPage[IMPRO_DB_IDS.exercices] ?? [];
    const synced = exRows.filter((r) => Boolean(r.notionSyncedAt)).length;
    return {
      totalCount: exRows.length,
      syncedCount: synced,
      pendingCount: Math.max(0, exRows.length - synced),
    };
  }, [rowsByPage]);

  const [syncMode, setSyncMode] = useState<'missing' | 'all'>('all');
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState<NotionSyncStatusResponse | null>(null);
  const [databaseInput, setDatabaseInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<NotionBiblimproSyncProgress | null>(null);
  const [resultSummary, setResultSummary] = useState<{
    summary: NotionSyncMergeSummary;
    databaseTitle: string;
    skippedCount: number;
    warnings: string[];
  } | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; savedCount?: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async (customDb?: string) => {
    setStatusLoading(true);
    setErrorInfo(null);
    try {
      const next = await fetchNotionSyncStatus(customDb);
      setStatus(next);
    } catch (err) {
      setStatus(null);
      setErrorInfo({
        message: err instanceof Error ? err.message : 'Impossible de joindre le serveur local.',
      });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!notionSyncModalOpen) return;
    setResultSummary(null);
    setErrorInfo(null);
    setProgress(null);
    setSyncMode(syncedCount > 0 && pendingCount > 0 ? 'missing' : 'all');
    void refreshStatus(databaseInput);
  }, [notionSyncModalOpen]);

  useEffect(() => {
    if (!notionSyncModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !syncing) {
        setNotionSyncModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [notionSyncModalOpen, syncing, setNotionSyncModalOpen]);

  if (!notionSyncModalOpen) return null;

  const handleStartSync = async () => {
    if (syncing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSyncing(true);
    setErrorInfo(null);
    setResultSummary(null);
    setProgress({
      phase: 'connecting',
      message: 'Connexion à Notion…',
      processed: 0,
      total: 0,
      savedSoFar: 0,
    });

    try {
      const res = await syncBiblimproFromNotion({
        mode: syncMode,
        databaseId: databaseInput.trim() || undefined,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setResultSummary(res);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              reachable: true,
              databaseTitle: res.databaseTitle,
              error: undefined,
            }
          : prev
      );
    } catch (err) {
      const savedCount =
        err instanceof NotionSyncPartialError ? err.savedCount : undefined;
      if (controller.signal.aborted) {
        setErrorInfo({
          message: 'Synchronisation interrompue.',
          savedCount,
        });
      } else {
        setErrorInfo({
          message:
            err instanceof Error ? err.message : 'Erreur pendant la synchronisation Notion.',
          savedCount,
        });
      }
    } finally {
      abortRef.current = null;
      setSyncing(false);
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
  };

  const handleClose = () => {
    if (syncing) {
      abortRef.current?.abort();
    }
    setNotionSyncModalOpen(false);
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50"
      onClick={() => {
        if (!syncing) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notion-sync-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F19] shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2
              id="notion-sync-modal-title"
              className="font-display text-base font-semibold text-slate-950 dark:text-white"
            >
              Synchroniser Biblimpro avec Notion
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {syncedCount}/{totalCount} fiches à jour · {pendingCount} en attente
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer la fenêtre de synchronisation"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* État de la connexion Notion */}
          {statusLoading ? (
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Vérification de l’intégration Notion côté serveur…</span>
            </div>
          ) : status && !status.configured ? (
            <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 space-y-2.5 text-slate-800 dark:text-slate-200">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Clé d’intégration Notion non configurée</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 leading-relaxed">
                <li>
                  Créez une intégration interne sur{' '}
                  <span className="font-mono text-[11px]">notion.so/my-integrations</span> (lecture
                  du contenu, des commentaires et des utilisateurs).
                </li>
                <li>
                  Ajoutez la variable serveur{' '}
                  <span className="font-mono font-semibold text-[11px]">NOTION_API_KEY</span> dans{' '}
                  <strong>Settings → Secrets</strong>.
                </li>
                <li>
                  Dans Notion, ouvrez votre base <strong>Biblimpro</strong> → menu{' '}
                  <span className="font-mono">...</span> → <strong>Connexions</strong> → sélectionnez
                  votre intégration.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => void refreshStatus(databaseInput)}
                className="h-8 px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-xs font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Vérifier à nouveau</span>
              </button>
            </div>
          ) : status && status.reachable ? (
            <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Connecté à « {status.databaseTitle || 'Biblimpro'} »</span>
                </span>
                {status.databaseId && (
                  <span className="font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                    {status.databaseId.slice(0, 8)}…
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Sauvegarde automatique par paliers pendant le transfert et ajout du contenu Notion
                à la suite de vos notes locales.
              </p>
            </div>
          ) : status && !status.reachable ? (
            <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 space-y-2">
              <div className="flex items-start gap-2 text-red-800 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{status.error || 'Base Biblimpro inaccessible depuis Notion.'}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Vérifiez que votre base Biblimpro est bien partagée avec l’intégration (menu{' '}
                <span className="font-mono">...</span> → Connexions) ou collez son lien ci-dessous.
              </p>
            </div>
          ) : null}

          {/* Mode de synchronisation (compléter vs tout resynchroniser) */}
          {status?.configured && syncedCount > 0 && (
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Périmètre de synchronisation
              </span>
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => setSyncMode('missing')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    syncMode === 'missing'
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Compléter les manquantes ({pendingCount})
                </button>
                <button
                  type="button"
                  disabled={syncing}
                  onClick={() => setSyncMode('all')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    syncMode === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Tout resynchroniser ({totalCount})
                </button>
              </div>
            </div>
          )}

          {/* Lien ou ID optionnel de la base Biblimpro */}
          {status?.configured && (
            <div className="space-y-1.5">
              <label
                htmlFor="notion-db-id-input"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Lien ou ID Notion de Biblimpro (optionnel)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="notion-db-id-input"
                  type="text"
                  value={databaseInput}
                  disabled={syncing}
                  onChange={(e) => setDatabaseInput(e.target.value)}
                  placeholder="https://www.notion.so/... (détection automatique par défaut)"
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={syncing || statusLoading}
                  onClick={() => void refreshStatus(databaseInput)}
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  Tester
                </button>
              </div>
            </div>
          )}

          {/* Progression en direct */}
          {syncing && progress && (
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 truncate">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{progress.message}</span>
                </span>
                {progress.total > 0 && (
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {progress.processed}/{progress.total}
                  </span>
                )}
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-200"
                  style={{ width: `${progress.total > 0 ? progressPct : 18}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Cadence adaptée à la limite Notion · {progress.savedSoFar ?? 0} enregistrées sur
                cette session
              </p>
            </div>
          )}

          {/* Résultat */}
          {resultSummary && (
            <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
              <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Synchronisation terminée ({resultSummary.databaseTitle})</span>
              </div>
              <p className="font-mono tabular-nums text-[11px] text-slate-700 dark:text-slate-300">
                {resultSummary.summary.updatedCount} mises à jour ·{' '}
                {resultSummary.summary.createdCount} créées ·{' '}
                {resultSummary.summary.unchangedCount} inchangées ·{' '}
                {resultSummary.summary.blocksSyncedCount} blocs ·{' '}
                {resultSummary.summary.commentsSyncedCount} commentaires
                {resultSummary.skippedCount > 0
                  ? ` · ${resultSummary.skippedCount} déjà à jour ignorées`
                  : ''}
              </p>
              {resultSummary.warnings.length > 0 && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5 pt-1 border-t border-emerald-200/70 dark:border-emerald-900/40">
                  {resultSummary.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {errorInfo && (
            <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p>{errorInfo.message}</p>
              {typeof errorInfo.savedCount === 'number' && errorInfo.savedCount > 0 && (
                <p className="font-medium text-emerald-800 dark:text-emerald-300">
                  {errorInfo.savedCount}{' '}
                  {errorInfo.savedCount > 1
                    ? 'fiches déjà récupérées ont bien été sauvegardées.'
                    : 'fiche déjà récupérée a bien été sauvegardée.'}{' '}
                  Vous pourrez reprendre uniquement les fiches restantes.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-stone-50/70 dark:bg-[#0D1320] flex items-center justify-end gap-2">
          {syncing ? (
            <button
              type="button"
              onClick={handleAbort}
              className="h-9 px-3.5 rounded-lg border border-red-200 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 whitespace-nowrap shrink-0"
            >
              Interrompre
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="h-9 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Fermer
              </button>
              <button
                type="button"
                disabled={!status?.configured || statusLoading}
                onClick={() => void handleStartSync()}
                className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {syncMode === 'missing' && syncedCount > 0
                    ? `Synchroniser les ${pendingCount} restantes`
                    : 'Lancer la synchronisation'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
