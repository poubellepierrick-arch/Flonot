import type {
  ExploreModelId,
  ExploreSuggestedExercise,
  ExploreSuggestedSession,
  ExploreSuggestedSessionStep,
  ExploreTier,
} from '../types/workspace';
import { generateId } from './id';
import type { ImproEcosystemModel } from './improEngine';

export interface ExploreModelSpec {
  id: ExploreModelId;
  label: string;
  shortLabel: string;
  tagline: string;
  tiers: Record<
    ExploreTier,
    {
      label: string;
      description: string;
    }
  >;
}

export const EXPLORE_MODELS: Record<ExploreModelId, ExploreModelSpec> = {
  'gemini-4-hydrogen': {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    shortLabel: 'Hydrogen',
    tagline: 'Gratuit · Polyvalent & raisonnement avancé',
    tiers: {
      standard: { label: 'Standard', description: 'Réponse rapide et directe' },
      plan: { label: 'Plan', description: 'Structuration pédagogique approfondie' },
      max: { label: 'Max', description: 'Synthèse maximale sur tout le groupe' },
    },
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    shortLabel: 'Flash Lite',
    tagline: 'Gratuit · Ultra-rapide et léger',
    tiers: {
      standard: { label: 'Standard', description: 'Idées immédiates sans attente' },
      plan: { label: 'Plan', description: 'Trame structurée équilibrée' },
      max: { label: 'Max', description: 'Analyse détaillée maximale du modèle' },
    },
  },
};

export const EXPLORE_TIERS: ExploreTier[] = ['standard', 'plan', 'max'];

