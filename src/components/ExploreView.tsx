import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  ExternalLink,
  Globe,
  History,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  ExploreMessage,
  ExploreModelId,
  ExploreSuggestedExercise,
  ExploreSuggestedSession,
  ExploreThread,
  ExploreTier,
} from '../types/workspace';
import {
  buildImproAdvisorContext,
  EXPLORE_MODELS,
  EXPLORE_TIERS,
  parseExploreResponsePayload,
} from '../utils/exploreAdvisor';
import { generateId } from '../utils/id';
import { IMPRO_DB_IDS } from '../utils/improCsvLoader';

const QUICK_THEMES = [
  'Écoute & silence',
  'Construction narrative',
  'Énergie & jeu physique',
  'Personnages & statuts',
  'Inédits jamais joués',
];

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return tokens.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-950 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.85em] text-slate-800 dark:text-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

function MarkdownProse({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4
          key={`h3_${i}`}
          className="font-display text-sm font-semibold text-slate-950 dark:text-white pt-2"
        >
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3
          key={`h2_${i}`}
          className="font-display text-base font-semibold text-slate-950 dark:text-white pt-3"
        >
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      nodes.push(
        <h2
          key={`h1_${i}`}
          className="font-display text-lg font-bold text-slate-950 dark:text-white pt-3"
        >
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      nodes.push(
        <blockquote
          key={`bq_${i}`}
          className="px-3.5 py-2 rounded-lg bg-stone-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300"
        >
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul_${i}`} className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      nodes.push(
        <ol key={`ol_${i}`} className="list-decimal pl-5 space-y-1 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      nodes.push(<hr key={`hr_${i}`} className="border-slate-200 dark:border-slate-800 my-2" />);
      i++;
      continue;
    }

    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('> ') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    nodes.push(
      <p key={`p_${i}`} className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        {renderInlineMarkdown(paraLines.join(' '))}
      </p>
    );
  }

  return <div className="space-y-2.5">{nodes}</div>;
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function stripStreamingSuggestionsBlock(raw: string): string {
  const markerIdx = raw.search(/```(?:impro-suggestions|json:impro-suggestions)?\s*$/i);
  const fullBlockIdx = raw.search(/```(?:impro-suggestions|json:impro-suggestions)/i);
  if (fullBlockIdx !== -1) {
    return raw.slice(0, fullBlockIdx).trimEnd();
  }
  if (markerIdx !== -1) {
    return raw.slice(0, markerIdx).trimEnd();
  }
  return raw;
}

export function ExploreView() {
  const {
    user,
    improModel,
    improLoading,
    exploreThreads,
    activeExploreThreadId,
    createExploreThread,
    selectExploreThread,
    updateExploreThread,
    deleteExploreThread,
    addSuggestedExerciseToBiblimpro,
    addExerciseToPlannedSeance,
    createSessionInPrepareFromExplore,
    navigateToPrepare,
    openImproDetail,
    setMainView,
    viewSettings,
    updateExploreViewSettings,
  } = useWorkspace();

  const activeThread = useMemo<ExploreThread | null>(
    () => exploreThreads.find((t) => t.id === activeExploreThreadId) ?? exploreThreads[0] ?? null,
    [exploreThreads, activeExploreThreadId]
  );

  const {
    draftGroupId,
    draftThematique,
    draftModelId,
    draftTier,
    draftUseWebSearch,
    historyDrawerOpen,
  } = viewSettings.explore;
  const setHistoryDrawerOpen = (open: boolean) =>
    updateExploreViewSettings({ historyDrawerOpen: open });

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [targetSeanceByExKey, setTargetSeanceByExKey] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFailedPromptRef = useRef<string | null>(null);

  const groupId = activeThread ? activeThread.groupId : draftGroupId;
  const thematique = activeThread ? activeThread.thematique : draftThematique;
  const modelId = activeThread ? activeThread.modelId : draftModelId;
  const tier = activeThread ? activeThread.tier : draftTier;
  const useWebSearch = activeThread ? activeThread.useWebSearch : draftUseWebSearch;

  const selectedGroup = useMemo(
    () => (groupId ? improModel.groupById.get(groupId) : undefined),
    [groupId, improModel.groupById]
  );

  const groupDiagnostic = useMemo(() => {
    if (!improModel.ready) return null;
    if (selectedGroup) {
      const etapeCounts = new Map<string, number>();
      for (const et of improModel.allEtapes) etapeCounts.set(et, 0);
      for (const rec of selectedGroup.practicedExercises) {
        for (const et of rec.etapes) {
          etapeCounts.set(et, (etapeCounts.get(et) ?? 0) + rec.count);
        }
      }
      const leastPracticedEtapes = Array.from(etapeCounts.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([et, count]) => `${et} (${count})`);
      return {
        label: selectedGroup.nom,
        membersCount: selectedGroup.participantIds.length,
        sessionsCount: selectedGroup.sessions.length,
        plannedCount: selectedGroup.plannedSessions.length,
        coveragePct: selectedGroup.coveragePct,
        neverDoneCount: selectedGroup.neverDoneExercises.length,
        lastDate: selectedGroup.lastDate,
        leastPracticedEtapes,
      };
    }
    return {
      label: 'Tous les groupes',
      membersCount: improModel.participants.length,
      sessionsCount: improModel.realizedSeances.length,
      plannedCount: improModel.plannedSeances.length,
      coveragePct:
        improModel.exercises.length > 0
          ? Math.round(
              (improModel.exercises.filter((e) => e.usageCount > 0).length /
                improModel.exercises.length) *
                100
            )
          : 0,
      neverDoneCount: improModel.exercises.filter((e) => e.usageCount === 0).length,
      lastDate: improModel.realizedSeances[0]?.date ?? '',
      leastPracticedEtapes: improModel.allEtapes.slice(0, 3),
    };
  }, [improModel, selectedGroup]);

  const starterPrompts = useMemo(() => {
    const grpLabel = selectedGroup ? `le groupe ${selectedGroup.nom}` : 'mon prochain atelier';
    const themePart = thematique.trim() ? ` sur la thématique « ${thematique.trim()} »` : '';
    return [
      useWebSearch
        ? `Propose-moi une séance complète de 90 minutes pour ${grpLabel}${themePart}, en privilégiant des exercices jamais faits et 1 ou 2 idées originales trouvées sur le web.`
        : `Propose-moi une séance complète de 90 minutes pour ${grpLabel}${themePart}, en privilégiant des exercices jamais faits de Biblimpro et 1 ou 2 variantes originales.`,
      `Quelles lacunes ou étapes peu pratiquées vois-tu dans l'historique de ${grpLabel}, et quels 4 exercices précis recommandes-tu pour la prochaine séance ?`,
      useWebSearch
        ? `Trouve sur le web 3 nouveaux exercices d'improvisation originaux${themePart} adaptés à ${selectedGroup ? `${selectedGroup.participantIds.length} personnes` : 'un groupe de 10-12 personnes'} que je pourrai ajouter à Biblimpro.`
        : `Invente 3 nouveaux exercices d'improvisation originaux${themePart} adaptés à ${selectedGroup ? `${selectedGroup.participantIds.length} personnes` : 'un groupe de 10-12 personnes'} que je pourrai ajouter à Biblimpro.`,
      `Construis un échauffement dynamique de 25 minutes en 3 étapes pour ${grpLabel}${themePart}.`,
    ];
  }, [selectedGroup, thematique, useWebSearch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeThread?.messages.length, isGenerating, streamingText]);

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!actionToast) return;
    const timer = window.setTimeout(() => setActionToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [actionToast]);

  const patchConfig = (
    patch: Partial<{
      groupId: string;
      thematique: string;
      modelId: ExploreModelId;
      tier: ExploreTier;
      useWebSearch: boolean;
    }>
  ) => {
    updateExploreViewSettings((prev) => ({
      ...prev,
      ...(patch.groupId !== undefined ? { draftGroupId: patch.groupId } : {}),
      ...(patch.thematique !== undefined ? { draftThematique: patch.thematique } : {}),
      ...(patch.modelId !== undefined ? { draftModelId: patch.modelId } : {}),
      ...(patch.tier !== undefined ? { draftTier: patch.tier } : {}),
      ...(patch.useWebSearch !== undefined ? { draftUseWebSearch: patch.useWebSearch } : {}),
    }));
    if (activeThread) {
      void updateExploreThread(activeThread.id, patch);
    }
  };

  const handleNewThread = async () => {
    setRequestError(null);
    await createExploreThread({
      title: selectedGroup ? `Exploration · ${selectedGroup.nom}` : 'Nouvelle exploration',
      groupId,
      thematique,
      modelId,
      tier,
      useWebSearch,
    });
  };

  const sendPrompt = async (
    rawText: string,
    options?: { overrideUseWebSearch?: boolean }
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || isGenerating) return;

    setRequestError(null);
    lastFailedPromptRef.current = null;
    setPromptInput('');
    setStreamingText('');
    setStreamStatus('');

    const effectiveWebSearch =
      options?.overrideUseWebSearch !== undefined ? options.overrideUseWebSearch : useWebSearch;

    let targetThread = activeThread;
    if (!targetThread) {
      const autoTitle = selectedGroup
        ? `${selectedGroup.nom} · ${trimmed.slice(0, 48)}`
        : trimmed.slice(0, 60);
      targetThread = await createExploreThread({
        title: autoTitle,
        groupId: draftGroupId,
        thematique: draftThematique,
        modelId: draftModelId,
        tier: draftTier,
        useWebSearch: effectiveWebSearch,
      });
    } else if (
      options?.overrideUseWebSearch !== undefined &&
      targetThread.useWebSearch !== options.overrideUseWebSearch
    ) {
      updateExploreViewSettings({ draftUseWebSearch: options.overrideUseWebSearch });
      await updateExploreThread(targetThread.id, { useWebSearch: options.overrideUseWebSearch });
      targetThread = { ...targetThread, useWebSearch: options.overrideUseWebSearch };
    }

    const lastMsg = targetThread.messages[targetThread.messages.length - 1];
    const alreadyPendingUserMsg =
      lastMsg?.role === 'user' && lastMsg.content.trim() === trimmed;

    const nextMessages = alreadyPendingUserMsg
      ? targetThread.messages
      : [
          ...targetThread.messages,
          {
            id: generateId('msg'),
            role: 'user' as const,
            content: trimmed,
            createdAt: new Date().toISOString(),
          },
        ];

    if (!alreadyPendingUserMsg) {
      const nextTitle =
        targetThread.messages.length === 0
          ? (selectedGroup ? `${selectedGroup.nom} · ${trimmed}` : trimmed).slice(0, 120)
          : targetThread.title;

      await updateExploreThread(targetThread.id, {
        title: nextTitle,
        messages: nextMessages,
      });
    }

    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const contextSummary = buildImproAdvisorContext(
        improModel,
        targetThread.groupId || undefined,
        targetThread.thematique || undefined
      );

      const response = await fetch('/api/explore/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          modelId: targetThread.modelId,
          tier: targetThread.tier,
          useWebSearch: effectiveWebSearch,
          contextSummary,
          groupName: selectedGroup?.nom,
          thematique: targetThread.thematique,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `Erreur serveur (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const sseState: {
        donePayload: {
          text?: string;
          webSources?: Array<{ title: string; url: string }>;
        } | null;
        streamErrMessage: string | null;
        liveAccumulated: string;
      } = {
        donePayload: null,
        streamErrMessage: null,
        liveAccumulated: '',
      };

      const processEventBlock = (block: string) => {
        const lines = block.split('\n');
        let eventName = 'message';
        const dataLines: string[] = [];

        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (!line || line.startsWith(':')) continue;
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) return;
        const jsonStr = dataLines.join('\n');
        let parsedData: Record<string, unknown>;
        try {
          parsedData = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          return;
        }

        if (eventName === 'status' && typeof parsedData.message === 'string') {
          setStreamStatus(parsedData.message);
        } else if (eventName === 'chunk' && typeof parsedData.delta === 'string') {
          sseState.liveAccumulated += parsedData.delta;
          setStreamingText(stripStreamingSuggestionsBlock(sseState.liveAccumulated));
        } else if (eventName === 'done') {
          sseState.donePayload = {
            text:
              typeof parsedData.text === 'string'
                ? parsedData.text
                : sseState.liveAccumulated,
            webSources: Array.isArray(parsedData.webSources)
              ? (parsedData.webSources as Array<{ title: string; url: string }>)
              : undefined,
          };
        } else if (eventName === 'error') {
          sseState.streamErrMessage =
            typeof parsedData.error === 'string'
              ? parsedData.error
              : 'Erreur lors de la génération.';
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? '';
        for (const block of parts) {
          processEventBlock(block);
        }
      }
      if (buffer.trim()) {
        processEventBlock(buffer);
      }

      if (sseState.streamErrMessage) {
        throw new Error(sseState.streamErrMessage);
      }

      const finalRawText = String(
        sseState.donePayload?.text ?? sseState.liveAccumulated
      ).trim();
      if (!finalRawText) {
        throw new Error('Réponse vide reçue du modèle.');
      }

      const parsed = parseExploreResponsePayload(finalRawText, improModel);
      const assistantMsg: ExploreMessage = {
        id: generateId('msg'),
        role: 'assistant',
        content: parsed.replyMarkdown || finalRawText,
        createdAt: new Date().toISOString(),
        modelId: targetThread.modelId,
        tier: targetThread.tier,
        useWebSearch: effectiveWebSearch,
        ...(sseState.donePayload?.webSources && sseState.donePayload.webSources.length > 0
          ? { webSources: sseState.donePayload.webSources }
          : {}),
        ...(parsed.suggestedExercises.length > 0
          ? { suggestedExercises: parsed.suggestedExercises }
          : {}),
        ...(parsed.suggestedSessions.length > 0
          ? { suggestedSessions: parsed.suggestedSessions }
          : {}),
      };

      await updateExploreThread(targetThread.id, {
        messages: [...nextMessages, assistantMsg],
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setRequestError('Génération annulée.');
        lastFailedPromptRef.current = trimmed;
      } else {
        const msg = err instanceof Error ? err.message : 'Erreur inattendue.';
        setRequestError(msg);
        lastFailedPromptRef.current = trimmed;
      }
    } finally {
      abortRef.current = null;
      setStreamingText('');
      setStreamStatus('');
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt(promptInput);
    }
  };

  const handleAddExerciseToBiblimpro = async (
    ex: ExploreSuggestedExercise,
    threadId: string,
    messageId: string
  ) => {
    const newId = await addSuggestedExerciseToBiblimpro(ex, { threadId, messageId });
    if (newId) {
      setActionToast(`« ${ex.nom} » ajouté à Biblimpro`);
    }
  };

  const handleAddExerciseToPrepare = async (
    ex: ExploreSuggestedExercise,
    threadId: string,
    messageId: string
  ) => {
    const key = `${messageId}::${ex.id}`;
    const targetSeanceId = targetSeanceByExKey[key] ?? 'new_draft';

    let resolvedExId = ex.existingExerciceId || ex.addedToBiblimproId;
    if (!resolvedExId) {
      resolvedExId = await addSuggestedExerciseToBiblimpro(ex, { threadId, messageId });
    }
    if (!resolvedExId) return;

    if (targetSeanceId !== 'new_draft') {
      addExerciseToPlannedSeance(resolvedExId, targetSeanceId, {
        durationMin: ex.durationMin,
        note: ex.note,
      });
      const targetName = improModel.seanceById.get(targetSeanceId)?.nom ?? 'Séance préparée';
      setActionToast(`« ${ex.nom} » ajouté à « ${targetName} »`);
      return;
    }

    navigateToPrepare({
      groupId: groupId || undefined,
      addExerciseIds: [resolvedExId],
    });
  };

  const handleCreateSessionInPrepare = async (
    sess: ExploreSuggestedSession,
    threadId: string,
    messageId: string
  ) => {
    await createSessionInPrepareFromExplore(sess, groupId, { threadId, messageId });
  };

  const modelSpec = EXPLORE_MODELS[modelId];

  if (improLoading && !improModel.ready) {
    return (
      <div className="w-full px-6 py-10 space-y-4">
        <div className="h-8 w-56 rounded-lg bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
        <div className="h-80 w-full rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row bg-stone-50 dark:bg-[#090D16]">
      {/* Colonne historique des fils Explore */}
      <aside
        className={`${
          historyDrawerOpen ? 'flex' : 'hidden'
        } w-full lg:w-64 shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B0F19] max-h-60 lg:max-h-none`}
      >
        <div className="px-3.5 py-3 border-b border-slate-200 dark:border-slate-800/90 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <History className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
              Discussions ({exploreThreads.length})
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleNewThread()}
              title="Nouvelle exploration"
              className="h-7 px-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Nouveau</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryDrawerOpen(false)}
              aria-label="Masquer l'historique"
              className="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {exploreThreads.length === 0 ? (
            <p className="px-2.5 py-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Posez votre première question pour démarrer un fil de conseil{user ? ' synchronisé dans le cloud' : ' enregistré localement'}.
            </p>
          ) : (
            exploreThreads.map((thread) => {
              const isActive = activeThread?.id === thread.id;
              const grpName = thread.groupId
                ? improModel.groupById.get(thread.groupId)?.nom
                : undefined;
              const spec = EXPLORE_MODELS[thread.modelId] ?? EXPLORE_MODELS['gemini-4-hydrogen'];
              return (
                <div
                  key={thread.id}
                  className={`group flex items-start gap-1.5 rounded-lg p-2 transition-colors ${
                    isActive
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/45 text-indigo-950 dark:text-indigo-100'
                      : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectExploreThread(thread.id)}
                    className="flex-1 min-w-0 text-left space-y-0.5"
                  >
                    <p className="text-xs font-medium truncate">{thread.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {[grpName || 'Libre', spec.shortLabel, EXPLORE_MODELS[thread.modelId]?.tiers[thread.tier]?.label ?? thread.tier]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteExploreThread(thread.id)}
                    aria-label={`Supprimer ${thread.title}`}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 shrink-0 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Espace principal Explore */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Barre de cadrage : Groupe, Thématique, Modèle & Niveau */}
        <section
          aria-label="Paramètres du conseiller IA"
          className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0D1320] space-y-3 shrink-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {!historyDrawerOpen && (
                <button
                  type="button"
                  onClick={() => setHistoryDrawerOpen(true)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historique ({exploreThreads.length})</span>
                </button>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-base sm:text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">Explore — Conseiller d’atelier</span>
                </h1>
              </div>
            </div>

            {/* Sélecteurs Modèle + Mode + Web */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Modèle Gemini gratuit"
                className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
              >
                {(['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as ExploreModelId[]).map((mid) => {
                  const active = modelId === mid;
                  return (
                    <button
                      key={mid}
                      type="button"
                      onClick={() => patchConfig({ modelId: mid })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {EXPLORE_MODELS[mid].shortLabel}
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label="Niveau de réflexion"
                className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800"
              >
                {EXPLORE_TIERS.map((t) => {
                  const active = tier === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => patchConfig({ tier: t })}
                      title={modelSpec.tiers[t].description}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {modelSpec.tiers[t].label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => patchConfig({ useWebSearch: !useWebSearch })}
                aria-pressed={useWebSearch}
                className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  useWebSearch
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>{useWebSearch ? 'Web actif' : 'Appli seule'}</span>
              </button>
            </div>
          </div>

          {/* Cadrage Groupe & Thématique */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <div className="md:col-span-4">
              <label htmlFor="explore-group-select" className="sr-only">
                Groupe ciblé
              </label>
              <select
                id="explore-group-select"
                value={groupId}
                onChange={(e) => patchConfig({ groupId: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              >
                <option value="">Exploration libre (tous les groupes)</option>
                {improModel.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nom} ({g.participantIds.length} membres · {g.sessions.length} séances)
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-8">
              <label htmlFor="explore-theme-input" className="sr-only">
                Thématique ou objectif de séance
              </label>
              <input
                id="explore-theme-input"
                type="text"
                value={thematique}
                onChange={(e) => patchConfig({ thematique: e.target.value })}
                placeholder="Thématique ou objectif (ex : écoute, jeu physique, construction, émotions…)"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Métadonnées contextuelles sobres + amorces de thématiques */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            {groupDiagnostic ? (
              <p className="truncate">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {groupDiagnostic.label}
                </span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{groupDiagnostic.membersCount}</span> membres
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{groupDiagnostic.sessionsCount}</span> séances
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{groupDiagnostic.coveragePct}%</span> du catalogue
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums">{groupDiagnostic.neverDoneCount}</span> exercices inédits
              </p>
            ) : (
              <span>Catalogue en cours de chargement…</span>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {QUICK_THEMES.map((qt) => {
                const active = thematique.trim().toLowerCase() === qt.toLowerCase();
                return (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => patchConfig({ thematique: active ? '' : qt })}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    {qt}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Zone de conversation */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {(!activeThread || activeThread.messages.length === 0) && (
              <div className="space-y-6 py-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] p-5 space-y-3">
                  <div className="space-y-1">
                    <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      Préparer une séance avec votre contexte réel
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      Le conseiller analyse les exercices déjà vus par le groupe, les étapes sous-pratiquées et vos notes de séances. Il complète si besoin avec le web et génère des suggestions à ajouter directement dans <strong>Biblimpro</strong> ou <strong>Préparer</strong>.
                    </p>
                  </div>

                  {groupDiagnostic && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Modèle actif
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {modelSpec.label} · {modelSpec.tiers[tier].label}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Dernière séance
                        </span>
                        <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {groupDiagnostic.lastDate || 'Aucune enregistrée'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Étapes les moins vues
                        </span>
                        <span className="text-slate-900 dark:text-slate-100">
                          {groupDiagnostic.leastPracticedEtapes.join(', ') || '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Suggestions de démarrage
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {starterPrompts.map((sp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => void sendPrompt(sp)}
                        className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors space-y-1.5 group disabled:opacity-50"
                      >
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed line-clamp-3">
                          {sp}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                          <span>Lancer</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeThread?.messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl bg-indigo-600 text-white px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              const msgModelLabel =
                EXPLORE_MODELS[msg.modelId ?? 'gemini-4-hydrogen']?.shortLabel ?? 'Hydrogen';
              const msgTierLabel =
                EXPLORE_MODELS[msg.modelId ?? 'gemini-4-hydrogen']?.tiers[msg.tier ?? 'plan']
                  ?.label ?? 'Plan';

              return (
                <article
                  key={msg.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] p-5 space-y-4"
                >
                  <MarkdownProse content={msg.content} />

                  {/* Sources web (Google Search Grounding) */}
                  {msg.webSources && msg.webSources.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Sources web consultées
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {msg.webSources.map((src, idx) => (
                          <a
                            key={`${src.url}_${idx}`}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline max-w-xs truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{src.title || src.url}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Séances complètes actionnables */}
                  {msg.suggestedSessions && msg.suggestedSessions.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Séances proposées ({msg.suggestedSessions.length})
                      </p>
                      <div className="space-y-3">
                        {msg.suggestedSessions.map((sess) => (
                          <div
                            key={sess.id}
                            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/60 p-3.5 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 space-y-0.5">
                                <h4 className="font-display text-sm font-semibold text-slate-950 dark:text-white">
                                  {sess.titre}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  <span className="font-mono tabular-nums">
                                    {sess.dureeTotaleMin} min
                                  </span>
                                  <span aria-hidden="true"> · </span>
                                  <span className="font-mono tabular-nums">
                                    {sess.steps.length}
                                  </span>{' '}
                                  étapes
                                  {sess.objectif ? ` · ${sess.objectif}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleCreateSessionInPrepare(sess, activeThread.id, msg.id)
                                }
                                className="h-8 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                              >
                                <ListChecks className="w-3.5 h-3.5" />
                                <span>
                                  {sess.createdSeanceId
                                    ? 'Ouvrir à nouveau dans Préparer'
                                    : 'Créer dans Préparer'}
                                </span>
                              </button>
                            </div>

                            <ol className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                              {sess.steps.map((st, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-baseline justify-between gap-3 py-0.5 border-b border-slate-200/50 dark:border-slate-800/60 last:border-b-0"
                                >
                                  <span className="min-w-0 truncate">
                                    <span className="font-mono tabular-nums text-slate-400 mr-1.5">
                                      {idx + 1}.
                                    </span>
                                    <span className="font-medium text-slate-900 dark:text-slate-100">
                                      {st.nom}
                                    </span>
                                    {st.kind === 'exercise' && !st.existingExerciceId && (
                                      <span className="text-slate-400"> · nouveau</span>
                                    )}
                                    {st.note && (
                                      <span className="text-slate-500 dark:text-slate-400">
                                        {' '}
                                        — {st.note}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                                    {st.durationMin} min
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Exercices individuels actionnables */}
                  {msg.suggestedExercises && msg.suggestedExercises.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Exercices à ajouter individuellement ({msg.suggestedExercises.length})
                      </p>
                      <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-800 bg-stone-50/50 dark:bg-slate-900/40">
                        {msg.suggestedExercises.map((ex) => {
                          const resolvedId = ex.existingExerciceId || ex.addedToBiblimproId;
                          const inBiblimpro = Boolean(resolvedId);
                          const selectKey = `${msg.id}::${ex.id}`;
                          const targetVal = targetSeanceByExKey[selectKey] ?? 'new_draft';

                          return (
                            <div key={ex.id} className="p-3 space-y-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 space-y-0.5">
                                  <p className="text-sm font-semibold text-slate-950 dark:text-white">
                                    {ex.nom}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {[
                                      ex.etape || 'Exercice',
                                      ex.tags.join(', '),
                                      `${ex.durationMin} min`,
                                      ex.existingExerciceId
                                        ? 'Déjà dans Biblimpro'
                                        : ex.addedToBiblimproId
                                          ? 'Ajouté à Biblimpro'
                                          : 'Nouveau pour Biblimpro',
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  {inBiblimpro ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        resolvedId &&
                                        openImproDetail(IMPRO_DB_IDS.exercices, resolvedId)
                                      }
                                      className="h-7 px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Biblimpro</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleAddExerciseToBiblimpro(
                                          ex,
                                          activeThread.id,
                                          msg.id
                                        )
                                      }
                                      className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-600 text-xs font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
                                    >
                                      <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      <span>+ Biblimpro</span>
                                    </button>
                                  )}

                                  {improModel.plannedSeances.length > 0 && (
                                    <select
                                      aria-label={`Destination Préparer pour ${ex.nom}`}
                                      value={targetVal}
                                      onChange={(e) =>
                                        setTargetSeanceByExKey((prev) => ({
                                          ...prev,
                                          [selectKey]: e.target.value,
                                        }))
                                      }
                                      className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] text-slate-700 dark:text-slate-300 max-w-[165px] truncate"
                                    >
                                      <option value="new_draft">Nouveau brouillon</option>
                                      {improModel.plannedSeances.map((ps) => (
                                        <option key={ps.id} value={ps.id}>
                                          {ps.nom}
                                        </option>
                                      ))}
                                    </select>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAddExerciseToPrepare(ex, activeThread.id, msg.id)
                                    }
                                    className="h-7 px-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Préparer</span>
                                  </button>
                                </div>
                              </div>

                              {ex.description && (
                                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                  {ex.description}
                                </p>
                              )}
                              {ex.note && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Conseil animateur : {ex.note}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pied de message discret */}
                  <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {msgModelLabel} · {msgTierLabel} ·{' '}
                      {msg.useWebSearch ? 'Avec web' : 'Base interne'}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                </article>
              );
            })}

            {isGenerating && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 min-w-0">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="truncate">
                      {streamStatus ||
                        `Analyse avec ${modelSpec.shortLabel} (${modelSpec.tiers[tier].label}${useWebSearch ? ' + recherche web' : ''})…`}
                    </span>
                    {elapsedSeconds > 0 && (
                      <span className="font-mono tabular-nums text-xs text-slate-400 shrink-0">
                        {elapsedSeconds}s
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Arrêter
                  </button>
                </div>

                {streamingText && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                    <MarkdownProse content={streamingText} />
                  </div>
                )}
              </div>
            )}

            {requestError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300"
              >
                <span className="flex-1 min-w-[220px] leading-relaxed">{requestError}</span>
                {lastFailedPromptRef.current && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {useWebSearch && (
                      <button
                        type="button"
                        onClick={() =>
                          void sendPrompt(lastFailedPromptRef.current!, {
                            overrideUseWebSearch: false,
                          })
                        }
                        className="h-7 px-2.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 font-medium whitespace-nowrap"
                      >
                        Réessayer sans web
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void sendPrompt(lastFailedPromptRef.current!)}
                      className="h-7 px-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium flex items-center gap-1 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Réessayer</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Toast confirmation action unitaire */}
        {actionToast && (
          <div className="px-4 sm:px-6 pb-2 shrink-0">
            <div className="max-w-3xl mx-auto rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200">
              <span className="flex items-center gap-2 font-medium">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{actionToast}</span>
              </span>
              <button
                type="button"
                onClick={() => setMainView('prepare')}
                className="font-semibold underline underline-offset-2 whitespace-nowrap"
              >
                Aller à Préparer
              </button>
            </div>
          </div>
        )}

        {/* Zone de saisie */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0B0F19] shrink-0">
          <div className="max-w-3xl mx-auto flex items-end gap-2.5">
            <textarea
              rows={2}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder={
                selectedGroup
                  ? `Demander une séance ou un exercice pour ${selectedGroup.nom}…`
                  : 'Décrivez votre besoin (groupe, durée, thème, exercices à éviter…)…'
              }
              className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={!promptInput.trim() || isGenerating}
              onClick={() => void sendPrompt(promptInput)}
              aria-label="Envoyer au conseiller IA"
              className="h-10 px-4 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-45 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Envoyer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
