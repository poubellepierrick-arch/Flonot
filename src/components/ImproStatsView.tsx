import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import { mergeColumnOrder, reorderIds } from '../utils/columnOrder';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';
import { computeImproStats } from '../utils/improEngine';

type ParticipantSortKey = 'nom' | 'presences' | 'attendancePct' | 'distinct';
type ExerciseTab = 'top' | 'forgotten' | 'never';

export function ImproStatsView() {
  const {
    improModel,
    improLoading,
    improError,
    openImproDetail,
    navigateToPrepare,
    loadImproDatabases,
    tableColumnOrders,
    setTableColumnOrder,
    viewSettings,
    updateStatsSettings,
  } = useWorkspace();

  const { groupId, dateFrom, dateTo, parSortKey, parSortAsc, exerciseTab } = viewSettings.stats;
  const setGroupId = (val: string) => updateStatsSettings({ groupId: val });
  const setDateFrom = (val: string) => updateStatsSettings({ dateFrom: val });
  const setDateTo = (val: string) => updateStatsSettings({ dateTo: val });
  const setExerciseTab = (val: ExerciseTab) => updateStatsSettings({ exerciseTab: val });

  const stats = useMemo(
    () =>
      computeImproStats(improModel, {
        groupId: groupId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [improModel, groupId, dateFrom, dateTo]
  );

  // Activité mensuelle pour graphique SVG
  const monthlySeries = useMemo(() => {
    const buckets = new Map<string, { month: string; sessions: number; totalPresent: number }>();
    for (const s of improModel.realizedSeances) {
      if (groupId && !s.groupeIds.includes(groupId)) continue;
      if (dateFrom && s.date && s.date < dateFrom) continue;
      if (dateTo && s.date && s.date > dateTo) continue;
      if (!s.date || s.date.length < 7) continue;
      const month = s.date.slice(0, 7);
      const cur = buckets.get(month) ?? { month, sessions: 0, totalPresent: 0 };
      cur.sessions += 1;
      cur.totalPresent += s.participantIds.length;
      buckets.set(month, cur);
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [improModel.realizedSeances, groupId, dateFrom, dateTo]);

  const sortedParticipants = useMemo(() => {
    const list = [...stats.participantStats];
    list.sort((a, b) => {
      let cmp = 0;
      if (parSortKey === 'presences') cmp = a.presences - b.presences;
      else if (parSortKey === 'attendancePct') cmp = a.attendancePct - b.attendancePct;
      else if (parSortKey === 'distinct') cmp = a.distinctExercisesCount - b.distinctExercisesCount;
      else cmp = a.displayLabel.localeCompare(b.displayLabel, 'fr');
      return parSortAsc ? cmp : -cmp;
    });
    return list;
  }, [stats.participantStats, parSortKey, parSortAsc]);

  const toggleParSort = (key: ParticipantSortKey) => {
    updateStatsSettings((prev) =>
      prev.parSortKey === key
        ? { ...prev, parSortAsc: !prev.parSortAsc }
        : { ...prev, parSortKey: key, parSortAsc: key === 'nom' }
    );
  };

  const GROUP_ORDER_KEY = 'stats_groups';
  const groupDefaultCols = useMemo(
    () => [
      { id: 'groupe', label: 'Groupe', align: 'left' as const },
      { id: 'membres', label: 'Membres', align: 'right' as const },
      { id: 'seances', label: 'Séances', align: 'right' as const },
      { id: 'moy', label: 'Moy. présents', align: 'right' as const },
      { id: 'assiduite', label: 'Assiduité', align: 'right' as const },
      { id: 'couverture', label: 'Couverture', align: 'right' as const },
      { id: 'derniere', label: 'Dernière', align: 'left' as const },
      { id: 'etapes', label: 'Étapes dominantes', align: 'left' as const },
    ],
    []
  );
  const groupOrderedColIds = useMemo(
    () => mergeColumnOrder(groupDefaultCols.map((c) => c.id), tableColumnOrders[GROUP_ORDER_KEY]),
    [groupDefaultCols, tableColumnOrders]
  );
  const groupOrderedCols = useMemo(() => {
    const map = new Map(groupDefaultCols.map((c) => [c.id, c]));
    return groupOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof groupDefaultCols)[number] => Boolean(c));
  }, [groupDefaultCols, groupOrderedColIds]);
  const groupDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(groupOrderedColIds, sourceId, targetId, position);
    if (next !== groupOrderedColIds) setTableColumnOrder(GROUP_ORDER_KEY, next);
  });

  const PAR_ORDER_KEY = 'stats_participants';
  const parDefaultCols = useMemo(
    () => [
      { id: 'nom', label: 'Participant', align: 'left' as const, sortKey: 'nom' as const },
      { id: 'groupe', label: 'Groupe', align: 'left' as const, sortKey: null },
      { id: 'presences', label: 'Présences', align: 'right' as const, sortKey: 'presences' as const },
      { id: 'taux', label: 'Taux', align: 'right' as const, sortKey: 'attendancePct' as const },
      { id: 'exos', label: 'Exos', align: 'right' as const, sortKey: 'distinct' as const },
      { id: 'derniere', label: 'Dernière', align: 'right' as const, sortKey: null },
    ],
    []
  );
  const parOrderedColIds = useMemo(
    () => mergeColumnOrder(parDefaultCols.map((c) => c.id), tableColumnOrders[PAR_ORDER_KEY]),
    [parDefaultCols, tableColumnOrders]
  );
  const parOrderedCols = useMemo(() => {
    const map = new Map(parDefaultCols.map((c) => [c.id, c]));
    return parOrderedColIds
      .map((id) => map.get(id))
      .filter((c): c is (typeof parDefaultCols)[number] => Boolean(c));
  }, [parDefaultCols, parOrderedColIds]);
  const parDrag = useColumnDrag((sourceId, targetId, position) => {
    const next = reorderIds(parOrderedColIds, sourceId, targetId, position);
    if (next !== parOrderedColIds) setTableColumnOrder(PAR_ORDER_KEY, next);
  });

  if (improLoading && !improModel.ready) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-4">
        <div className="h-8 w-48 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!improModel.ready) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">
          Statistiques & Analyse
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {improError || 'Chargez les 4 bases Impro pour afficher les analyses.'}
        </p>
        <button
          type="button"
          onClick={() => void loadImproDatabases()}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white whitespace-nowrap"
        >
          Charger les 4 bases
        </button>
      </div>
    );
  }

  const maxMonthlySessions = Math.max(1, ...monthlySeries.map((m) => m.sessions));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-7">
      {/* En-tête + filtres */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Statistiques de l’atelier
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Couverture du répertoire Biblimpro, assiduité des participants et équilibre pédagogique.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            aria-label="Filtrer les statistiques par groupe"
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
          >
            <option value="">Tous les groupes</option>
            {improModel.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>

          <label className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400">Du</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Date de début"
              className="bg-transparent font-mono text-xs tabular-nums focus:outline-none"
            />
          </label>
          <label className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400">Au</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="Date de fin"
              className="bg-transparent font-mono text-xs tabular-nums focus:outline-none"
            />
          </label>

          {(groupId || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setGroupId('');
                setDateFrom('');
                setDateTo('');
              }}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 KPI principaux */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Séances réalisées</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.sessionCount}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.summary.avgPresentPerSession} présents / séance
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Couverture Biblimpro</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {stats.summary.coveragePct}%
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.summary.activeExercisesCount} / {stats.summary.totalExercisesCount} exercices
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Assiduité moyenne</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.summary.avgAttendancePct}%
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.participantStats.length} participants suivis
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Réserve inédite</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-950 dark:text-white">
            {stats.summary.neverDoneCount}
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            dont {stats.summary.neverDoneMarkedVCount} validés (V)
          </div>
        </div>
      </div>

      {/* Graphiques : Activité mensuelle + Étapes + Repères 1/2/V */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Activité mensuelle SVG */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
                Rythme mensuel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nombre de séances par mois (12 derniers mois)
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {monthlySeries.length} mois
            </span>
          </div>

          {monthlySeries.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              Aucune séance datée sur cette période
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                viewBox={`0 0 ${Math.max(240, monthlySeries.length * 42)} 140`}
                className="w-full h-44 overflow-visible"
                role="img"
                aria-label="Graphique des séances par mois"
              >
                {monthlySeries.map((item, idx) => {
                  const barHeight = Math.max(8, Math.round((item.sessions / maxMonthlySessions) * 96));
                  const x = idx * 42 + 8;
                  const y = 112 - barHeight;
                  const avgPres = Math.round(item.totalPresent / Math.max(1, item.sessions));
                  return (
                    <g key={item.month}>
                      <title>{`${item.month} : ${item.sessions} séances · moy. ${avgPres} présents`}</title>
                      <rect
                        x={x}
                        y={y}
                        width={26}
                        height={barHeight}
                        rx={5}
                        className="fill-indigo-600 dark:fill-indigo-500 hover:fill-indigo-500 dark:hover:fill-indigo-400 transition-colors"
                      />
                      <text
                        x={x + 13}
                        y={y - 5}
                        textAnchor="middle"
                        className="fill-slate-600 dark:fill-slate-300 text-[10px] font-mono"
                      >
                        {item.sessions}
                      </text>
                      <text
                        x={x + 13}
                        y={130}
                        textAnchor="middle"
                        className="fill-slate-400 text-[9px] font-mono"
                      >
                        {item.month.slice(2)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </section>

        {/* Répartition par étape */}
        <section className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
                Répartition par étape
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Couverture et usages réels
              </p>
            </div>
          </div>
          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {stats.etapeBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400">Aucune étape renseignée</p>
            ) : (
              stats.etapeBreakdown.map((et) => (
                <div key={et.etape} className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {et.etape}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {et.practicedCatalog}/{et.totalCatalog} ({et.coveragePct}%) · {et.usagesCount}×
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-400 rounded-full"
                      style={{ width: `${et.coveragePct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Repères 1 / 2 / V */}
        <section className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              Inédits (1 / 2 / V)
            </h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800 text-center">
            <div className="p-2.5">
              <div className="text-[11px] text-slate-500 font-mono">1</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-slate-950 dark:text-white">
                {stats.markerStats.never1}/{stats.markerStats.total1}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[11px] text-slate-500 font-mono">2</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-slate-950 dark:text-white">
                {stats.markerStats.never2}/{stats.markerStats.total2}
              </div>
            </div>
            <div className="p-2.5">
              <div className="text-[11px] text-slate-500 font-mono">V</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                {stats.markerStats.neverV}/{stats.markerStats.totalV}
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-48 overflow-y-auto flex-1">
            {stats.markerStats.unplayedMarkedV.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">
                Tous les exercices V ont été pratiqués
              </div>
            ) : (
              stats.markerStats.unplayedMarkedV.slice(0, 30).map((ex) => (
                <div
                  key={ex.id}
                  className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <button
                    type="button"
                    onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                    className="text-left text-slate-800 dark:text-slate-200 hover:underline truncate"
                  >
                    {ex.nom}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToPrepare({ addExerciseIds: [ex.id] })}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    + Préparer
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Comparaison des groupes */}
      <section className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Comparaison des groupes
          </h2>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {stats.groupComparison.length} groupes
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                {groupOrderedCols.map((col) => {
                  const isDragging = groupDrag.dragColId === col.id;
                  const dropSide =
                    groupDrag.dropIndicator?.colId === col.id
                      ? groupDrag.dropIndicator.position
                      : null;
                  return (
                    <th
                      key={col.id}
                      {...groupDrag.getThDropProps(col.id)}
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
                        {...groupDrag.getDragHandleProps(col.id)}
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
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {stats.groupComparison.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  {groupOrderedCols.map((col) => {
                    if (col.id === 'groupe') {
                      return (
                        <td
                          key={col.id}
                          className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100"
                        >
                          <button
                            type="button"
                            onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, g.id)}
                            className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                          >
                            {g.nom}
                          </button>
                        </td>
                      );
                    }
                    if (col.id === 'membres') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.memberCount}
                        </td>
                      );
                    }
                    if (col.id === 'seances') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.sessionCount}
                        </td>
                      );
                    }
                    if (col.id === 'moy') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.avgPresent}
                        </td>
                      );
                    }
                    if (col.id === 'assiduite') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.attendancePct}%
                        </td>
                      );
                    }
                    if (col.id === 'couverture') {
                      return (
                        <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {g.coveredExercisesCount} ({g.coveragePct}%)
                        </td>
                      );
                    }
                    if (col.id === 'derniere') {
                      return (
                        <td
                          key={col.id}
                          className="px-4 py-2.5 font-mono tabular-nums text-slate-500"
                        >
                          {g.lastDate || '—'}
                        </td>
                      );
                    }
                    return (
                      <td key={col.id} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                        {g.topEtapes.join(', ') || '—'}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, g.id)}
                        className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline font-medium"
                      >
                        Fiche
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateToPrepare({ groupId: g.id })}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        Préparer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Participants + Palmarès des exercices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              Assiduité & diversité par participant
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {sortedParticipants.length} participants
            </span>
          </div>
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 z-10">
                <tr>
                  {parOrderedCols.map((col) => {
                    const isDragging = parDrag.dragColId === col.id;
                    const dropSide =
                      parDrag.dropIndicator?.colId === col.id
                        ? parDrag.dropIndicator.position
                        : null;
                    const isSorted = col.sortKey && parSortKey === col.sortKey;
                    return (
                      <th
                        key={col.id}
                        {...parDrag.getThDropProps(col.id)}
                        className={`group/th relative px-4 py-2.5 select-none whitespace-nowrap ${
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
                        <div className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                          <span
                            {...parDrag.getDragHandleProps(col.id)}
                            className="cursor-grab active:cursor-grabbing opacity-0 group-hover/th:opacity-100 transition-opacity"
                          >
                            <GripVertical className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                          </span>
                          {col.sortKey ? (
                            <button
                              type="button"
                              onClick={() => toggleParSort(col.sortKey!)}
                              className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
                            >
                              <span>{col.label}</span>
                              {isSorted &&
                                (parSortAsc ? (
                                  <ArrowUp className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ))}
                            </button>
                          ) : (
                            <span>{col.label}</span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {sortedParticipants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    {parOrderedCols.map((col) => {
                      if (col.id === 'nom') {
                        return (
                          <td key={col.id} className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                            <button
                              type="button"
                              onClick={() => openImproDetail(IMPRO_DB_IDS.participants, p.id)}
                              className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                            >
                              {p.displayLabel}
                            </button>
                          </td>
                        );
                      }
                      if (col.id === 'groupe') {
                        const grpIds = improModel.participantById.get(p.id)?.groupeIds ?? [];
                        return (
                          <td
                            key={col.id}
                            className="px-4 py-2.5 text-slate-500 dark:text-slate-400 max-w-[160px]"
                          >
                            {grpIds.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {grpIds.map((gid, idx) => {
                                  const gName = improModel.groupById.get(gid)?.nom ?? p.groupeNames[idx] ?? gid;
                                  return (
                                    <span key={gid} className="inline-flex items-center">
                                      <button
                                        type="button"
                                        onClick={() => openImproDetail(IMPRO_DB_IDS.groupes, gid)}
                                        className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline text-left"
                                      >
                                        {gName}
                                      </button>
                                      {idx < grpIds.length - 1 && (
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
                          <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {p.presences}
                            {p.groupSessionsCount > 0 ? `/${p.groupSessionsCount}` : ''}
                          </td>
                        );
                      }
                      if (col.id === 'taux') {
                        return (
                          <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {p.attendancePct}%
                          </td>
                        );
                      }
                      if (col.id === 'exos') {
                        return (
                          <td key={col.id} className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {p.distinctExercisesCount}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.id}
                          className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-500"
                        >
                          {p.lastDate || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Palmarès des exercices */}
        <section className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Palmarès Biblimpro</h2>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'top', label: `Plus joués (${stats.topExercises.length})` },
                  { id: 'forgotten', label: `Oubliés (${stats.forgottenExercises.length})` },
                  { id: 'never', label: `Jamais (${stats.neverDoneExercises.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setExerciseTab(tab.id)}
                  className={`py-1.5 px-1.5 rounded-md text-[11px] font-medium whitespace-nowrap truncate transition-colors ${
                    exerciseTab === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[380px] overflow-y-auto">
            {exerciseTab === 'top' &&
              (stats.topExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">Aucune donnée</div>
              ) : (
                stats.topExercises.slice(0, 60).map((item) => (
                  <div
                    key={item.exercise.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, item.exercise.id)}
                      className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate"
                    >
                      {item.exercise.nom}
                    </button>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {item.periodCount}× · {item.lastDate || '—'}
                    </span>
                  </div>
                ))
              ))}

            {exerciseTab === 'forgotten' &&
              (stats.forgottenExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">Aucune donnée</div>
              ) : (
                stats.forgottenExercises.slice(0, 60).map((ex) => (
                  <div
                    key={ex.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <button
                      type="button"
                      onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                      className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate"
                    >
                      {ex.nom}
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-slate-500">
                        {ex.lastDate || '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToPrepare({
                            groupId: groupId || undefined,
                            addExerciseIds: [ex.id],
                          })
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      >
                        + Préparer
                      </button>
                    </div>
                  </div>
                ))
              ))}

            {exerciseTab === 'never' &&
              (stats.neverDoneExercises.length === 0 ? (
                <div className="p-6 text-xs text-slate-500 text-center">
                  Tout le répertoire a été pratiqué
                </div>
              ) : (
                stats.neverDoneExercises.slice(0, 80).map((ex) => {
                  const marks = [
                    ex.check1 ? '1' : '',
                    ex.check2 ? '2' : '',
                    ex.checkV ? 'V' : '',
                  ].filter(Boolean);
                  return (
                    <div
                      key={ex.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openImproDetail(IMPRO_DB_IDS.exercices, ex.id)}
                          className="text-left text-slate-900 dark:text-slate-100 hover:underline truncate block max-w-full"
                        >
                          {ex.nom}
                        </button>
                        {(ex.etapes.length > 0 || marks.length > 0) && (
                          <div className="text-[11px] text-slate-400 truncate">
                            {[ex.etapes.join(', '), marks.join('·')].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToPrepare({
                            groupId: groupId || undefined,
                            addExerciseIds: [ex.id],
                          })
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium whitespace-nowrap shrink-0"
                      >
                        + Préparer
                      </button>
                    </div>
                  );
                })
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
