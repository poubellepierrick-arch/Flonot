import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Users,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { ImproPlanStep, ImproSessionStatus } from '../types/workspace';
import { generateId } from '../utils/id';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import {
  computePrepareSuggestions,
  getGroupMemberIds,
  getSessionTotalDuration,
  serializeSessionPlan,
  type ImproExerciseSuggestion,
} from '../utils/improEngine';
import {
  applyPrepareNavigation,
  createInitialPrepareSession,
  type ImproPrepareSessionState,
} from '../utils/prepareDraft';
import { ImproPrepareTable } from './ImproPrepareTable';
import { RelationActionChip } from './RelationActionRow';

export function ImproPrepareView() {
  const {
    rowsByPage,
    improModel,
    improLoading,
    improError,
    loadImproDatabases,
    addDatabaseRow,
    updateDatabaseRow,
    openImproDetail,
    openLiveAnimation,
    navigateToTimeline,
    prepareDraft,
    clearPrepareDraft,
    viewSettings,
    updatePrepareSettings,
  } = useWorkspace();

  const [feedback, setFeedback] = useState<ImproPrepareSessionState['feedback']>(null);
  const [duplicateId, setDuplicateId] = useState('');
  const [saving, setSaving] = useState(false);

  const sessionState: ImproPrepareSessionState = {
    ...viewSettings.prepare.session,
    feedback,
  };
  const targetDurationMin = viewSettings.prepare.targetDurationMin;

  const setSessionState = (
    updater:
      | ImproPrepareSessionState
      | ((prev: ImproPrepareSessionState) => ImproPrepareSessionState)
  ) => {
    let nextFeedback = feedback;
    updatePrepareSettings((prev) => {
      const prevFull: ImproPrepareSessionState = {
        ...prev.session,
        feedback,
      };
      const nextFull = typeof updater === 'function' ? updater(prevFull) : updater;
      nextFeedback = nextFull.feedback;
      const { feedback: _ignored, ...cleanSession } = nextFull;
      return {
        ...prev,
        session: cleanSession,
      };
    });
    if (nextFeedback !== feedback) {
      setFeedback(nextFeedback);
    }
  };

  const setTargetDurationMin = (val: number) => {
    updatePrepareSettings({ targetDurationMin: val });
  };

  const {
    editingSeanceId,
    nom,
    date,
    groupeId,
    presentIds,
    showAllParticipants,
    participantsExpanded,
    steps,
    notes,
    status,
    activeSubTab,
    sortRules,
  } = sessionState;

  useEffect(() => {
    if (!prepareDraft || !improModel.ready) return;
    setSessionState((prev) =>
      applyPrepareNavigation(prev, prepareDraft, improModel, rowsByPage)
    );
    clearPrepareDraft();
  }, [prepareDraft, improModel, rowsByPage, clearPrepareDraft]);

  const handleGroupChange = (nextGid: string) => {
    setSessionState((prev) => ({
      ...prev,
      groupeId: nextGid,
      presentIds: nextGid ? getGroupMemberIds([nextGid], rowsByPage) : [],
      showAllParticipants: false,
    }));
  };

  const handleDuplicateSelect = (srcId: string) => {
    setDuplicateId('');
    if (!srcId) return;
    setSessionState((prev) =>
      applyPrepareNavigation(prev, { duplicateFromId: srcId }, improModel, rowsByPage)
    );
  };

  const handleReset = () => {
    setSessionState(createInitialPrepareSession());
  };

  const toggleParticipant = (pid: string) => {
    setSessionState((prev) => ({
      ...prev,
      presentIds: prev.presentIds.includes(pid)
        ? prev.presentIds.filter((id) => id !== pid)
        : [...prev.presentIds, pid],
    }));
  };

  const groupMemberIds = useMemo(
    () => (groupeId ? new Set(getGroupMemberIds([groupeId], rowsByPage)) : new Set<string>()),
    [groupeId, rowsByPage]
  );

  const visibleParticipants = useMemo(() => {
    if (!groupeId || showAllParticipants) return improModel.participants;
    return improModel.participants.filter(
      (p) => groupMemberIds.has(p.id) || presentIds.includes(p.id)
    );
  }, [improModel.participants, groupeId, showAllParticipants, groupMemberIds, presentIds]);

  const suggestions = useMemo(
    () => computePrepareSuggestions(improModel, presentIds, groupeId || undefined),
    [improModel, presentIds, groupeId]
  );

  const selectedExIds = useMemo(
    () => new Set(steps.map((s) => s.exerciceId).filter((v): v is string => Boolean(v))),
    [steps]
  );

  const addExerciseStep = (exerciceId: string) => {
    if (selectedExIds.has(exerciceId)) return;
    setSessionState((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: generateId('step'),
          kind: 'exercise',
          exerciceId,
          durationMin: 15,
          note: '',
        },
      ],
    }));
  };

  const toggleExerciseInPlan = (exerciceId: string) => {
    if (selectedExIds.has(exerciceId)) {
      setSessionState((prev) => ({
        ...prev,
        steps: prev.steps.filter((st) => st.exerciceId !== exerciceId),
      }));
    } else {
      addExerciseStep(exerciceId);
    }
  };

  const addCustomStep = () => {
    setSessionState((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          id: generateId('step'),
          kind: 'custom',
          label: prev.steps.length === 0 ? 'Accueil & météo' : 'Bilan',
          durationMin: 10,
          note: '',
        },
      ],
    }));
  };

  const removeStep = (stepId: string) => {
    setSessionState((prev) => ({
      ...prev,
      steps: prev.steps.filter((s) => s.id !== stepId),
    }));
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    setSessionState((prev) => {
      const targetIdx = index + delta;
      if (targetIdx < 0 || targetIdx >= prev.steps.length) return prev;
      const next = [...prev.steps];
      const [item] = next.splice(index, 1);
      next.splice(targetIdx, 0, item);
      return { ...prev, steps: next };
    });
  };

  const updateStep = (stepId: string, patch: Partial<ImproPlanStep>) => {
    setSessionState((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    }));
  };

  const pickRandomExercise = (candidates: ImproExerciseSuggestion[]) => {
    if (candidates.length === 0) return;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    if (picked) addExerciseStep(picked.exercise.id);
  };

  const unaddedSuggestions = useMemo(
    () => suggestions.filter((s) => !selectedExIds.has(s.exercise.id)),
    [suggestions, selectedExIds]
  );

  const totalDurationMin = useMemo(() => getSessionTotalDuration(steps), [steps]);

  const persistSession = async (
    targetStatus: ImproSessionStatus
  ): Promise<string | null> => {
    const grpName = groupeId ? improModel.groupById.get(groupeId)?.nom ?? '' : '';
    const dateLabel = date
      ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
      : '';
    const resolvedName =
      nom.trim() || [dateLabel, grpName].filter(Boolean).join(' ') || 'Atelier';
    const exerciceIds = steps
      .filter((s) => s.kind === 'exercise' && s.exerciceId)
      .map((s) => s.exerciceId!);
    const derouleJson = serializeSessionPlan(steps);

    if (editingSeanceId) {
      const existingRow = (rowsByPage[IMPRO_DB_IDS.seances] ?? []).find(
        (r) => r.id === editingSeanceId
      );
      if (existingRow) {
        updateDatabaseRow(IMPRO_DB_IDS.seances, editingSeanceId, {
          ...existingRow.cells,
          [IMPRO_COL_IDS.seances.nom]: resolvedName,
          [IMPRO_COL_IDS.seances.date]: date,
          [IMPRO_COL_IDS.seances.statut]: targetStatus,
          [IMPRO_COL_IDS.seances.groupe]: groupeId ? [groupeId] : [],
          [IMPRO_COL_IDS.seances.participants]: presentIds,
          [IMPRO_COL_IDS.seances.exercices]: exerciceIds,
          [IMPRO_COL_IDS.seances.notes]: notes.trim(),
          [IMPRO_COL_IDS.seances.deroule]: derouleJson,
        });
        setSessionState((prev) => ({
          ...prev,
          nom: resolvedName,
          status: targetStatus,
          feedback: {
            text: `Séance mise à jour · ${targetStatus}`,
            seanceId: editingSeanceId,
          },
        }));
        return editingSeanceId;
      }
    }

    const createdId = await addDatabaseRow(IMPRO_DB_IDS.seances, {
      [IMPRO_COL_IDS.seances.nom]: resolvedName,
      [IMPRO_COL_IDS.seances.date]: date,
      [IMPRO_COL_IDS.seances.statut]: targetStatus,
      [IMPRO_COL_IDS.seances.groupe]: groupeId ? [groupeId] : [],
      [IMPRO_COL_IDS.seances.participants]: presentIds,
      [IMPRO_COL_IDS.seances.exercices]: exerciceIds,
      [IMPRO_COL_IDS.seances.notes]: notes.trim(),
      [IMPRO_COL_IDS.seances.deroule]: derouleJson,
    });

    if (createdId) {
      setSessionState((prev) => ({
        ...prev,
        editingSeanceId: createdId,
        nom: resolvedName,
        status: targetStatus,
        feedback: {
          text: `Séance créée · ${targetStatus}`,
          seanceId: createdId,
        },
      }));
      return createdId;
    }
    return null;
  };

  const handleSave = async (targetStatus: ImproSessionStatus) => {
    if (saving) return;
    setSaving(true);
    try {
      await persistSession(targetStatus);
    } finally {
      setSaving(false);
    }
  };

  const handleLaunchLive = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const id = await persistSession(status);
      if (id) openLiveAnimation(id);
    } finally {
      setSaving(false);
    }
  };

  if (improLoading && !improModel.ready) {
    return (
      <div className="w-full px-6 py-10 space-y-4">
        <div className="h-8 w-48 rounded-lg bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        <div className="h-72 w-full rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Préparer
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError || 'Chargez les 4 bases Impro pour préparer un atelier.'}
        </p>
        <button
          type="button"
          onClick={() => void loadImproDatabases()}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
        >
          Charger les 4 bases
        </button>
      </div>
    );
  }

  const dupCandidates = groupeId
    ? improModel.seances.filter((s) => s.groupeIds.includes(groupeId))
    : improModel.seances;

  const budgetRatio =
    targetDurationMin > 0 ? Math.round((totalDurationMin / targetDurationMin) * 100) : 0;
  const budgetBarPct = Math.min(100, budgetRatio);
  const budgetOver = totalDurationMin > targetDurationMin;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
            {editingSeanceId ? (
              <button
                type="button"
                onClick={() => openImproDetail(IMPRO_DB_IDS.seances, editingSeanceId)}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                title="Ouvrir la fiche de cette séance"
              >
                Édition séance · Fiche
              </button>
            ) : (
              <span>Nouvel atelier</span>
            )}
            <span aria-hidden="true">·</span>
            <span>{status}</span>
            <span aria-hidden="true">·</span>
            <span>{presentIds.length} présents</span>
            <span aria-hidden="true">·</span>
            <span>{steps.length} séquences</span>
            <span aria-hidden="true">·</span>
            <span>{totalDurationMin} min</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Préparer une séance
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Copy className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={duplicateId}
              onChange={(e) => handleDuplicateSelect(e.target.value)}
              aria-label="Dupliquer une séance passée"
              className="h-9 pl-8 pr-3 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none max-w-[195px]"
            >
              <option value="">Dupliquer une séance...</option>
              {dupCandidates.slice(0, 40).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date ? `${s.date} · ` : ''}
                  {s.nom}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="h-9 px-3 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nouveau</span>
          </button>

          {steps.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleLaunchLive()}
              className="h-9 px-3.5 rounded-lg text-xs font-medium border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Animer</span>
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave('Préparée')}
            className="h-9 px-3.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Enregistrer (Préparée)
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave('Réalisée')}
            className="h-9 px-4 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Valider réalisée</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/60 dark:bg-indigo-950/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-indigo-900 dark:text-indigo-200 font-medium">{feedback.text}</span>
          <div className="flex items-center gap-3">
            {feedback.seanceId && (
              <button
                type="button"
                onClick={() => openImproDetail(IMPRO_DB_IDS.seances, feedback.seanceId!)}
                className="text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap"
              >
                Ouvrir fiche
              </button>
            )}
            <button
              type="button"
              onClick={() => navigateToTimeline({ groupId: groupeId || undefined })}
              className="text-indigo-700 dark:text-indigo-300 hover:underline whitespace-nowrap"
            >
              Voir chronologie
            </button>
          </div>
        </div>
      )}

      {/* Paramètres séance + présents + budget temps */}
      <section className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="prep-date"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Date
            </label>
            <input
              id="prep-date"
              type="date"
              value={date}
              onChange={(e) => setSessionState((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs tabular-nums focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="prep-groupe"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Groupe
              </label>
              {groupeId && (
                <button
                  type="button"
                  onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, groupeId)}
                  aria-label="Ouvrir la fiche du groupe"
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Fiche
                </button>
              )}
            </div>
            <select
              id="prep-groupe"
              value={groupeId}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="">Sans groupe (libre)</option>
              {improModel.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom} ({g.participantIds.length})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="prep-nom"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Nom de séance
            </label>
            <input
              id="prep-nom"
              type="text"
              value={nom}
              onChange={(e) => setSessionState((prev) => ({ ...prev, nom: e.target.value }))}
              placeholder="Auto si vide"
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="prep-budget"
                className="font-medium text-slate-500 dark:text-slate-400"
              >
                Budget temps
              </label>
              <span
                className={`font-mono tabular-nums font-medium ${
                  budgetOver
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {totalDurationMin} / {targetDurationMin} min
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                id="prep-budget"
                value={targetDurationMin}
                onChange={(e) => setTargetDurationMin(Number(e.target.value) || 90)}
                className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-xs tabular-nums focus:outline-none"
              >
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
                <option value={150}>150 min</option>
              </select>
              <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    budgetOver
                      ? 'bg-amber-500'
                      : 'bg-indigo-600 dark:bg-indigo-400'
                  }`}
                  style={{ width: `${budgetBarPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sélection des présents */}
        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                setSessionState((prev) => ({
                  ...prev,
                  participantsExpanded: !prev.participantsExpanded,
                }))
              }
              className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Présents prévus</span>
              <span className="font-mono tabular-nums text-slate-500">
                ({presentIds.length}
                {groupeId ? ` / ${groupMemberIds.size}` : ''})
              </span>
              {participantsExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {groupeId && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setSessionState((prev) => ({
                        ...prev,
                        presentIds: getGroupMemberIds([groupeId], rowsByPage),
                      }))
                    }
                    className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                  >
                    Membres du groupe
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSessionState((prev) => ({
                        ...prev,
                        showAllParticipants: !prev.showAllParticipants,
                        participantsExpanded: true,
                      }))
                    }
                    className="text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                  >
                    {showAllParticipants ? 'Membres seuls' : 'Ajouter hors groupe'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSessionState((prev) => ({ ...prev, presentIds: [] }))}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-white whitespace-nowrap"
              >
                Aucun
              </button>
            </div>
          </div>

          {participantsExpanded && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pt-1">
              {visibleParticipants.map((p) => {
                const checked = presentIds.includes(p.id);
                return (
                  <RelationActionChip
                    key={p.id}
                    label={p.displayLabel}
                    isLinked={checked}
                    onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                    onAdd={() => toggleParticipant(p.id)}
                    onRemove={() => toggleParticipant(p.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Sous-onglets Choisir / Déroulé */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
        <div role="tablist" aria-label="Étapes de préparation" className="flex items-center gap-6">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'choose'}
            onClick={() => setSessionState((prev) => ({ ...prev, activeSubTab: 'choose' }))}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeSubTab === 'choose'
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Choisir les exercices ({improModel.exercises.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'deroule'}
            onClick={() => setSessionState((prev) => ({ ...prev, activeSubTab: 'deroule' }))}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeSubTab === 'deroule'
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Déroulé de séance</span>
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {steps.length} · {totalDurationMin} min
            </span>
          </button>
        </div>

        <div className="pb-2 flex items-center gap-2">
          {activeSubTab === 'choose' && steps.length > 0 && (
            <button
              type="button"
              onClick={() => setSessionState((prev) => ({ ...prev, activeSubTab: 'deroule' }))}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
            >
              Ouvrir le déroulé ({steps.length})
            </button>
          )}
          {activeSubTab === 'deroule' && (
            <button
              type="button"
              onClick={() => setSessionState((prev) => ({ ...prev, activeSubTab: 'choose' }))}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
            >
              + Piocher dans Biblimpro
            </button>
          )}
        </div>
      </div>

      {/* Onglet 1 : Choisir les exercices */}
      {activeSubTab === 'choose' && (
        <ImproPrepareTable
          suggestions={suggestions}
          selectedExIds={selectedExIds}
          groupeId={groupeId}
          presentCount={presentIds.length}
          sortRules={sortRules}
          onSortRulesChange={(nextRules) =>
            setSessionState((prev) => ({ ...prev, sortRules: nextRules }))
          }
          onToggleExercise={toggleExerciseInPlan}
          onPickRandom={pickRandomExercise}
          onExercisesDeleted={(deletedIds) => {
            const removed = new Set(deletedIds);
            setSessionState((prev) => ({
              ...prev,
              steps: prev.steps.filter(
                (st) => !(st.kind === 'exercise' && st.exerciceId && removed.has(st.exerciceId))
              ),
            }));
          }}
        />
      )}

      {/* Onglet 2 : Déroulé */}
      {activeSubTab === 'deroule' && (
        <section className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/40">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {steps.length} séquences · {totalDurationMin} min au total
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={unaddedSuggestions.length === 0}
                onClick={() => pickRandomExercise(unaddedSuggestions)}
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:border-indigo-400 disabled:opacity-40 whitespace-nowrap"
              >
                + Exercice inédit au hasard
              </button>
              <button
                type="button"
                onClick={addCustomStep}
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 hover:border-indigo-400 flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Temps libre</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {steps.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 space-y-3">
                <p>Aucune séquence dans le déroulé.</p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSessionState((prev) => ({ ...prev, activeSubTab: 'choose' }))
                    }
                    className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium whitespace-nowrap"
                  >
                    Choisir des exercices
                  </button>
                  <button
                    type="button"
                    onClick={addCustomStep}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs whitespace-nowrap"
                  >
                    + Temps libre
                  </button>
                </div>
              </div>
            ) : (
              steps.map((step, idx) => {
                const ex =
                  step.kind === 'exercise' && step.exerciceId
                    ? improModel.exerciseById.get(step.exerciceId)
                    : undefined;
                return (
                  <div key={step.id} className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0 w-6">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {step.kind === 'custom' ? (
                          <input
                            type="text"
                            value={step.label ?? ''}
                            onChange={(e) => updateStep(step.id, { label: e.target.value })}
                            aria-label="Nom du temps libre"
                            className="flex-1 min-w-[160px] max-w-md h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              step.exerciceId &&
                              openImproDetail(IMPRO_DB_IDS.exercices, step.exerciceId)
                            }
                            className="text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate"
                          >
                            {ex?.nom ?? step.exerciceId ?? 'Exercice'}
                          </button>
                        )}
                        {ex && (ex.etapes.length > 0 || ex.tags.length > 0) && (
                          <span className="text-xs text-slate-400 truncate hidden sm:inline">
                            · {[...ex.etapes, ...ex.tags].slice(0, 3).join(' · ')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1 mr-1">
                          <input
                            type="number"
                            min={0}
                            max={240}
                            value={step.durationMin}
                            onChange={(e) =>
                              updateStep(step.id, {
                                durationMin: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Durée en minutes"
                            className="w-14 h-7 px-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-transparent text-right font-mono text-xs tabular-nums focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-[11px] text-slate-400">min</span>
                        </div>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveStep(idx, -1)}
                          aria-label="Monter"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === steps.length - 1}
                          onClick={() => moveStep(idx, 1)}
                          aria-label="Descendre"
                          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStep(step.id)}
                          aria-label="Retirer séquence"
                          title="Retirer du déroulé"
                          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-400 hover:border-red-300 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {ex?.description && (
                      <p className="pl-8 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {ex.description}
                      </p>
                    )}

                    <div className="pl-8">
                      <input
                        type="text"
                        value={step.note}
                        onChange={(e) => updateStep(step.id, { note: e.target.value })}
                        placeholder="Variante, consigne, matériel..."
                        aria-label="Note de séquence"
                        className="w-full h-8 px-2.5 rounded-md border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/50 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900/40">
            <label
              htmlFor="prep-notes"
              className="block text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Notes de séance
            </label>
            <textarea
              id="prep-notes"
              rows={3}
              value={notes}
              onChange={(e) => setSessionState((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Objectif de l'atelier, retours..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            {editingSeanceId && (
              <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                <span>Modification de séance existante</span>
                <button
                  type="button"
                  onClick={() =>
                    setSessionState((prev) => ({
                      ...prev,
                      editingSeanceId: null,
                      nom: '',
                      feedback: null,
                    }))
                  }
                  className="hover:underline text-indigo-600 dark:text-indigo-400"
                >
                  Enregistrer en nouvelle séance
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
