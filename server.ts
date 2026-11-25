import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  NotionApiError,
  fetchFullNotionExercisePage,
  fetchSingleNotionExerciseByIdOrTitle,
  queryAllDatabasePages,
  resolveBiblimproDatabase,
  resolveNotionMediaUrl,
} from './server/notionClient';
import {
  DEFAULT_BIBLIMPRO_NOTION_DB_ID,
  compactNotionUuid,
  extractBiblimproPropertiesFromNotionPage,
  formatNotionUuid,
  normalizeExerciseMatchKey,
} from './src/utils/notionApiSync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ExploreModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
type ExploreTier = 'standard' | 'plan' | 'max';

interface AdviseMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

interface AdviseRequestBody {
  messages?: AdviseMessageInput[];
  modelId?: ExploreModelId;
  tier?: ExploreTier;
  useWebSearch?: boolean;
  contextSummary?: string;
  groupName?: string;
  thematique?: string;
}

const VALID_MODELS = new Set<ExploreModelId>(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const VALID_TIERS = new Set<ExploreTier>(['standard', 'plan', 'max']);

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [2500, 5000, 9000, 14000];
const GEMINI_REQUEST_TIMEOUT_MS = 300_000; // 5 minutes par tentative pour laisser le temps à Plan/Max + Web

function resolveThinkingLevel(modelId: ExploreModelId, tier: ExploreTier): ThinkingLevel {
  if (modelId === 'gemini-4-hydrogen') {
    if (tier === 'standard') return ThinkingLevel.LOW;
    if (tier === 'plan') return ThinkingLevel.HIGH;
    return ThinkingLevel.XHIGH;
  }
  // gemini-3.1-flash-lite ne supporte pas XHIGH : on mappe sur MINIMAL / MEDIUM / HIGH
  if (tier === 'standard') return ThinkingLevel.MINIMAL;
  if (tier === 'plan') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.HIGH;
}

function buildSystemInstruction(
  tier: ExploreTier,
  useWebSearch: boolean,
  contextSummary: string,
  groupName?: string,
  thematique?: string
): string {
  const depthGuidance =
    tier === 'standard'
      ? "Mode STANDARD : réponds de façon concise, directe et immédiatement actionnable sur le terrain."
      : tier === 'plan'
        ? "Mode PLAN : structure une progression pédagogique complète (échauffement, cœur d'atelier, mise en jeu/bilan), en justifiant l'ordre et les transitions."
        : "Mode MAX : analyse en profondeur l'historique du groupe, identifie les déséquilibres d'étapes et les exercices jamais vus, croise avec des variantes avancées (et des ressources web si activées) et propose un plan détaillé ou des alternatives ciblées.";

  const webGuidance = useWebSearch
    ? "La recherche Google Search est ACTIVÉE : utilise-la pour enrichir tes propositions avec des exercices, formats ou concepts d'improvisation théâtrale issus du web (mentionne les variantes utiles quand c'est pertinent)."
    : "La recherche web est désactivée : appuie-toi exclusivement sur le catalogue Biblimpro fourni, l'historique du groupe et ta connaissance pédagogique de l'improvisation.";

  return [
    "Tu es un conseiller pédagogique expert en improvisation théâtrale intégré à l'application FlowNote.",
    "Ta mission : aider l'animateur à concevoir des séances sur mesure en combinant les données réelles de son atelier (Biblimpro, séances passées, groupe, participants) et, si activé, des recherches web.",
    depthGuidance,
    webGuidance,
    groupName
      ? `Groupe ciblé actuellement : ${groupName}.`
      : 'Aucun groupe imposé (exploration libre ou multi-groupes).',
    thematique ? `Thématique / objectif prioritaire : ${thematique}.` : '',
    '',
    'RÈGLES DE RÉPONSE :',
    '1. Réponds en français naturel, clair et structuré en Markdown (sans jargon technique ni blabla inutile).',
    '2. Lorsque tu recommandes un exercice déjà présent dans Biblimpro, reprends son nom exact et son `existingExerciceId` (l’identifiant entre `[id:...]` dans le contexte).',
    '3. Tu peux aussi proposer de NOUVEAUX exercices inspirés du web ou de ta pédagogie : décris clairement les consignes, l’étape (ex: Échauffement, Écoute, Construction, Jeu, Bilan) et les tags.',
    '4. À la toute fin de ta réponse, lorsque tu proposes au moins un exercice ou une séance concrète, ajoute STRICTEMENT un bloc JSON délimité par ```impro-suggestions et ``` avec ce format exact :',
    '```impro-suggestions',
    '{',
    '  "exercises": [',
    '    {',
    '      "nom": "Nom de l’exercice",',
    '      "etape": "Échauffement",',
    '      "tags": ["Écoute", "Rythme"],',
    '      "description": "Consignes claires en 2 à 4 phrases.",',
    '      "durationMin": 15,',
    '      "note": "Point de vigilance pour l’animateur",',
    '      "existingExerciceId": "id_existant_si_dans_biblimpro_sinon_omettre"',
    '    }',
    '  ],',
    '  "sessions": [',
    '    {',
    '      "titre": "Titre court de la séance",',
    '      "objectif": "Fil conducteur pédagogique de la séance",',
    '      "dureeTotaleMin": 90,',
    '      "steps": [',
    '        { "kind": "custom", "nom": "Accueil & météo du groupe", "durationMin": 10, "note": "Tour de parole rapide" },',
    '        { "kind": "exercise", "nom": "Nom exact", "etape": "Échauffement", "tags": ["Écoute"], "description": "Consigne", "durationMin": 15, "note": "Relance", "existingExerciceId": "id_si_existant" }',
    '      ]',
    '    }',
    '  ]',
    '}',
    '```',
    'Si ta réponse est uniquement théorique ou une clarification sans exercice/séance concret, tu peux omettre le bloc ```impro-suggestions.',
    '',
    '=== DONNÉES ACTUELLES DE L’ATELIER ===',
    contextSummary.slice(0, 28000),
  ]
    .filter(Boolean)
    .join('\n');
}

interface ParsedGeminiError {
  code?: number;
  statusText?: string;
  detail: string;
  retryDelayMs?: number;
  quotaMetrics: string[];
  isHardQuotaZero: boolean;
}

function parseGeminiErrorDetails(err: unknown): ParsedGeminiError {
  const errObj = err as { status?: number; code?: number; message?: string } | null;
  const raw = err instanceof Error ? err.message : String(err);

  let code = typeof errObj?.status === 'number' ? errObj.status : undefined;
  let statusText: string | undefined;
  let detail = raw;
  let retryDelayMs: number | undefined;
  const quotaMetrics: string[] = [];

  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    const extractFromJson = (jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr) as {
          error?: {
            code?: number;
            message?: string;
            status?: string;
            details?: Array<{
              retryDelay?: string;
              violations?: Array<{ quotaMetric?: string; quotaId?: string }>;
            }>;
          };
        };
        if (parsed?.error) {
          if (typeof parsed.error.code === 'number') code = parsed.error.code;
          if (typeof parsed.error.status === 'string') statusText = parsed.error.status;
          for (const d of parsed.error.details ?? []) {
            if (typeof d?.retryDelay === 'string' && !retryDelayMs) {
              const secMatch = d.retryDelay.match(/^(\d+(?:\.\d+)?)s$/i);
              if (secMatch) {
                retryDelayMs = Math.min(25000, Math.max(1500, Math.round(Number(secMatch[1]) * 1000)));
              }
            }
            for (const v of d?.violations ?? []) {
              const label = [v?.quotaMetric, v?.quotaId].filter(Boolean).join(' / ');
              if (label && !quotaMetrics.includes(label)) {
                quotaMetrics.push(label);
              }
            }
          }
          if (typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
            const innerMsg = parsed.error.message.trim();
            if (innerMsg.startsWith('{')) {
              extractFromJson(innerMsg);
            } else {
              detail = innerMsg;
            }
          }
        }
      } catch {
        // Conserver detail brut si non JSON
      }
    };
    extractFromJson(raw.slice(jsonStart));
  }

  const lowerDetail = detail.toLowerCase();
  const isHardQuotaZero =
    (code === 429 || statusText === 'RESOURCE_EXHAUSTED') &&
    (lowerDetail.includes('check your plan and billing details') ||
      lowerDetail.includes('limit: 0') ||
      lowerDetail.includes('exceeded your current quota'));

  return { code, statusText, detail, retryDelayMs, quotaMetrics, isHardQuotaZero };
}