export function buildImproAdvisorContext(
  model: ImproEcosystemModel,
  groupId?: string,
  thematique?: string
): string {
  if (!model.ready) {
    return 'Les bases de données Atelier Impro ne sont pas encore chargées.';
  }

  const lines: string[] = [];
  lines.push(
    `ATELIER IMPRO — CATALOGUE GLOBAL: ${model.exercises.length} exercices dans Biblimpro, ${model.realizedSeances.length} séances réalisées, ${model.plannedSeances.length} séances préparées, ${model.groups.length} groupes, ${model.participants.length} participants.`
  );

  if (model.allEtapes.length > 0) {
    lines.push(`ÉTAPES DISPONIBLES DANS BIBLIMPRO: ${model.allEtapes.join(', ')}`);
  }
  if (model.allTags.length > 0) {
    lines.push(`TAGS DISPONIBLES: ${model.allTags.slice(0, 40).join(', ')}`);
  }

  if (thematique && thematique.trim()) {
    lines.push(`THÉMATIQUE DEMANDÉE PAR L'ANIMATEUR: ${thematique.trim()}`);
  }

  const targetGroup = groupId ? model.groupById.get(groupId) : undefined;
  if (targetGroup) {
    lines.push('');
    lines.push(`=== GROUPE SÉLECTIONNÉ : ${targetGroup.nom} ===`);
    lines.push(
      `Effectif: ${targetGroup.participantIds.length} membres (${targetGroup.participantNames.join(', ') || 'aucun'})`
    );
    lines.push(
      `Historique: ${targetGroup.sessions.length} séances réalisées, ${targetGroup.plannedSessions.length} séances préparées, couverture catalogue ${targetGroup.coveragePct}%, moyenne présents ${targetGroup.avgPresent} (${targetGroup.attendancePct}%), dernière séance: ${targetGroup.lastDate || 'aucune'}.`
    );

    if (targetGroup.sessions.length > 0) {
      lines.push('Dernières séances réalisées du groupe:');
      for (const s of targetGroup.sessions.slice(0, 6)) {
        const notePart = s.notes ? ` | Notes: ${s.notes.slice(0, 180)}` : '';
        lines.push(
          `- [${s.date || 'sans date'}] ${s.nom} (${s.participantNames.length} présents): ${s.exerciceNames.join(', ') || 'aucun exercice lié'}${notePart}`
        );
      }
    }

    if (targetGroup.plannedSessions.length > 0) {
      lines.push('Séances déjà préparées à venir pour ce groupe:');
      for (const s of targetGroup.plannedSessions.slice(0, 4)) {
        lines.push(
          `- [${s.date || 'à dater'}] ${s.nom}: ${s.exerciceNames.join(', ') || 'en cours de construction'}`
        );
      }
    }

    // Répartition des étapes pratiquées par ce groupe
    const etapeCount = new Map<string, number>();
    for (const et of model.allEtapes) etapeCount.set(et, 0);
    for (const rec of targetGroup.practicedExercises) {
      for (const et of rec.etapes) {
        etapeCount.set(et, (etapeCount.get(et) ?? 0) + rec.count);
      }
    }
    const etapeSummary = Array.from(etapeCount.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([et, count]) => `${et}: ${count}`)
      .join(' · ');
    if (etapeSummary) {
      lines.push(`Pratique par étape (du moins au plus pratiqué): ${etapeSummary}`);
    }

    // Exercices jamais faits par ce groupe (priorisés)
    const neverDoneSorted = [...targetGroup.neverDoneExercises].sort((a, b) => {
      const scoreA = (a.checkV ? 4 : 0) + (a.check1 ? 2 : 0) + (a.check2 ? 1 : 0);
      const scoreB = (b.checkV ? 4 : 0) + (b.check1 ? 2 : 0) + (b.check2 ? 1 : 0);
      return scoreB - scoreA || a.nom.localeCompare(b.nom, 'fr');
    });
    lines.push(
      `Exercices de Biblimpro JAMAIS FAITS par ${targetGroup.nom} (${neverDoneSorted.length} au total, extrait prioritaire):`
    );
    for (const ex of neverDoneSorted.slice(0, 40)) {
      const desc = ex.description ? ` — ${ex.description.replace(/\s+/g, ' ').slice(0, 120)}` : '';
      lines.push(
        `- [id:${ex.id}] ${ex.nom} | Étape: ${ex.etapes.join(', ') || '—'} | Tags: ${ex.tags.join(', ') || '—'}${desc}`
      );
    }

    // Exercices pratiqués il y a longtemps (oubliés)
    const forgotten = [...targetGroup.practicedExercises]
      .sort((a, b) => a.lastDate.localeCompare(b.lastDate))
      .slice(0, 15);
    if (forgotten.length > 0) {
      lines.push(`Exercices déjà vus mais les plus anciens pour ${targetGroup.nom}:`);
      for (const rec of forgotten) {
        lines.push(
          `- [id:${rec.exerciceId}] ${rec.nom} (dernier: ${rec.lastDate || '?'}, fait ${rec.count}x, étape: ${rec.etapes.join(', ') || '—'})`
        );
      }
    }
  } else {
    lines.push('');
    lines.push('=== VUE GLOBALE DES GROUPES ===');
    for (const g of model.groups) {
      lines.push(
        `- ${g.nom}: ${g.participantIds.length} membres, ${g.sessions.length} séances, couverture ${g.coveragePct}%, dernière séance ${g.lastDate || 'aucune'}`
      );
    }
    if (model.realizedSeances.length > 0) {
      lines.push('Dernières séances tous groupes confondus:');
      for (const s of model.realizedSeances.slice(0, 6)) {
        lines.push(
          `- [${s.date || 'sans date'}] ${s.nom} (${s.groupeNames.join(', ') || 'Sans groupe'}): ${s.exerciceNames.join(', ') || 'aucun exercice'}`
        );
      }
    }
  }

  // Index compact de Biblimpro pour que l'IA connaisse les vrais exercices disponibles
  lines.push('');
  lines.push('=== INDEX BIBLIMPRO (EXERCICES EXISTANTS DANS L’APPLI) ===');
  for (const ex of model.exercises.slice(0, 150)) {
    const desc = ex.description ? ` — ${ex.description.replace(/\s+/g, ' ').slice(0, 90)}` : '';
    lines.push(
      `[id:${ex.id}] ${ex.nom} (${ex.etapes.join('/') || '—'}${ex.tags.length > 0 ? ` · ${ex.tags.join(', ')}` : ''})${desc}`
    );
  }

  return lines.join('\n');
}

interface RawSuggestionPayload {
  exercises?: Array<{
    nom?: unknown;
    etape?: unknown;
    tags?: unknown;
    description?: unknown;
    durationMin?: unknown;
    note?: unknown;
    existingExerciceId?: unknown;
  }>;
  sessions?: Array<{
    titre?: unknown;
    objectif?: unknown;
    dureeTotaleMin?: unknown;
    steps?: Array<{
      kind?: unknown;
      nom?: unknown;
      etape?: unknown;
      tags?: unknown;
      description?: unknown;
      durationMin?: unknown;
      note?: unknown;
      existingExerciceId?: unknown;
    }>;
  }>;
}

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function resolveExistingExerciseId(
  rawId: unknown,
  nom: string,
  model: ImproEcosystemModel
): string | undefined {
  if (typeof rawId === 'string' && rawId.trim()) {
    const cleaned = rawId.trim().replace(/^id:/, '');
    if (model.exerciseById.has(cleaned)) return cleaned;
  }
  const normalizedName = nom.trim().toLowerCase();
  if (!normalizedName) return undefined;
  const match = model.exercises.find((e) => e.nom.trim().toLowerCase() === normalizedName);
  return match?.id;
}

