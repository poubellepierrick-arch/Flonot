import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  GripVertical,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { mergeColumnOrder, reorderIds } from '../utils/columnOrder';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from '../utils/improCsvLoader';
import {
  computeGroupExerciseMatrix,
  getGroupMemberIds,
  type ImproSessionSummary,
} from '../utils/improEngine';
import { RelationActionChip, RelationActionRow } from './RelationActionRow';

type TimelineMode = 'chronology' | 'matrix' | 'participant';
type GroupByMode = 'flat' | 'month' | 'group';
type StatusFilter = 'all' | 'Réalisée' | 'Préparée';

const MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function formatMonthLabel(isoDate: string): string {
  if (!isoDate || isoDate.length < 7) return 'Sans date';
  const y = isoDate.slice(0, 4);
  const m = Number.parseInt(isoDate.slice(5, 7), 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return isoDate.slice(0, 7);
  const name = MONTH_NAMES[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

export function ImproTimelineView() {
  const {
    rowsByPage,
    improModel,
    improLoading,
    improError,
    openImproDetail,
    addDatabaseRow,
    loadImproDatabases,
    timelinePreset,
    clearTimelinePreset,
    navigateToPrepare,
    toggleSeanceStatus,
    toggleSeanceParticipant,
    openLiveAnimation,
    tableColumnOrders,
    setTableColumnOrder,
    viewSettings,
    updateTimelineSettings,
  } = useWorkspace();

  const {
    mode,
    groupBy,
    sortDesc,
    searchQuery,
    groupId,
    participantId,
    exerciseId,
    etapeFilter,
    statusFilter,
    dateFrom,
    dateTo,
    matrixGroupId: rawMatrixGroupId,
    matrixOnlyNever,
  } = viewSettings.timeline;

  const matrixGroupId = rawMatrixGroupId ?? '';
  const setMode = (val: TimelineMode) => updateTimelineSettings({ mode: val });
  const setGroupBy = (val: GroupByMode) => updateTimelineSettings({ groupBy: val });
  const setSortDesc = (valOrFn: boolean | ((v: boolean) => boolean)) =>
    updateTimelineSettings((prev) => ({
      ...prev,
      sortDesc: typeof valOrFn === 'function' ? valOrFn(prev.sortDesc) : valOrFn,
    }));
  const setSearchQuery = (val: string) => updateTimelineSettings({ searchQuery: val });
  const setParticipantId = (val: string) => updateTimelineSettings({ participantId: val });
  const setExerciseId = (val: string) => updateTimelineSettings({ exerciseId: val });
  const setEtapeFilter = (val: string) => updateTimelineSettings({ etapeFilter: val });
  const setStatusFilter = (val: StatusFilter) => updateTimelineSettings({ statusFilter: val });
  const setDateFrom = (val: string) => updateTimelineSettings({ dateFrom: val });
  const setDateTo = (val: string) => updateTimelineSettings({ dateTo: val });
  const setMatrixGroupId = (val: string) => updateTimelineSettings({ matrixGroupId: val });
  const setMatrixOnlyNever = (val: boolean) => updateTimelineSettings({ matrixOnlyNever: val });

  // Pointage rapide en ligne
  const [attendanceOpenId, setAttendanceOpenId] = useState<string | null>(null);
  const [attendanceShowAllForId, setAttendanceShowAllForId] = useState<string | null>(null);

  // Création rapide de séance en ligne
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNom, setNewNom] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newGroupeId, setNewGroupeId] = useState('');
  const [newParticipantIds, setNewParticipantIds] = useState<string[]>([]);
  const [newExerciceIds, setNewExerciceIds] = useState<string[]>([]);
  const [newExQuery, setNewExQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!timelinePreset) return;
    updateTimelineSettings((prev) => ({
      ...prev,
      ...(timelinePreset.mode ? { mode: timelinePreset.mode } : {}),
      ...(timelinePreset.groupId !== undefined
        ? {
            groupId: timelinePreset.groupId,
            ...(timelinePreset.groupId ? { matrixGroupId: timelinePreset.groupId } : {}),
          }
        : {}),
      ...(timelinePreset.participantId !== undefined
        ? { participantId: timelinePreset.participantId }
        : {}),
      ...(timelinePreset.exerciseId !== undefined
        ? { exerciseId: timelinePreset.exerciseId }
        : {}),
      ...(timelinePreset.etape !== undefined ? { etapeFilter: timelinePreset.etape } : {}),
    }));
    clearTimelinePreset();
  }, [timelinePreset, clearTimelinePreset, updateTimelineSettings]);

  useEffect(() => {
    if (improModel.ready && rawMatrixGroupId === null && improModel.groups[0]) {
      updateTimelineSettings({ matrixGroupId: groupId || improModel.groups[0].id });
    }
  }, [improModel.ready, improModel.groups, rawMatrixGroupId, groupId, updateTimelineSettings]);

  const hasActiveFilters = Boolean(
    searchQuery ||
      groupId ||
      participantId ||
      exerciseId ||
      etapeFilter ||
      dateFrom ||
      dateTo ||
      statusFilter !== 'all'
  );

  const resetFilters = () => {
    updateTimelineSettings({
      searchQuery: '',
      groupId: '',
      participantId: '',
      exerciseId: '',
      etapeFilter: '',
      dateFrom: '',
      dateTo: '',
      statusFilter: 'all',
    });
  };

  const handleGroupChangeInForm = (nextGrpId: string) => {
    setNewGroupeId(nextGrpId);
    if (nextGrpId) {
      setNewParticipantIds(getGroupMemberIds([nextGrpId], rowsByPage));
    } else {
      setNewParticipantIds([]);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const grpName = newGroupeId ? improModel.groupById.get(newGroupeId)?.nom ?? '' : '';
      const dateLabel = newDate
        ? `${newDate.slice(8, 10)}/${newDate.slice(5, 7)}/${newDate.slice(0, 4)}`
        : '';
      const fallbackName = [dateLabel, grpName].filter(Boolean).join(' ') || 'Nouvelle séance';
      const createdId = await addDatabaseRow(IMPRO_DB_IDS.seances, {
        [IMPRO_COL_IDS.seances.nom]: newNom.trim() || fallbackName,
        [IMPRO_COL_IDS.seances.date]: newDate,
        [IMPRO_COL_IDS.seances.statut]: 'Réalisée',
        [IMPRO_COL_IDS.seances.groupe]: newGroupeId ? [newGroupeId] : [],
        [IMPRO_COL_IDS.seances.participants]: newParticipantIds,
        [IMPRO_COL_IDS.seances.exercices]: newExerciceIds,
      });
      setShowCreateForm(false);
      setNewNom('');
      setNewGroupeId('');
      setNewParticipantIds([]);
      setNewExerciceIds([]);
      setNewExQuery('');
      if (createdId) {
        openImproDetail(IMPRO_DB_IDS.seances, createdId);
      }
    } finally {
      setCreating(false);
    }
  };

  const filteredSeances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = improModel.seances.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (groupId && !s.groupeIds.includes(groupId)) return false;
      if (participantId && !s.participantIds.includes(participantId)) return false;
      if (exerciseId && !s.exerciceIds.includes(exerciseId)) return false;
      if (etapeFilter) {
        const hasEtape = s.exerciceIds.some((eid) =>
          improModel.exerciseById.get(eid)?.etapes.includes(etapeFilter)
        );
        if (!hasEtape) return false;
      }
      if (dateFrom && (!s.date || s.date < dateFrom)) return false;
      if (dateTo && (!s.date || s.date > dateTo)) return false;
      if (q) {
        const hay = [
          s.nom,
          s.date,
          ...s.groupeNames,
          ...s.participantNames,
          ...s.exerciceNames,
          s.notes,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!sortDesc) return [...list].reverse();
    return list;
  }, [
    improModel,
    statusFilter,
    groupId,
    participantId,
    exerciseId,
    etapeFilter,
    dateFrom,
    dateTo,
    searchQuery,
    sortDesc,
  ]);

  const groupedSeances = useMemo(() => {
    if (groupBy === 'flat') return [{ key: 'all', label: '', items: filteredSeances }];
    const buckets = new Map<string, { label: string; items: ImproSessionSummary[] }>();
    for (const s of filteredSeances) {
      if (groupBy === 'month') {
        const key = s.date ? s.date.slice(0, 7) : 'sans-date';
        const label = formatMonthLabel(s.date);
        const cur = buckets.get(key) ?? { label, items: [] };
        cur.items.push(s);
        buckets.set(key, cur);
      } else {
        const key = s.groupeIds[0] ?? 'sans-groupe';
        const label = s.groupeNames[0] ?? 'Sans groupe';
        const cur = buckets.get(key) ?? { label, items: [] };
        cur.items.push(s);
        buckets.set(key, cur);
      }
    }
    const entries = Array.from(buckets.entries()).map(([key, v]) => ({ key, ...v }));
    if (groupBy === 'group') {
      entries.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    }
    return entries;
  }, [filteredSeances, groupBy]);

  const timelineStats = useMemo(() => {
    const exIds = new Set<string>();
    const parIds = new Set<string>();
    for (const s of filteredSeances) {
      s.exerciceIds.forEach((id) => exIds.add(id));
      s.participantIds.forEach((id) => parIds.add(id));
    }
    return {
      seanceCount: filteredSeances.length,
      exerciseCount: exIds.size,
      participantCount: parIds.size,
    };
  }, [filteredSeances]);

  const selectedParticipant = participantId
    ? improModel.participantById.get(participantId) ?? null
    : null;

  const participantDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return improModel.participants.filter((p) => {
      if (groupId && !p.groupeIds.includes(groupId)) return false;
      if (q) {
        const hay = `${p.displayLabel} ${p.groupeNames.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [improModel.participants, groupId, searchQuery]);

  const filterParticipantOptions = useMemo(() => {
    if (!groupId) return improModel.participants;
    const inGroup = improModel.participants.filter((p) => p.groupeIds.includes(groupId));
    return inGroup.length > 0 ? inGroup : improModel.participants;
  }, [improModel.participants, groupId]);

  const matrix = useMemo(
    () =>
      computeGroupExerciseMatrix(improModel, {
        groupId: matrixGroupId || undefined,
        etapeFilter: etapeFilter || undefined,
        searchQuery,
        onlyNeverDoneByGroup: matrixOnlyNever,
      }),
    [improModel, matrixGroupId, etapeFilter, searchQuery, matrixOnlyNever]
  );

  const MATRIX_ORDER_KEY = 'timeline_matrix';
  const matrixDefaultColIds = useMemo(
    () => ['__ex__', '__done__', ...matrix.participants.map((p) => p.id)],
    [matrix.participants]
  );
  const matrixOrderedColIds = useMemo(
    () => mergeColumnOrder(matrixDefaultColIds, tableColumnOrders[MATRIX_ORDER_KEY]),
    [matrixDefaultColIds, tableColumnOrders]
  );
  const matrixDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(matrixOrderedColIds, sourceId, targetId, position);
    if (next !== matrixOrderedColIds) setTableColumnOrder(MATRIX_ORDER_KEY, next);
  });
  const matrixParticipantById = useMemo(
    () => new Map(matrix.participants.map((p) => [p.id, p])),
    [matrix.participants]
  );

  const DIR_ORDER_KEY = 'timeline_participants';
  const dirDefaultCols = useMemo(
    () => [
      { id: 'nom', label: 'Participant', align: 'left' as const },
      { id: 'groupe', label: 'Groupe', align: 'left' as const },
      { id: 'presences', label: 'Présences', align: 'right' as const },
      { id: 'assiduite', label: 'Assiduité', align: 'right' as const },
      { id: 'faits', label: 'Faits', align: 'right' as const },
      { id: 'jamais', label: 'Jamais faits', align: 'right' as const },
    ],
    []
  );
  const dirOrderedColIds = useMemo(
    () => mergeColumnOrder(dirDefaultCols.map((c) => c.id), tableColumnOrders[DIR_ORDER_KEY]),
    [dirDefaultCols, tableColumnOrders]
  );
  const dirOrderedCols = useMemo(() => {
    const map = new Map(dirDefaultCols.map((c) => [c.id, c]));
    return dirOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof dirDefaultCols)[number] => Boolean(c));
  }, [dirDefaultCols, dirOrderedColIds]);
  const dirDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(dirOrderedColIds, sourceId, targetId, position);
    if (next !== dirOrderedColIds) setTableColumnOrder(DIR_ORDER_KEY, next);
  });

  if (improLoading && !improModel.ready) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-4">
        <div className="h-8 w-52 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="h-72 w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Écosystème Impro
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError
            ? improError
            : 'Chargez les 4 bases (Exercices, Séances, Groupes, Participants) pour activer la chronologie.'}
        </p>
        <button
          type="button"
          onClick={() => void loadImproDatabases()}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
        >
          Charger les 4 bases impro
        </button>
      </div>
    );
  }

  const formExQ = newExQuery.trim().toLowerCase();
  const formExercises = improModel.exercises.filter(
    (e) =>
      !formExQ ||
      e.nom.toLowerCase().includes(formExQ) ||
      e.etapes.some((et) => et.toLowerCase().includes(formExQ))
  );

  const renderSessionCard = (s: ImproSessionSummary) => {
    const isAttendanceOpen = attendanceOpenId === s.id;
    const showAllMembers = attendanceShowAllForId === s.id;
    const groupMembers =
      s.groupeIds.length > 0 ? getGroupMemberIds(s.groupeIds, rowsByPage) : [];
    const candidateIds = new Set([...groupMembers, ...s.participantIds]);
    const attendancePool = showAllMembers
      ? improModel.participants
      : improModel.participants.filter((p) => candidateIds.has(p.id));

    return (
      <div
        key={s.id}
        className="p-4 sm:p-5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors space-y-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2.5 min-w-0">
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {s.date || 'Sans date'}
            </span>
            <button
              type="button"
              onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
              className="font-display text-base font-semibold text-slate-950 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors"
            >
              {s.nom}
            </button>
            {s.groupeIds.map((gid) => {
              const g = improModel.groupById.get(gid);
              return (
                <button
                  key={gid}
                  type="button"
                  onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                  className="text-left text-xs text-slate-600 dark:text-slate-300 hover:underline"
                >
                  · {g?.nom ?? gid}
                </button>
              );
            })}
            <span
              className={`text-xs font-medium ${
                s.status === 'Préparée'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              · {s.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {s.exerciceIds.length} exos · {s.participantIds.length} présents
              {s.totalDurationMin > 0 ? ` · ${s.totalDurationMin} min` : ''}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => openLiveAnimation(s.id)}
                className="h-7 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                <Play className="w-3 h-3" />
                <span>Animer</span>
              </button>
              <button
                type="button"
                onClick={() => setAttendanceOpenId((prev) => (prev === s.id ? null : s.id))}
                className={`h-7 px-2 rounded-lg border text-xs flex items-center gap-1 whitespace-nowrap transition-colors ${
                  isAttendanceOpen
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <UserCheck className="w-3 h-3" />
                <span>Pointage</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToPrepare({ seanceId: s.id })}
                className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <ListChecks className="w-3 h-3" />
                <span>Préparer</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToPrepare({ duplicateFromId: s.id })}
                aria-label={`Dupliquer ${s.nom}`}
                title="Dupliquer cette séance"
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <Copy className="w-3 h-3" />
              </button>
              {s.status === 'Préparée' && (
                <button
                  type="button"
                  onClick={() => toggleSeanceStatus(s.id)}
                  className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium whitespace-nowrap"
                >
                  Marquer réalisée
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tiroir de pointage rapide */}
        {isAttendanceOpen && (
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Pointage rapide ({s.participantIds.length} présents)
              </span>
              <button
                type="button"
                onClick={() =>
                  setAttendanceShowAllForId((prev) => (prev === s.id ? null : s.id))
                }
                className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
              >
                {showAllMembers ? 'Membres du groupe' : 'Tous les participants'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {attendancePool.length === 0 ? (
                <span className="text-xs text-slate-400">
                  Aucun participant lié à ce groupe. Cliquez sur Tous les participants.
                </span>
              ) : (
                attendancePool.map((p) => {
                  const present = s.participantIds.includes(p.id);
                  return (
                    <RelationActionChip
                      key={p.id}
                      label={p.displayLabel}
                      isLinked={present}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                      onAdd={() => toggleSeanceParticipant(s.id, p.id)}
                      onRemove={() => toggleSeanceParticipant(s.id, p.id)}
                    />
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Exercices de la séance */}
        {s.exerciceIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-slate-400 shrink-0">Exercices :</span>
            {s.exerciceIds.map((eid, idx) => {
              const ex = improModel.exerciseById.get(eid);
              const highlighted = exerciseId === eid;
              return (
                <span key={`${s.id}_ex_${eid}`} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, eid)}
                    className={`hover:underline text-left ${
                      highlighted
                        ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {ex?.nom ?? eid}
                  </button>
                  {idx < s.exerciceIds.length - 1 && (
                    <span className="text-slate-300 dark:text-slate-700 ml-2" aria-hidden="true">·</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Participants */}
        {s.participantIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-slate-400 shrink-0">Présents :</span>
            {s.participantIds.map((pid, idx) => {
              const p = improModel.participantById.get(pid);
              const highlighted = participantId === pid;
              return (
                <span key={`${s.id}_par_${pid}`} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.participants, pid)}
                    className={`hover:underline text-left ${
                      highlighted
                        ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p?.displayLabel ?? pid}
                  </button>
                  {idx < s.participantIds.length - 1 && (
                    <span className="text-slate-300 dark:text-slate-700 ml-2" aria-hidden="true">·</span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {s.notes && (
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            Notes : {s.notes}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      {/* En-tête + Mode + Action */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Chronologie & Historique
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Qui a fait quoi et quand — séances passées, préparées, matrice de groupe et bilans individuels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'chronology', label: 'Chronologie' },
                { id: 'matrix', label: 'Matrice' },
                { id: 'participant', label: 'Par participant' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  mode === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouvelle séance</span>
          </button>
        </div>
      </div>

      {/* Formulaire de création rapide */}
      {showCreateForm && (
        <form
          onSubmit={(e) => void handleCreateSession(e)}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
              Enregistrer une séance réalisée
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                navigateToPrepare();
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Ou construire un déroulé détaillé dans Préparer →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={newNom}
              onChange={(e) => setNewNom(e.target.value)}
              placeholder="Nom de la séance (optionnel)"
              aria-label="Nom de la séance"
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="Date de la séance"
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs tabular-nums focus:outline-none focus:border-indigo-500"
            />
            <select
              value={newGroupeId}
              onChange={(e) => handleGroupChangeInForm(e.target.value)}
              aria-label="Groupe de la séance"
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500"
            >
              <option value="">Sélectionner un groupe</option>
              {improModel.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Participants ({newParticipantIds.length})
                </span>
                {newGroupeId && (
                  <button
                    type="button"
                    onClick={() =>
                      setNewParticipantIds(getGroupMemberIds([newGroupeId], rowsByPage))
                    }
                    className="text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Pré-remplir le groupe
                  </button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-800/80">
                {improModel.participants.map((p) => {
                  const checked = newParticipantIds.includes(p.id);
                  return (
                    <RelationActionRow
                      key={p.id}
                      compact
                      label={p.displayLabel}
                      isLinked={checked}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                      onAdd={() =>
                        setNewParticipantIds((prev) =>
                          prev.includes(p.id) ? prev : [...prev, p.id]
                        )
                      }
                      onRemove={() =>
                        setNewParticipantIds((prev) => prev.filter((id) => id !== p.id))
                      }
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Exercices ({newExerciceIds.length})
                </span>
                <input
                  type="text"
                  value={newExQuery}
                  onChange={(e) => setNewExQuery(e.target.value)}
                  placeholder="Filtrer exercices..."
                  className="h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs focus:outline-none"
                />
              </div>
              <div className="max-h-40 overflow-y-auto p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 divide-y divide-slate-100 dark:divide-slate-800/80">
                {formExercises.slice(0, 100).map((ex) => {
                  const checked = newExerciceIds.includes(ex.id);
                  return (
                    <RelationActionRow
                      key={ex.id}
                      compact
                      label={ex.nom}
                      meta={ex.etapes[0] || ''}
                      isLinked={checked}
                      onOpen={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      onAdd={() =>
                        setNewExerciceIds((prev) =>
                          prev.includes(ex.id) ? prev : [...prev, ex.id]
                        )
                      }
                      onRemove={() =>
                        setNewExerciceIds((prev) => prev.filter((id) => id !== ex.id))
                      }
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="h-8 px-3 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating}
              className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-50"
            >
              {creating ? 'Création...' : 'Créer la séance'}
            </button>
          </div>
        </form>
      )}

      {/* Barre de filtres */}
      <div className="space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[210px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer séances, exercices, notes..."
              aria-label="Recherche globale"
              className="w-full h-9 pl-8 pr-3 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={groupId}
            onChange={(e) => {
              const nextG = e.target.value;
              updateTimelineSettings((prev) => ({
                ...prev,
                groupId: nextG,
                ...(nextG ? { matrixGroupId: nextG } : {}),
              }));
            }}
            aria-label="Filtrer par groupe"
            className="h-9 px-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none flex-1 sm:flex-none min-w-[140px]"
          >
            <option value="">Tous les groupes</option>
            {improModel.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>

          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            aria-label="Filtrer par participant"
            className="h-9 px-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none flex-1 sm:flex-none min-w-[140px]"
          >
            <option value="">Tous les participants</option>
            {filterParticipantOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayLabel}
              </option>
            ))}
          </select>

          <select
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            aria-label="Filtrer par exercice"
            className="h-9 px-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none flex-1 sm:flex-none min-w-[140px] sm:max-w-[190px]"
          >
            <option value="">Tous les exercices</option>
            {improModel.exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.nom}
              </option>
            ))}
          </select>

          <select
            value={etapeFilter}
            onChange={(e) => setEtapeFilter(e.target.value)}
            aria-label="Filtrer par étape"
            className="h-9 px-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none flex-1 sm:flex-none min-w-[130px]"
          >
            <option value="">Toutes les étapes</option>
            {improModel.allEtapes.map((et) => (
              <option key={et} value={et}>
                {et}
              </option>
            ))}
          </select>

          {mode === 'chronology' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filtrer par statut"
              className="h-9 px-2.5 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none flex-1 sm:flex-none min-w-[120px]"
            >
              <option value="all">Tous statuts</option>
              <option value="Réalisée">Réalisées</option>
              <option value="Préparée">Préparées</option>
            </select>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400">Du</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Date début"
                className="bg-transparent font-mono text-xs tabular-nums focus:outline-none"
              />
            </label>
            <label className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400">Au</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Date fin"
                className="bg-transparent font-mono text-xs tabular-nums focus:outline-none"
              />
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                aria-label="Réinitialiser les filtres"
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MODE 1 : CHRONOLOGIE */}
      {mode === 'chronology' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-mono tabular-nums flex items-center gap-2">
              <span>{timelineStats.seanceCount} séances</span>
              <span aria-hidden="true">·</span>
              <span>{timelineStats.exerciseCount} exercices</span>
              <span aria-hidden="true">·</span>
              <span>{timelineStats.participantCount} participants</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'flat', label: 'Liste' },
                    { id: 'month', label: 'Par mois' },
                    { id: 'group', label: 'Par groupe' },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupBy(g.id)}
                    className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                      groupBy === g.id
                        ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white font-medium shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSortDesc((v) => !v)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{sortDesc ? 'Récents' : 'Anciens'}</span>
              </button>
            </div>
          </div>

          {filteredSeances.length === 0 ? (
            <div className="p-10 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune séance pour ces critères
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedSeances.map((bucket) => (
                <div key={bucket.key} className="space-y-2">
                  {bucket.label && (
                    <div className="flex items-center justify-between px-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>{bucket.label}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {bucket.items.length} séances
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                    {bucket.items.map((s) => renderSessionCard(s))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODE 2 : MATRICE */}
      {mode === 'matrix' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={matrixGroupId}
                onChange={(e) => setMatrixGroupId(e.target.value)}
                aria-label="Groupe de la matrice"
                className="h-9 px-3 rounded-lg text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none"
              >
                <option value="">Tous les participants ({improModel.participants.length})</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom} ({g.participantIds.length})
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={matrixOnlyNever}
                  onChange={(e) => setMatrixOnlyNever(e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-600"
                />
                <span>Jamais faits uniquement</span>
              </label>
            </div>

            <span className="text-xs font-mono tabular-nums text-slate-500">
              {matrix.exercises.length} exercices × {matrix.participants.length} participants
            </span>
          </div>

          {matrix.participants.length === 0 ? (
            <div className="p-8 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-center text-sm text-slate-500">
              Aucun participant dans ce périmètre.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 max-h-[620px]">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs">
                  <tr>
                    {matrixOrderedColIds.map((colId, colIdx) => {
                      const isDragging = matrixDrag.dragColId === colId;
                      const dropSide =
                        matrixDrag.dropIndicator?.colId === colId
                          ? matrixDrag.dropIndicator.position
                          : null;
                      const indicator = dropSide ? (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-indigo-600 dark:bg-indigo-400 z-30 ${
                            dropSide === 'before' ? 'left-0' : 'right-0'
                          }`}
                        />
                      ) : null;

                      if (colId === '__ex__') {
                        return (
                          <th
                            key={colId}
                            {...matrixDrag.getThDropProps(colId)}
                            className={`group/th ${
                              colIdx === 0 ? 'sticky left-0 z-30' : 'relative'
                            } bg-slate-50 dark:bg-slate-900 px-3 py-2.5 font-medium text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800 min-w-[220px] select-none transition-opacity ${
                              isDragging ? 'opacity-45' : ''
                            }`}
                          >
                            {indicator}
                            <div
                              {...matrixDrag.getDragHandleProps(colId)}
                              title="Glisser pour réordonner"
                              className="inline-flex items-center gap-1 cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                              <span>Exercice</span>
                            </div>
                          </th>
                        );
                      }

                      if (colId === '__done__') {
                        return (
                          <th
                            key={colId}
                            {...matrixDrag.getThDropProps(colId)}
                            className={`group/th relative px-2.5 py-2.5 font-medium text-slate-500 text-right border-r border-slate-200 dark:border-slate-800 whitespace-nowrap select-none transition-opacity ${
                              isDragging ? 'opacity-45' : ''
                            }`}
                          >
                            {indicator}
                            <div
                              {...matrixDrag.getDragHandleProps(colId)}
                              title="Glisser pour réordonner"
                              className="inline-flex items-center justify-end gap-1 w-full cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                              <span>Fait par</span>
                            </div>
                          </th>
                        );
                      }

                      const p = matrixParticipantById.get(colId);
                      if (!p) return null;
                      return (
                        <th
                          key={p.id}
                          {...matrixDrag.getThDropProps(p.id)}
                          className={`group/th relative px-2.5 py-2 font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-center min-w-[92px] select-none transition-opacity ${
                            isDragging ? 'opacity-45' : ''
                          }`}
                        >
                          {indicator}
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center justify-center gap-1 w-full">
                              <span
                                {...matrixDrag.getDragHandleProps(p.id)}
                                title="Glisser pour réordonner"
                                className="cursor-grab active:cursor-grabbing opacity-0 group-hover/th:opacity-100 transition-opacity shrink-0"
                              >
                                <GripVertical className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                              </span>
                              <button
                                type="button"
                                onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate max-w-[90px]"
                                title={`Ouvrir la fiche : ${p.displayLabel}`}
                              >
                                {p.nom}
                              </button>
                            </div>
                            <div className="text-[10px] font-mono tabular-nums text-slate-400 font-normal">
                              {p.presenceCount} séa.
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {matrix.exercises.slice(0, 150).map((ex) => {
                    const doneCount = matrix.exerciseDoneCountById.get(ex.id) ?? 0;
                    return (
                      <tr
                        key={ex.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        {matrixOrderedColIds.map((colId, colIdx) => {
                          if (colId === '__ex__') {
                            return (
                              <td
                                key={colId}
                                className={`${
                                  colIdx === 0 ? 'sticky left-0 z-10' : ''
                                } bg-white dark:bg-slate-900 px-3 py-2 border-r border-slate-200 dark:border-slate-800`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                                    className="font-medium text-slate-900 dark:text-slate-100 hover:underline text-left block truncate max-w-[180px]"
                                  >
                                    {ex.nom}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigateToPrepare({
                                        groupId: matrixGroupId || undefined,
                                        addExerciseIds: [ex.id],
                                      })
                                    }
                                    title="Ajouter à Préparer"
                                    aria-label={`Ajouter ${ex.nom} à Préparer`}
                                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                                  >
                                    +
                                  </button>
                                </div>
                                {ex.etapes.length > 0 && (
                                  <div className="text-[11px] text-slate-400 truncate max-w-[210px]">
                                    {ex.etapes.join(', ')}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          if (colId === '__done__') {
                            return (
                              <td
                                key={colId}
                                className="px-2.5 py-2 text-right font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 whitespace-nowrap"
                              >
                                {doneCount}/{matrix.participants.length}
                              </td>
                            );
                          }
                          const p = matrixParticipantById.get(colId);
                          if (!p) return null;
                          const cell = matrix.cellByKey.get(`${ex.id}::${p.id}`);
                          return (
                            <td
                              key={p.id}
                              className="px-2 py-2 text-center font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 last:border-r-0"
                            >
                              {cell ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    cell.lastSeanceId
                                      ? openImproDetail(IMPRO_DB_IDS.seances, cell.lastSeanceId)
                                      : openImproDetail(IMPRO_DB_IDS.exercices, ex.id)
                                  }
                                  title={`${cell.count}× · ${
                                    cell.lastSeanceName ? `${cell.lastSeanceName} ` : ''
                                  }(${cell.lastDate || '—'})`}
                                  aria-label={`${ex.nom} par ${p.displayLabel} : ${cell.count} fois, ouvrir la fiche`}
                                  className="inline-flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-medium transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  {cell.count > 1 && <span className="text-[10px]">{cell.count}</span>}
                                </button>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-700">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODE 3 : PAR PARTICIPANT */}
      {mode === 'participant' && (
        <div className="space-y-5">
          {selectedParticipant ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-white">
                    <button
                      type="button"
                      onClick={() =>
                        openImproDetail(IMPRO_DB_IDS.participants, selectedParticipant.id)
                      }
                      className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                    >
                      {selectedParticipant.displayLabel}
                    </button>
                  </h2>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {selectedParticipant.groupeIds.length > 0 ? (
                      <span className="inline-flex flex-wrap items-center gap-1 font-sans">
                        {selectedParticipant.groupeIds.map((gid, idx) => {
                          const gName =
                            improModel.groupById.get(gid)?.nom ??
                            selectedParticipant.groupeNames[idx] ??
                            gid;
                          return (
                            <span key={gid} className="inline-flex items-center">
                              <button
                                type="button"
                                onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                              >
                                {gName}
                              </button>
                              {idx < selectedParticipant.groupeIds.length - 1 && (
                                <span className="text-slate-400" aria-hidden="true">
                                  ,
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span>{selectedParticipant.groupeNames.join(', ') || 'Sans groupe'}</span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.presenceCount} présences</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.attendancePct}% assiduité</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.doneExercises.length} faits</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedParticipant.neverDoneExercises.length} jamais faits</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.participants, selectedParticipant.id)}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Ouvrir fiche
                  </button>
                  <button
                    type="button"
                    onClick={() => setParticipantId('')}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Annuaire
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-900 dark:text-slate-100">Exercices déjà faits</span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {selectedParticipant.doneExercises.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto">
                    {selectedParticipant.doneExercises.length === 0 ? (
                      <p className="p-4 text-xs text-slate-400">Aucun exercice fait</p>
                    ) : (
                      selectedParticipant.doneExercises.map((rec) => (
                        <div
                          key={rec.exerciceId}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, rec.exerciceId)}
                              className="font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate text-left"
                            >
                              {rec.nom}
                            </button>
                            <span className="font-mono tabular-nums text-slate-400 shrink-0">
                              {rec.count}× · {rec.lastDate || '—'}
                            </span>
                          </div>
                          {rec.sessions.length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                              {rec.sessions.map((s, idx) => (
                                <span key={s.id} className="inline-flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => openImproDetail(IMPRO_DB_IDS.seances, s.id)}
                                    className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                                  >
                                    {s.nom}
                                  </button>
                                  {idx < rec.sessions.length - 1 && (
                                    <span className="text-slate-400" aria-hidden="true">
                                      ,
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-900 dark:text-slate-100">Exercices jamais faits</span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {
                        selectedParticipant.neverDoneExercises.filter(
                          (e) =>
                            (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                            (!searchQuery ||
                              e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                        ).length
                      }
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] overflow-y-auto">
                    {selectedParticipant.neverDoneExercises
                      .filter(
                        (e) =>
                          (!etapeFilter || e.etapes.includes(etapeFilter)) &&
                          (!searchQuery ||
                            e.nom.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                      )
                      .map((ex) => (
                        <div
                          key={ex.id}
                          className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <button
                            type="button"
                            onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                            className="text-left truncate text-slate-800 dark:text-slate-200 hover:underline flex-1"
                          >
                            {ex.nom}
                          </button>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {ex.etapes.join(', ') || '—'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              navigateToPrepare({
                                groupId: selectedParticipant.groupeIds[0] || undefined,
                                addExerciseIds: [ex.id],
                              })
                            }
                            className="text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 font-medium"
                          >
                            + Préparer
                          </button>
                        </div>
                      ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {dirOrderedCols.map((col) => {
                      const isDragging = dirDrag.dragColId === col.id;
                      const dropSide =
                        dirDrag.dropIndicator?.colId === col.id
                          ? dirDrag.dropIndicator.position
                          : null;
                      return (
                        <th
                          key={col.id}
                          {...dirDrag.getThDropProps(col.id)}
                          className={`group/th relative px-4 py-2.5 select-none whitespace-nowrap transition-opacity ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          } ${isDragging ? 'opacity-45' : ''}`}
                        >
                          {dropSide && (
                            <div
                              aria-hidden="true"
                              className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-indigo-600 dark:bg-indigo-400 z-20 ${
                                dropSide === 'before' ? 'left-0' : 'right-0'
                              }`}
                            />
                          )}
                          <div
                            {...dirDrag.getDragHandleProps(col.id)}
                            title="Glisser pour réordonner"
                            className={`inline-flex items-center gap-1 cursor-grab active:cursor-grabbing ${
                              col.align === 'right' ? 'justify-end' : ''
                            }`}
                          >
                            <GripVertical className="w-3 h-3 shrink-0 text-slate-300 dark:text-slate-600 opacity-0 group-hover/th:opacity-100 transition-opacity" />
                            <span>{col.label}</span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-4 py-2.5 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {participantDirectory.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {dirOrderedCols.map((col) => {
                        if (col.id === 'nom') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100"
                            >
                              <button
                                type="button"
                                onClick={() => setParticipantId(p.id)}
                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                              >
                                {p.displayLabel}
                              </button>
                            </td>
                          );
                        }
                        if (col.id === 'groupe') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400"
                            >
                              {p.groupeIds.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  {p.groupeIds.map((gid, idx) => {
                                    const gName =
                                      improModel.groupById.get(gid)?.nom ??
                                      p.groupeNames[idx] ??
                                      gid;
                                    return (
                                      <span key={gid} className="inline-flex items-center">
                                        <button
                                          type="button"
                                          onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                                          className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                                        >
                                          {gName}
                                        </button>
                                        {idx < p.groupeIds.length - 1 && (
                                          <span className="text-slate-400" aria-hidden="true">
                                            ,
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                p.groupeNames.join(', ') || '—'
                              )}
                            </td>
                          );
                        }
                        if (col.id === 'presences') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2.5 text-right font-mono tabular-nums text-xs"
                            >
                              {p.presenceCount}
                            </td>
                          );
                        }
                        if (col.id === 'assiduite') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500"
                            >
                              {p.attendancePct}%
                            </td>
                          );
                        }
                        if (col.id === 'faits') {
                          return (
                            <td
                              key={col.id}
                              className="px-4 py-2.5 text-right font-mono tabular-nums text-xs"
                            >
                              {p.doneExercises.length}
                            </td>
                          );
                        }
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-2.5 text-right font-mono tabular-nums text-xs text-slate-500"
                          >
                            {p.neverDoneExercises.length}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                          className="px-2.5 py-1 rounded-md text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-medium"
                        >
                          Fiche
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