function isRetryableGeminiError(
  err: unknown,
  parsed: ParsedGeminiError,
  attempt: number
): boolean {
  if ((err as Error)?.name === 'AbortError') return false;
  // Un quota à 0 / facturation requise ne disparaît pas après 5 tentatives : on ne fait au maximum qu'un 2e essai rapide
  if (parsed.isHardQuotaZero) {
    return attempt === 1;
  }
  if (
    parsed.code === 429 ||
    parsed.code === 500 ||
    parsed.code === 502 ||
    parsed.code === 503 ||
    parsed.code === 504
  ) {
    return true;
  }
  if (
    parsed.statusText === 'RESOURCE_EXHAUSTED' ||
    parsed.statusText === 'UNAVAILABLE' ||
    parsed.statusText === 'INTERNAL' ||
    parsed.statusText === 'DEADLINE_EXCEEDED'
  ) {
    return true;
  }
  const lower = `${parsed.detail} ${parsed.statusText ?? ''}`.toLowerCase();
  return (
    lower.includes('high demand') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('try again') ||
    lower.includes('resource_exhausted') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up') ||
    lower.includes('réponse vide')
  );
}

function getFriendlyGeminiError(
  err: unknown,
  options?: { useWebSearch?: boolean }
): { status: number; message: string } {
  const parsed = parseGeminiErrorDetails(err);
  const statusTag = parsed.statusText || '';
  const metricSuffix =
    parsed.quotaMetrics.length > 0 ? ` [${parsed.quotaMetrics.join(', ')}]` : '';

  if (
    parsed.code === 401 ||
    parsed.code === 403 ||
    statusTag === 'PERMISSION_DENIED' ||
    statusTag === 'UNAUTHENTICATED' ||
    parsed.detail.includes('API_KEY_INVALID')
  ) {
    return {
      status: parsed.code || 403,
      message: `Clé API Gemini refusée (${parsed.detail.slice(0, 180)}). Vérifiez votre clé dans Settings > Secrets.`,
    };
  }

  if (parsed.code === 404 || statusTag === 'NOT_FOUND') {
    return {
      status: 404,
      message: `Modèle Gemini introuvable ou indisponible (${parsed.detail.slice(0, 180)}).`,
    };
  }

  if (parsed.code === 503 || statusTag === 'UNAVAILABLE') {
    return {
      status: 503,
      message: `Le modèle connaît un pic de charge temporaire malgré ${MAX_ATTEMPTS} tentatives (${parsed.detail.slice(0, 180)}).`,
    };
  }

  if (parsed.code === 429 || statusTag === 'RESOURCE_EXHAUSTED') {
    if (parsed.isHardQuotaZero && options?.useWebSearch) {
      return {
        status: 429,
        message: `La recherche Google Search (« Web actif ») nécessite un quota Grounding actif ou une facturation activée sur le projet de la clé API (${parsed.detail.slice(0, 160)}${metricSuffix}). Cliquez sur « Réessayer sans web » pour utiliser Hydrogen / Flash Lite directement.`,
      };
    }
    if (parsed.isHardQuotaZero) {
      return {
        status: 429,
        message: `Quota API à 0 ou facturation requise sur ce projet/clé (${parsed.detail.slice(0, 180)}${metricSuffix}). Vérifiez votre clé ou le plan associé dans Settings > Secrets.`,
      };
    }
    return {
      status: 429,
      message: `Limitation temporaire de requêtes côté Gemini après ${MAX_ATTEMPTS} tentatives : ${parsed.detail.slice(0, 220)}${metricSuffix}`,
    };
  }

  if (parsed.code === 504 || statusTag === 'DEADLINE_EXCEEDED' || /timeout|timed out/i.test(parsed.detail)) {
    return {
      status: 504,
      message: `Délai d'attente dépassé après plusieurs tentatives (${parsed.detail.slice(0, 180)}).`,
    };
  }

  return {
    status: parsed.code && parsed.code >= 400 && parsed.code < 600 ? parsed.code : 500,
    message: `Erreur du conseiller IA : ${parsed.detail.slice(0, 260)}`,
  };
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function startServer() {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/explore/advise', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error:
          'GEMINI_API_KEY est manquante côté serveur. Configurez votre clé dans Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as AdviseRequestBody;
    const modelId: ExploreModelId =
      body.modelId && VALID_MODELS.has(body.modelId) ? body.modelId : 'gemini-4-hydrogen';
    const tier: ExploreTier = body.tier && VALID_TIERS.has(body.tier) ? body.tier : 'plan';
    const useWebSearch = Boolean(body.useWebSearch);
    const contextSummary = String(body.contextSummary ?? '').slice(0, 30000);
    const groupName = body.groupName ? String(body.groupName).slice(0, 120) : undefined;
    const thematique = body.thematique ? String(body.thematique).slice(0, 300) : undefined;

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const contents = rawMessages
      .filter(
        (m): m is AdviseMessageInput =>
          Boolean(
            m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string' &&
              m.content.trim()
          )
      )
      .slice(-14)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.slice(0, 12000) }],
      }));

    if (contents.length === 0) {
      res.status(400).json({ error: 'Aucun message fourni pour le conseiller.' });
      return;
    }

    // Passage en flux SSE immédiat pour éviter tout timeout proxy et remonter la progression réelle
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sendEvent = (event: string, payload: unknown) => {
      if (abortController.signal.aborted || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (abortController.signal.aborted || res.writableEnded) return;
      res.write(': keepalive\n\n');
    }, 3000);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: GEMINI_REQUEST_TIMEOUT_MS,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const thinkingLevel = resolveThinkingLevel(modelId, tier);
    const systemInstruction = buildSystemInstruction(
      tier,
      useWebSearch,
      contextSummary,
      groupName,
      thematique
    );

    try {
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (abortController.signal.aborted) break;

        sendEvent('status', {
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          message:
            attempt === 1
              ? useWebSearch
                ? 'Recherche web et réflexion pédagogique en cours…'
                : 'Réflexion pédagogique en cours…'
              : `Nouvelle tentative (${attempt}/${MAX_ATTEMPTS}) en cours…`,
        });

        let accumulatedText = '';
        const seenUrls = new Set<string>();
        const webSources: Array<{ title: string; url: string }> = [];

        try {
          const stream = await ai.models.generateContentStream({
            model: modelId,
            contents,
            config: {
              abortSignal: abortController.signal,
              systemInstruction,
              thinkingConfig: { thinkingLevel },
              ...(useWebSearch ? { tools: [{ googleSearch: {} }] } : {}),
            },
          });

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;

            const delta = chunk.text ?? '';
            if (delta) {
              accumulatedText += delta;
              sendEvent('chunk', { delta });
            }

            const rawChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
            for (const gc of rawChunks) {
              const uri = gc?.web?.uri;
              if (typeof uri === 'string' && uri.startsWith('http') && !seenUrls.has(uri)) {
                seenUrls.add(uri);
                webSources.push({
                  title: String(gc?.web?.title ?? uri).slice(0, 160),
                  url: uri.slice(0, 1000),
                });
                if (webSources.length >= 20) break;
              }
            }
          }

          if (abortController.signal.aborted) break;

          if (!accumulatedText.trim()) {
            throw new Error('Réponse vide reçue du modèle.');
          }

          sendEvent('done', {
            text: accumulatedText,
            webSources,
            modelId,
            tier,
          });
          return;
        } catch (err) {
          lastError = err;
          if (abortController.signal.aborted) break;

          // Si du texte partiel utilisable était déjà arrivé avant une coupure de flux, on le conserve ?
          // Si on n'a pas encore de texte ou si le JSON de fin manque, on réessaie proprement
          const parsed = parseGeminiErrorDetails(err);
          const canRetry =
            attempt < MAX_ATTEMPTS &&
            !accumulatedText.trim() &&
            isRetryableGeminiError(err, parsed, attempt);

          if (!canRetry) {
            break;
          }

          const delayMs = parsed.isHardQuotaZero
            ? 1500
            : parsed.retryDelayMs ??
              RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
          const delaySec = Math.max(1, Math.round(delayMs / 1000));

          sendEvent('status', {
            attempt,
            maxAttempts: MAX_ATTEMPTS,
            retrying: true,
            message:
              parsed.code === 429 || parsed.statusText === 'RESOURCE_EXHAUSTED'
                ? `File d’attente Gemini atteinte — nouvel essai (${attempt + 1}/${MAX_ATTEMPTS}) dans ${delaySec} s…`
                : `Modèle très sollicité — nouvel essai (${attempt + 1}/${MAX_ATTEMPTS}) dans ${delaySec} s…`,
          });

          await sleepWithAbort(delayMs, abortController.signal);
        }
      }

      if (!abortController.signal.aborted) {
        const mapped = getFriendlyGeminiError(lastError, { useWebSearch });
        sendEvent('error', {
          status: mapped.status,
          error: mapped.message,
        });
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.get('/api/notion/status', async (req, res) => {
    const apiKey = process.env.NOTION_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_NOTION_API_KEY') {
      res.json({
        configured: false,
        reachable: false,
        defaultDatabaseId: DEFAULT_BIBLIMPRO_NOTION_DB_ID,
      });
      return;
    }

    const rawDb =
      typeof req.query.databaseId === 'string' ? req.query.databaseId.trim().slice(0, 300) : undefined;
    try {
      const db = await resolveBiblimproDatabase(apiKey, rawDb || undefined);
      res.json({
        configured: true,
        reachable: true,
        defaultDatabaseId: DEFAULT_BIBLIMPRO_NOTION_DB_ID,
        databaseId: db.databaseId,
        databaseTitle: db.title,
      });
    } catch (err) {
      res.json({
        configured: true,
        reachable: false,
        defaultDatabaseId: DEFAULT_BIBLIMPRO_NOTION_DB_ID,
        error: err instanceof Error ? err.message : 'Connexion à Notion impossible.',
      });
    }
  });

  app.post('/api/notion/biblimpro/sync', async (req, res) => {
    const apiKey = process.env.NOTION_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_NOTION_API_KEY') {
      res.status(500).json({
        error:
          'NOTION_API_KEY est manquante côté serveur. Ajoutez votre jeton d’intégration Notion dans Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      databaseId?: unknown;
      skipNotionPageIds?: unknown;
      skipTitles?: unknown;
    };
    const requestedDb =
      typeof body.databaseId === 'string' && body.databaseId.trim()
        ? body.databaseId.trim().slice(0, 300)
        : undefined;
    const skipIdSet = new Set(
      Array.isArray(body.skipNotionPageIds)
        ? body.skipNotionPageIds
            .filter((v): v is string => typeof v === 'string')
            .slice(0, 2000)
            .map((v) => compactNotionUuid(v))
            .filter((v) => v.length === 32)
        : []
    );
    const skipTitleSet = new Set(
      Array.isArray(body.skipTitles)
        ? body.skipTitles
            .filter((v): v is string => typeof v === 'string')
            .slice(0, 2000)
            .map((v) => normalizeExerciseMatchKey(v))
            .filter(Boolean)
        : []
    );

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sendEvent = (event: string, payload: unknown) => {
      if (abortController.signal.aborted || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (abortController.signal.aborted || res.writableEnded) return;
      res.write(': keepalive\n\n');
    }, 3000);

    try {
      sendEvent('status', {
        message: 'Connexion à l’API Notion…',
        processed: 0,
        total: 0,
      });

      const db = await resolveBiblimproDatabase(apiKey, requestedDb, abortController.signal);
      if (abortController.signal.aborted) return;

      sendEvent('status', {
        message: `Base « ${db.title} » trouvée. Lecture de la liste des exercices…`,
        processed: 0,
        total: 0,
      });

      const allPages = await queryAllDatabasePages(apiKey, db.formattedId, abortController.signal);
      if (abortController.signal.aborted) return;

      const pagesToFetch =
        skipIdSet.size === 0 && skipTitleSet.size === 0
          ? allPages
          : allPages.filter((page) => {
              const compactId = compactNotionUuid(page.id);
              if (skipIdSet.has(compactId)) return false;
              const props = extractBiblimproPropertiesFromNotionPage(page);
              const titleKey = normalizeExerciseMatchKey(props.nom);
              if (titleKey && skipTitleSet.has(titleKey)) return false;
              return true;
            });

      const skippedCount = allPages.length - pagesToFetch.length;
      const total = pagesToFetch.length;

      sendEvent('progress', {
        message:
          skippedCount > 0
            ? `${total} ${total > 1 ? 'fiches restantes à récupérer' : 'fiche restante à récupérer'} (${skippedCount} déjà à jour).`
            : `${total} ${total > 1 ? 'fiches détectées' : 'fiche détectée'}. Récupération des contenus…`,
        processed: 0,
        total,
        skippedCount,
      });

      const userNameCache = new Map<string, string>();
      const warningsSet = new Set<string>();
      let processed = 0;

      for (const page of pagesToFetch) {
        if (abortController.signal.aborted) break;
        const props = extractBiblimproPropertiesFromNotionPage(page);
        const result = await fetchFullNotionExercisePage(
          apiKey,
          page,
          userNameCache,
          abortController.signal
        );
        if (abortController.signal.aborted) break;
        if (result.warning) warningsSet.add(result.warning);
        processed += 1;
        sendEvent('page', { page: result.payload });
        sendEvent('progress', {
          message: `Synchronisation de « ${props.nom} »…`,
          processed,
          total,
          skippedCount,
          currentTitle: props.nom,
        });
      }

      if (!abortController.signal.aborted) {
        sendEvent('done', {
          databaseId: db.databaseId,
          databaseTitle: db.title,
          total,
          skippedCount,
          warnings: Array.from(warningsSet),
        });
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        const status = err instanceof NotionApiError ? err.status : 500;
        const message =
          err instanceof Error ? err.message : 'Erreur lors de la synchronisation Notion.';
        sendEvent('error', { status, error: message });
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  app.post('/api/notion/page/sync', async (req, res) => {
    const apiKey = process.env.NOTION_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_NOTION_API_KEY') {
      res.status(500).json({
        error:
          'NOTION_API_KEY est manquante côté serveur. Ajoutez votre jeton d’intégration Notion dans Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      notionPageId?: unknown;
      title?: unknown;
      databaseId?: unknown;
    };
    const rawNotionPageId =
      typeof body.notionPageId === 'string' ? body.notionPageId.trim().slice(0, 100) : undefined;
    const rawTitle = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : undefined;
    const rawDatabaseId =
      typeof body.databaseId === 'string' && body.databaseId.trim()
        ? body.databaseId.trim().slice(0, 300)
        : undefined;

    if (rawNotionPageId && !formatNotionUuid(rawNotionPageId)) {
      res.status(400).json({ error: 'Identifiant de page Notion invalide.' });
      return;
    }
    if (!rawNotionPageId && !rawTitle) {
      res.status(400).json({ error: 'Identifiant Notion ou titre de fiche requis.' });
      return;
    }

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });

    try {
      const result = await fetchSingleNotionExerciseByIdOrTitle(apiKey, {
        notionPageId: rawNotionPageId,
        title: rawTitle,
        databaseId: rawDatabaseId,
        signal: abortController.signal,
      });
      res.json({
        page: result.payload,
        warning: result.warning,
        databaseTitle: result.databaseTitle,
      });
    } catch (err) {
      if (abortController.signal.aborted) return;
      const status = err instanceof NotionApiError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : 'Erreur lors de la synchronisation de la fiche.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  app.get('/api/notion/media/:blockId', async (req, res) => {
    const apiKey = process.env.NOTION_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_NOTION_API_KEY') {
      res.status(500).json({ error: 'NOTION_API_KEY manquante côté serveur.' });
      return;
    }

    const rawBlockId = String(req.params.blockId ?? '').trim();
    if (!/^[a-fA-F0-9-]{32,36}$/.test(rawBlockId) || compactNotionUuid(rawBlockId).length !== 32) {
      res.status(400).json({ error: 'Identifiant de bloc média Notion invalide.' });
      return;
    }

    try {
      const mediaUrl = await resolveNotionMediaUrl(apiKey, rawBlockId);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.redirect(302, mediaUrl);
    } catch (err) {
      const status = err instanceof NotionApiError ? err.status : 500;
      const message =
        err instanceof Error ? err.message : 'Impossible de résoudre le média Notion.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  const httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`FlowNote server listening on http://0.0.0.0:${port}`);
  });
  // Délais généreux pour laisser le temps aux raisonnements approfondis (Plan/Max + recherche web)
  httpServer.requestTimeout = 10 * 60 * 1000;
  httpServer.headersTimeout = 10 * 60 * 1000;
  httpServer.keepAliveTimeout = 120 * 1000;
}

void startServer();
