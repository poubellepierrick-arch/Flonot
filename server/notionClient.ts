import {
  compactNotionUuid,
  DEFAULT_BIBLIMPRO_NOTION_DB_ID,
  extractBiblimproPropertiesFromNotionPage,
  extractNotionUuid,
  formatNotionUuid,
  isSafeHttpUrl,
  mapNotionBlocksToFlownoteBlocks,
  mapNotionCommentsToRowComments,
  normalizeExerciseMatchKey,
  richTextToPlainString,
  type NotionApiBlock,
  type NotionApiComment,
  type NotionApiPage,
  type NotionExerciseSyncPayload,
  type NotionRichTextSpan,
} from '../src/utils/notionApiSync';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MEDIA_CACHE_TTL_MS = 25 * 60 * 1000;

interface NotionDatabaseObject {
  id: string;
  object: 'database';
  title?: NotionRichTextSpan[];
}

interface NotionListResponse<T> {
  results: T[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export class NotionApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code;
  }
}

const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();

const MIN_REQUEST_INTERVAL_MS = 350;
let nextAllowedRequestAt = 0;
let rateLimitChain: Promise<void> = Promise.resolve();

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function paceNotionRequest(signal?: AbortSignal): Promise<void> {
  const run = rateLimitChain.then(async () => {
    if (signal?.aborted) return;
    const now = Date.now();
    const waitMs = nextAllowedRequestAt - now;
    if (waitMs > 0) {
      await sleepWithAbort(waitMs, signal);
    }
    nextAllowedRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  });
  rateLimitChain = run.catch(() => {});
  return run;
}

