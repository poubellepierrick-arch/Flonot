import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { ImproPlanStep } from '../types/workspace';
import { summarizeExerciseContentBlocks } from '../utils/exerciseContentTemplate';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { getSessionTotalDuration } from '../utils/improEngine';
import { ExerciseContentBlocksView } from './ExerciseContentBlocksView';

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LiveAnimationModal() {
  const {
    liveSessionId,
    closeLiveAnimation,
    improModel,
    pages,
    rowsByPage,
    updateDatabaseRow,
    updateRowBlocks,
    openImproDetail,
  } = useWorkspace();

  const session = useMemo(
    () => (liveSessionId ? improModel.seanceById.get(liveSessionId) ?? null : null),
    [liveSessionId, improModel.seanceById]
  );

  const steps = useMemo<ImproPlanStep[]>(() => {
    if (!session) return [];
    if (session.planSteps.length > 0) return session.planSteps;
    return session.exerciceIds.map((eid, idx) => ({
      id: `auto_${idx}_${eid}`,
      kind: 'exercise' as const,
      exerciceId: eid,
      durationMin: 15,
      note: '',
    }));
  }, [session]);

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setStepIdx(0);
    setRunning(false);
    const firstDur = steps[0]?.durationMin ?? 15;
    setSecondsLeft(firstDur * 60);
  }, [liveSessionId]);

  useEffect(() => {
    const dur = steps[stepIdx]?.durationMin ?? 15;
    setSecondsLeft(dur * 60);
    setRunning(false);
  }, [stepIdx, steps]);

  useEffect(() => {
    if (!running || !liveSessionId) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [running, liveSessionId]);

  if (!liveSessionId || !session) return null;

  const currentStep = steps[stepIdx] ?? null;
  const currentEx =
    currentStep?.kind === 'exercise' && currentStep.exerciceId
      ? improModel.exerciseById.get(currentStep.exerciceId) ?? null
      : null;

  const currentExRow = currentEx
    ? (rowsByPage[IMPRO_DB_IDS.exercices] ?? []).find((r) => r.id === currentEx.id) ?? null
    : null;
  const linkedExercisePage =
    currentExRow?.linkedPageId
      ? pages.find((p) => p.id === currentExRow.linkedPageId && !p.isTrashed) ?? null
      : null;
  const exerciseBlocks = currentExRow?.blocks ?? linkedExercisePage?.blocks ?? [];
  const linkedSummary =
    exerciseBlocks.length > 0 ? summarizeExerciseContentBlocks(exerciseBlocks) : null;

  const totalDuration = getSessionTotalDuration(steps);
  const stepTitle = currentEx
    ? currentEx.nom
    : currentStep?.label || 'Séquence libre';

  const stepTotalSeconds = (currentStep?.durationMin ?? 15) * 60;
  const progressPct =
    stepTotalSeconds > 0
      ? Math.min(100, Math.max(0, Math.round(((stepTotalSeconds - secondsLeft) / stepTotalSeconds) * 100)))
      : 0;

  const handleMarkDone = () => {
    const row = (rowsByPage[IMPRO_DB_IDS.seances] ?? []).find((r) => r.id === session.id);
    if (row) {
      updateDatabaseRow(IMPRO_DB_IDS.seances, session.id, {
        ...row.cells,
        [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
      });
    }
    closeLiveAnimation();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mode animation de séance"
      className="fixed inset-0 z-50 bg-stone-50 dark:bg-[#090D16] flex flex-col"
    >
      {/* Barre supérieure */}
      <header className="h-14 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0 flex items-center gap-3">
          <Timer className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => openImproDetail(IMPRO_DB_IDS.seances, session.id)}
                title="Ouvrir la fiche séance"
                className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate text-left"
              >
                {session.nom}
              </button>
              <button
                type="button"
                onClick={() => openImproDetail(IMPRO_DB_IDS.seances, session.id)}
                aria-label="Ouvrir la fiche séance"
                title="Fiche séance"
                className="w-6 h-6 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums flex flex-wrap items-center gap-1.5">
              {session.groupeIds.length > 0 ? (
                <span className="inline-flex items-center gap-1 font-sans">
                  {session.groupeIds.map((gid, idx) => {
                    const gName =
                      improModel.groupById.get(gid)?.nom ?? session.groupeNames[idx] ?? gid;
                    return (
                      <span key={gid} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                          className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                        >
                          {gName}
                        </button>
                        {idx < session.groupeIds.length - 1 && (
                          <span className="text-slate-400" aria-hidden="true">
                            ,
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span>{session.groupeNames.join(', ') || 'Atelier libre'}</span>
              )}
              <span aria-hidden="true">·</span>
              <span>{session.participantIds.length} participants</span>
              <span aria-hidden="true">·</span>
              <span>{totalDuration} min</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.status !== 'Réalisée' && (
            <button
              type="button"
              onClick={handleMarkDone}
              className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Clôturer (Réalisée)</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeLiveAnimation}
            aria-label="Quitter le mode animation"
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            <span>Quitter</span>
          </button>
        </div>
      </header>

      {steps.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-3">
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">
              Aucun exercice dans cette séance
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ajoutez des exercices dans Préparer pour lancer le minuteur étape par étape.
            </p>
            <button
              type="button"
              onClick={closeLiveAnimation}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
            >
              Retour à Préparer
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Colonne gauche : déroulé des étapes */}
          <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-y-auto p-4 space-y-2 max-h-48 lg:max-h-none shrink-0">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1 pb-1">
              Déroulé ({steps.length} étapes)
            </div>
            {steps.map((st, idx) => {
              const ex = st.exerciceId ? improModel.exerciseById.get(st.exerciceId) : null;
              const label = ex ? ex.nom : st.label || 'Séquence';
              const isCurrent = idx === stepIdx;
              const isPast = idx < stepIdx;
              return (
                <div
                  key={st.id}
                  className={`w-full px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                    isCurrent
                      ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100'
                      : isPast
                        ? 'border-transparent bg-slate-100/70 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setStepIdx(idx)}
                    className="min-w-0 flex-1 flex items-center gap-2.5 text-left"
                  >
                    <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-sm font-medium truncate">{label}</span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {st.kind === 'exercise' && st.exerciceId && (
                      <button
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, st.exerciceId!)}
                        aria-label={`Fiche ${label}`}
                        title="Ouvrir la fiche exercice"
                        className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white/80 dark:hover:bg-slate-800"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {st.durationMin}m
                    </span>
                  </div>
                </div>
              );
            })}
          </aside>

          {/* Scène centrale : Minuteur + Consignes */}
          <main className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col justify-between">
            <div className="max-w-3xl mx-auto w-full space-y-8">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>
                    Étape {stepIdx + 1} sur {steps.length}
                  </span>
                  {currentEx && currentEx.etapes.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                        {currentEx.etapes.join(' / ')}
                      </span>
                    </>
                  )}
                  {currentEx && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Joué {currentEx.usageCount} fois</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
                    {stepTitle}
                  </h2>
                  {currentEx && (
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, currentEx.id)}
                      className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Fiche exercice</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Bloc Minuteur */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div
                    className={`font-mono text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight ${
                      secondsLeft === 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : running
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {formatClock(secondsLeft)}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRunning((v) => !v)}
                      className="h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      {running ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Démarrer</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSecondsLeft((s) => s + 60)}
                      className="h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>1 min</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRunning(false);
                        setSecondsLeft((currentStep?.durationMin ?? 15) * 60);
                      }}
                      aria-label="Réinitialiser le minuteur"
                      className="h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Consignes & Notes */}
              {(currentStep?.note || currentEx?.description) && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                  {currentStep?.note && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        Intention pour cette séance
                      </div>
                      <p className="text-base text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                        {currentStep.note}
                      </p>
                    </div>
                  )}
                  {currentEx?.description && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Consignes Biblimpro
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {currentEx.description}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Contenus de l'exercice intégrés à la fiche (vidéos YouTube, audio, listes à cocher...) */}
              {currentEx && linkedSummary?.hasMeaningfulContent && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Contenus de l’exercice
                    </div>
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, currentEx.id)}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Ouvrir la fiche</span>
                    </button>
                  </div>
                  <ExerciseContentBlocksView
                    blocks={exerciseBlocks}
                    onToggleTodo={(blockId, checked) => {
                      const nextBlocks = exerciseBlocks.map((b) =>
                        b.id === blockId ? { ...b, checked } : b
                      );
                      updateRowBlocks(IMPRO_DB_IDS.exercices, currentEx.id, nextBlocks);
                    }}
                  />
                </div>
              )}

              {/* Participants présents */}
              {session.participantIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>Présents :</span>
                  {session.participantIds.map((pid, idx) => {
                    const label =
                      improModel.participantById.get(pid)?.displayLabel ??
                      session.participantNames[idx] ??
                      pid;
                    return (
                      <span key={pid} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                          className="text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                        >
                          {label}
                        </button>
                        {idx < session.participantIds.length - 1 && (
                          <span className="text-slate-300 dark:text-slate-700 ml-1.5" aria-hidden="true">
                            ·
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Navigation Précédent / Suivant */}
            <div className="max-w-3xl mx-auto w-full pt-8 flex items-center justify-between gap-4">
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 flex items-center gap-1.5 whitespace-nowrap"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Étape précédente</span>
              </button>
              <button
                type="button"
                disabled={stepIdx >= steps.length - 1}
                onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
                className="h-10 px-4 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 disabled:opacity-35 flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Étape suivante</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