export function parseExploreResponsePayload(
  rawText: string,
  model: ImproEcosystemModel
): {
  replyMarkdown: string;
  suggestedExercises: ExploreSuggestedExercise[];
  suggestedSessions: ExploreSuggestedSession[];
} {
  const blockRegex = /```(?:impro-suggestions|json:impro-suggestions)\s*([\s\S]*?)```/i;
  const match = rawText.match(blockRegex);

  let replyMarkdown = rawText;
  let suggestedExercises: ExploreSuggestedExercise[] = [];
  let suggestedSessions: ExploreSuggestedSession[] = [];

  if (match) {
    replyMarkdown = rawText.replace(match[0], '').trim();
    const jsonCandidate = match[1].trim();
    try {
      const parsed = JSON.parse(jsonCandidate) as RawSuggestionPayload;
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.exercises)) {
          suggestedExercises = parsed.exercises
            .slice(0, 12)
            .map((item) => {
              const nom = String(item?.nom ?? '').trim().slice(0, 140);
              if (!nom) return null;
              const existingExerciceId = resolveExistingExerciseId(
                item?.existingExerciceId,
                nom,
                model
              );
              const existingEx = existingExerciceId
                ? model.exerciseById.get(existingExerciceId)
                : undefined;
              const rawTags = Array.isArray(item?.tags)
                ? item.tags.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 6)
                : [];
              return {
                id: generateId('sug_ex'),
                nom: existingEx?.nom ?? nom,
                etape:
                  String(item?.etape ?? '').trim().slice(0, 80) ||
                  existingEx?.etapes[0] ||
                  'Autre',
                tags: rawTags.length > 0 ? rawTags : existingEx?.tags ?? [],
                description:
                  String(item?.description ?? '').trim().slice(0, 800) ||
                  existingEx?.description ||
                  '',
                durationMin: clampInt(item?.durationMin, 15, 3, 120),
                note: String(item?.note ?? '').trim().slice(0, 240),
                ...(existingExerciceId ? { existingExerciceId } : {}),
              } satisfies ExploreSuggestedExercise;
            })
            .filter((x): x is ExploreSuggestedExercise => Boolean(x));
        }

        if (Array.isArray(parsed.sessions)) {
          suggestedSessions = parsed.sessions
            .slice(0, 4)
            .map((sess) => {
              const titre = String(sess?.titre ?? '').trim().slice(0, 140);
              if (!titre) return null;
              const rawSteps = Array.isArray(sess?.steps) ? sess.steps : [];
              const steps: ExploreSuggestedSessionStep[] = rawSteps
                .slice(0, 24)
                .map((st) => {
                  const nom = String(st?.nom ?? '').trim().slice(0, 140);
                  if (!nom) return null;
                  const kind: 'exercise' | 'custom' =
                    st?.kind === 'custom' ? 'custom' : 'exercise';
                  const existingExerciceId =
                    kind === 'exercise'
                      ? resolveExistingExerciseId(st?.existingExerciceId, nom, model)
                      : undefined;
                  const existingEx = existingExerciceId
                    ? model.exerciseById.get(existingExerciceId)
                    : undefined;
                  const rawTags = Array.isArray(st?.tags)
                    ? st.tags.map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 6)
                    : [];
                  return {
                    kind,
                    nom: existingEx?.nom ?? nom,
                    ...(st?.etape || existingEx?.etapes[0]
                      ? {
                          etape:
                            String(st?.etape ?? '').trim().slice(0, 80) ||
                            existingEx?.etapes[0] ||
                            '',
                        }
                      : {}),
                    ...(rawTags.length > 0
                      ? { tags: rawTags }
                      : existingEx?.tags?.length
                        ? { tags: existingEx.tags }
                        : {}),
                    ...(st?.description || existingEx?.description
                      ? {
                          description:
                            String(st?.description ?? '').trim().slice(0, 600) ||
                            existingEx?.description ||
                            '',
                        }
                      : {}),
                    durationMin: clampInt(st?.durationMin, 15, 2, 180),
                    note: String(st?.note ?? '').trim().slice(0, 240),
                    ...(existingExerciceId ? { existingExerciceId } : {}),
                  } satisfies ExploreSuggestedSessionStep;
                })
                .filter((s): s is ExploreSuggestedSessionStep => Boolean(s));

              if (steps.length === 0) return null;
              const computedDuration = steps.reduce((sum, s) => sum + s.durationMin, 0);
              return {
                id: generateId('sug_sea'),
                titre,
                objectif: String(sess?.objectif ?? '').trim().slice(0, 300),
                dureeTotaleMin: clampInt(
                  sess?.dureeTotaleMin,
                  computedDuration || 90,
                  5,
                  360
                ),
                steps,
              } satisfies ExploreSuggestedSession;
            })
            .filter((x): x is ExploreSuggestedSession => Boolean(x));
        }
      }
    } catch {
      // Si le bloc JSON est partiellement mal formé, on conserve tout de même la réponse texte
      replyMarkdown = rawText.trim();
    }
  }

  return {
    replyMarkdown: replyMarkdown.trim(),
    suggestedExercises,
    suggestedSessions,
  };
}