async function notionRequest<T>(
  apiKey: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const maxAttempts = 6;
  const fallback429Delays = [2500, 4500, 8000, 14000, 22000];
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (init.signal?.aborted) {
      throw new NotionApiError(499, 'Synchronisation interrompue.');
    }

    await paceNotionRequest(init.signal);
    if (init.signal?.aborted) {
      throw new NotionApiError(499, 'Synchronisation interrompue.');
    }

    try {
      const response = await fetch(`${NOTION_API_BASE}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': NOTION_VERSION,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      let code: string | undefined;
      let detail = `HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { code?: string; message?: string };
        if (errJson?.code) code = errJson.code;
        if (errJson?.message) detail = errJson.message;
      } catch {
        // Ignore JSON parse errors on error bodies
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxAttempts) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retrySec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const delayMs =
            Number.isFinite(retrySec) && retrySec > 0
              ? Math.min(30000, Math.max(1000, Math.round(retrySec * 1000)))
              : response.status === 429
                ? fallback429Delays[Math.min(attempt - 1, fallback429Delays.length - 1)]
                : 1000 * attempt;
          nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + delayMs);
          await sleepWithAbort(delayMs, init.signal);
          continue;
        }
        if (response.status === 429) {
          throw new NotionApiError(
            429,
            'Limite de requêtes de l’API Notion atteinte (429). Patientez 30 secondes puis relancez « Compléter les manquantes ».',
            code
          );
        }
      }

      if (response.status === 401) {
        throw new NotionApiError(
          401,
          'Jeton Notion invalide ou révoqué. Vérifiez NOTION_API_KEY dans Settings > Secrets.',
          code
        );
      }
      if (response.status === 403) {
        throw new NotionApiError(
          403,
          `Accès Notion refusé (${detail}). Vérifiez les capacités de votre intégration.`,
          code
        );
      }
      if (response.status === 404) {
        throw new NotionApiError(
          404,
          'Ressource Notion introuvable ou non partagée avec votre intégration (menu « ... » → Connexions dans Notion).',
          code
        );
      }

      throw new NotionApiError(response.status, `Erreur API Notion : ${detail}`, code);
    } catch (err) {
      if (err instanceof NotionApiError) throw err;
      lastError = err;
      if (init.signal?.aborted) {
        throw new NotionApiError(499, 'Synchronisation interrompue.');
      }
      if (attempt < maxAttempts) {
        await sleepWithAbort(700 * attempt, init.signal);
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? new NotionApiError(502, `Connexion Notion impossible : ${lastError.message}`)
    : new NotionApiError(502, 'Connexion Notion impossible.');
}

export async function resolveBiblimproDatabase(
  apiKey: string,
  requestedDatabaseInput?: string,
  signal?: AbortSignal
): Promise<{ databaseId: string; formattedId: string; title: string }> {
  const candidates: string[] = [];

  if (requestedDatabaseInput && requestedDatabaseInput.trim()) {
    const extracted = extractNotionUuid(requestedDatabaseInput);
    if (!extracted) {
      throw new NotionApiError(
        400,
        'Identifiant ou lien de base Notion invalide (attendu : URL Notion ou UUID à 32 caractères).'
      );
    }
    candidates.push(extracted);
  } else {
    const envDb = process.env.NOTION_BIBLIMPRO_DATABASE_ID?.trim();
    if (envDb) {
      const extracted = extractNotionUuid(envDb);
      if (extracted) candidates.push(extracted);
    }
    if (!candidates.includes(DEFAULT_BIBLIMPRO_NOTION_DB_ID)) {
      candidates.push(DEFAULT_BIBLIMPRO_NOTION_DB_ID);
    }
  }

  for (const compactId of candidates) {
    const formatted = formatNotionUuid(compactId);
    if (!formatted) continue;
    try {
      const db = await notionRequest<NotionDatabaseObject>(apiKey, `/databases/${formatted}`, {
        signal,
      });
      const title = richTextToPlainString(db.title).trim() || 'Biblimpro';
      return { databaseId: compactNotionUuid(db.id), formattedId: formatted, title };
    } catch (err) {
      // Si un ID explicite a été fourni par l'utilisateur ou env, remonter l'erreur directe
      if (
        (requestedDatabaseInput && requestedDatabaseInput.trim()) ||
        (err instanceof NotionApiError && err.status === 401)
      ) {
        throw err;
      }
    }
  }

  // Auto-découverte parmi les bases partagées avec l'intégration
  const searchRes = await notionRequest<NotionListResponse<NotionDatabaseObject>>(
    apiKey,
    '/search',
    {
      method: 'POST',
      body: {
        filter: { value: 'database', property: 'object' },
        page_size: 25,
      },
      signal,
    }
  );

  const dbs = (searchRes.results ?? []).filter((d) => d.object === 'database');
  if (dbs.length === 0) {
    throw new NotionApiError(
      404,
      'Aucune base Notion partagée avec cette intégration. Ouvrez Biblimpro dans Notion → « ... » → Connexions → ajoutez votre intégration.'
    );
  }

  const preferred =
    dbs.find((d) => normalizeExerciseMatchKey(richTextToPlainString(d.title)).includes('biblimpro')) ??
    dbs.find((d) => normalizeExerciseMatchKey(richTextToPlainString(d.title)).includes('exercice')) ??
    (dbs.length === 1 ? dbs[0] : undefined);

  if (!preferred) {
    throw new NotionApiError(
      404,
      `Plusieurs bases Notion sont partagées (${dbs
        .map((d) => richTextToPlainString(d.title).trim() || d.id)
        .slice(0, 4)
        .join(', ')}), mais aucune ne s'appelle Biblimpro. Collez le lien de votre base Biblimpro pour cibler la bonne.`
    );
  }

  const compact = compactNotionUuid(preferred.id);
  const formatted = formatNotionUuid(compact) ?? preferred.id;
  return {
    databaseId: compact,
    formattedId: formatted,
    title: richTextToPlainString(preferred.title).trim() || 'Biblimpro',
  };
}

export async function queryAllDatabasePages(
  apiKey: string,
  formattedDatabaseId: string,
  signal?: AbortSignal
): Promise<NotionApiPage[]> {
  const pages: NotionApiPage[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await notionRequest<NotionListResponse<NotionApiPage>>(
      apiKey,
      `/databases/${formattedDatabaseId}/query`,
      {
        method: 'POST',
        body,
        signal,
      }
    );

    for (const p of res.results ?? []) {
      if (p && typeof p.id === 'string') pages.push(p);
    }

    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor && pages.length < 2000);

  return pages;
}

export async function fetchBlocksTree(
  apiKey: string,
  formattedBlockId: string,
  signal?: AbortSignal,
  depth = 0
): Promise<NotionApiBlock[]> {
  if (depth > 5) return [];

  const blocks: NotionApiBlock[] = [];
  let cursor: string | undefined;

  do {
    const queryStr = cursor
      ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}`
      : '?page_size=100';
    const res = await notionRequest<NotionListResponse<NotionApiBlock>>(
      apiKey,
      `/blocks/${formattedBlockId}/children${queryStr}`,
      { signal }
    );

    for (const b of res.results ?? []) {
      if (!b || typeof b.id !== 'string') continue;
      const syncedFromId = (
        b as NotionApiBlock & { synced_block?: { synced_from?: { block_id?: string } | null } }
      ).synced_block?.synced_from?.block_id;

      if (b.type === 'synced_block' && syncedFromId) {
        const targetUuid = formatNotionUuid(syncedFromId);
        if (targetUuid) {
          b.children = await fetchBlocksTree(apiKey, targetUuid, signal, depth + 1);
        }
      } else if (b.has_children) {
        const childUuid = formatNotionUuid(b.id);
        if (childUuid) {
          b.children = await fetchBlocksTree(apiKey, childUuid, signal, depth + 1);
        }
      }

      blocks.push(b);
    }

    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor && blocks.length < 400);

  return blocks;
}

export async function fetchPageCommentsWithAuthors(
  apiKey: string,
  formattedPageId: string,
  userNameCache: Map<string, string>,
  signal?: AbortSignal
): Promise<{ comments: NotionApiComment[]; warning?: string }> {
  const comments: NotionApiComment[] = [];
  let cursor: string | undefined;

  try {
    do {
      const queryStr = cursor
        ? `?block_id=${formattedPageId}&page_size=100&start_cursor=${encodeURIComponent(cursor)}`
        : `?block_id=${formattedPageId}&page_size=100`;
      const res = await notionRequest<NotionListResponse<NotionApiComment>>(
        apiKey,
        `/comments${queryStr}`,
        { signal }
      );
      for (const c of res.results ?? []) {
        if (c && typeof c.id === 'string') comments.push(c);
      }
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor && comments.length < 100);
  } catch (err) {
    if (err instanceof NotionApiError && err.status === 403) {
      return {
        comments: [],
        warning:
          'Commentaires non importés : activez la capacité « Read comments » sur votre intégration Notion.',
      };
    }
    throw err;
  }

  for (const c of comments) {
    const uid = c.created_by?.id;
    if (!uid || c.created_by?.name || userNameCache.has(uid)) continue;
    const formattedUid = formatNotionUuid(uid);
    if (!formattedUid) continue;
    try {
      const userObj = await notionRequest<{ name?: string }>(apiKey, `/users/${formattedUid}`, {
        signal,
      });
      userNameCache.set(uid, userObj.name?.trim() || 'Notion');
    } catch {
      userNameCache.set(uid, 'Notion');
    }
  }

  return { comments };
}

export async function fetchFullNotionExercisePage(
  apiKey: string,
  page: NotionApiPage,
  userNameCache: Map<string, string>,
  signal?: AbortSignal
): Promise<{ payload: NotionExerciseSyncPayload; warning?: string }> {
  const formattedPageId = formatNotionUuid(page.id) ?? page.id;
  const compactPageId = compactNotionUuid(page.id);

  const [rawBlocks, commentRes] = await Promise.all([
    fetchBlocksTree(apiKey, formattedPageId, signal),
    fetchPageCommentsWithAuthors(apiKey, formattedPageId, userNameCache, signal),
  ]);

  const resolvedAuthors: Record<string, string> = {};
  for (const [uid, name] of userNameCache.entries()) {
    resolvedAuthors[uid] = name;
  }

  const properties = extractBiblimproPropertiesFromNotionPage(page);
  const blocks = mapNotionBlocksToFlownoteBlocks(rawBlocks);
  const comments = mapNotionCommentsToRowComments(commentRes.comments, resolvedAuthors);

  return {
    payload: {
      notionPageId: compactPageId,
      notionUrl: page.url,
      lastEditedTime: page.last_edited_time,
      properties,
      blocks,
      comments,
    },
    warning: commentRes.warning,
  };
}

export async function fetchSingleNotionExerciseByIdOrTitle(
  apiKey: string,
  options: {
    notionPageId?: string;
    title?: string;
    databaseId?: string;
    signal?: AbortSignal;
  }
): Promise<{ payload: NotionExerciseSyncPayload; warning?: string; databaseTitle?: string }> {
  const userNameCache = new Map<string, string>();

  if (options.notionPageId) {
    const formattedPageId = formatNotionUuid(options.notionPageId);
    if (!formattedPageId) {
      throw new NotionApiError(400, 'Identifiant de page Notion invalide.');
    }
    const page = await notionRequest<NotionApiPage>(apiKey, `/pages/${formattedPageId}`, {
      signal: options.signal,
    });
    return fetchFullNotionExercisePage(apiKey, page, userNameCache, options.signal);
  }

  const targetTitle = normalizeExerciseMatchKey(options.title ?? '');
  if (!targetTitle) {
    throw new NotionApiError(400, 'Titre ou identifiant Notion requis pour synchroniser la fiche.');
  }

  const db = await resolveBiblimproDatabase(apiKey, options.databaseId, options.signal);
  const pages = await queryAllDatabasePages(apiKey, db.formattedId, options.signal);
  const matched = pages.find((p) => {
    const props = extractBiblimproPropertiesFromNotionPage(p);
    return normalizeExerciseMatchKey(props.nom) === targetTitle;
  });

  if (!matched) {
    throw new NotionApiError(
      404,
      `Aucun exercice nommé « ${options.title?.trim()} » trouvé dans la base Notion « ${db.title} ».`
    );
  }

  const res = await fetchFullNotionExercisePage(apiKey, matched, userNameCache, options.signal);
  return { ...res, databaseTitle: db.title };
}

export async function resolveNotionMediaUrl(
  apiKey: string,
  rawBlockId: string,
  signal?: AbortSignal
): Promise<string> {
  const compact = compactNotionUuid(rawBlockId);
  const formatted = formatNotionUuid(compact);
  if (!formatted) {
    throw new NotionApiError(400, 'Identifiant de bloc média Notion invalide.');
  }

  const cached = mediaUrlCache.get(compact);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const block = await notionRequest<NotionApiBlock>(apiKey, `/blocks/${formatted}`, { signal });
  const mediaContainer =
    block.type === 'audio'
      ? block.audio
      : block.type === 'video'
        ? block.video
        : block.type === 'image'
          ? block.image
          : block.type === 'file'
            ? block.file
            : block.type === 'pdf'
              ? block.pdf
              : undefined;

  const candidateUrl =
    mediaContainer?.type === 'external'
      ? mediaContainer.external?.url
      : mediaContainer?.file?.url ?? mediaContainer?.external?.url;

  if (!isSafeHttpUrl(candidateUrl)) {
    throw new NotionApiError(404, 'Média Notion introuvable ou URL invalide.');
  }

  if (mediaUrlCache.size >= 500) {
    const oldestKey = mediaUrlCache.keys().next().value;
    if (oldestKey) mediaUrlCache.delete(oldestKey);
  }

  let expiresAt = Date.now() + MEDIA_CACHE_TTL_MS;
  const rawExpiry = mediaContainer?.file?.expiry_time;
  if (rawExpiry) {
    const parsedExpiry = Date.parse(rawExpiry);
    if (Number.isFinite(parsedExpiry)) {
      expiresAt = Math.min(expiresAt, Math.max(Date.now() + 60_000, parsedExpiry - 120_000));
    }
  }

  mediaUrlCache.set(compact, { url: candidateUrl, expiresAt });
  return candidateUrl;
}
