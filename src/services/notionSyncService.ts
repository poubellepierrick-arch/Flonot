import type {
  NotionExerciseSyncPayload,
  NotionSyncStatusResponse,
} from '../utils/notionApiSync';

export interface NotionBiblimproSyncProgress {
  phase: 'connecting' | 'fetching' | 'done';
  message: string;
  processed: number;
  total: number;
  skippedCount?: number;
  savedSoFar?: number;
  currentTitle?: string;
}

export interface NotionBiblimproStreamResult {
  databaseId: string;
  databaseTitle: string;
  payloads: NotionExerciseSyncPayload[];
  skippedCount: number;
  warnings: string[];
}

export class NotionSyncPartialError extends Error {
  savedCount: number;

  constructor(message: string, savedCount: number) {
    super(message);
    this.name = 'NotionSyncPartialError';
    this.savedCount = savedCount;
  }
}

export async function fetchNotionSyncStatus(
  databaseIdOrUrl?: string
): Promise<NotionSyncStatusResponse> {
  const qs = databaseIdOrUrl?.trim()
    ? `?databaseId=${encodeURIComponent(databaseIdOrUrl.trim())}`
    : '';
  const res = await fetch(`/api/notion/status${qs}`);
  const data = (await res.json()) as NotionSyncStatusResponse;
  return data;
}

export async function syncSingleNotionExercise(params: {
  notionPageId?: string;
  title?: string;
  databaseId?: string;
}): Promise<{ payload: NotionExerciseSyncPayload; warning?: string; databaseTitle?: string }> {
  const res = await fetch('/api/notion/page/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    page?: NotionExerciseSyncPayload;
    warning?: string;
    databaseTitle?: string;
    error?: string;
  };
  if (!res.ok || !data.page) {
    throw new Error(data.error || `Erreur synchronisation Notion (HTTP ${res.status})`);
  }
  return {
    payload: data.page,
    warning: data.warning,
    databaseTitle: data.databaseTitle,
  };
}

const CHECKPOINT_BATCH_SIZE = 8;

export async function streamBiblimproFromNotion(params: {
  databaseId?: string;
  skipNotionPageIds?: string[];
  skipTitles?: string[];
  signal?: AbortSignal;
  onBatch?: (batch: NotionExerciseSyncPayload[]) => Promise<void> | void;
  onProgress?: (progress: NotionBiblimproSyncProgress) => void;
}): Promise<NotionBiblimproStreamResult> {
  const response = await fetch('/api/notion/biblimpro/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      databaseId: params.databaseId?.trim() || undefined,
      skipNotionPageIds: params.skipNotionPageIds,
      skipTitles: params.skipTitles,
    }),
    signal: params.signal,
  });

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
    let errMessage = `Synchronisation Notion impossible (HTTP ${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) errMessage = errJson.error;
    } catch {
      // Keep generic message
    }
    throw new Error(errMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const payloads: NotionExerciseSyncPayload[] = [];
  const pendingBatch: NotionExerciseSyncPayload[] = [];
  let savedSoFar = 0;
  let flushChain: Promise<void> = Promise.resolve();
  let flushError: unknown = null;

  const scheduleBatchFlush = () => {
    if (!params.onBatch || pendingBatch.length === 0) return;
    const chunk = pendingBatch.splice(0, pendingBatch.length);
    flushChain = flushChain
      .then(async () => {
        await params.onBatch?.(chunk);
        savedSoFar += chunk.length;
      })
      .catch((err) => {
        flushError = err;
      });
  };

  let warnings: string[] = [];
  let databaseId = '';
  let databaseTitle = 'Biblimpro';
  let skippedCount = 0;
  let streamError: string | null = null;
  let lastProgress: NotionBiblimproSyncProgress = {
    phase: 'connecting',
    message: 'Connexion à Notion…',
    processed: 0,
    total: 0,
    savedSoFar: 0,
  };

  const processEventBlock = (rawBlock: string) => {
    const lines = rawBlock.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'status') {
      lastProgress = {
        phase: 'connecting',
        message: String(parsed.message ?? 'Connexion à Notion…'),
        processed: Number(parsed.processed ?? 0),
        total: Number(parsed.total ?? 0),
        savedSoFar,
      };
      params.onProgress?.(lastProgress);
    } else if (eventName === 'progress') {
      if (typeof parsed.skippedCount === 'number') {
        skippedCount = parsed.skippedCount;
      }
      lastProgress = {
        phase: 'fetching',
        message: String(parsed.message ?? 'Récupération des fiches…'),
        processed: Number(parsed.processed ?? 0),
        total: Number(parsed.total ?? 0),
        skippedCount,
        savedSoFar,
        currentTitle: typeof parsed.currentTitle === 'string' ? parsed.currentTitle : undefined,
      };
      params.onProgress?.(lastProgress);
    } else if (eventName === 'page' && parsed.page) {
      const item = parsed.page as NotionExerciseSyncPayload;
      payloads.push(item);
      if (params.onBatch) {
        pendingBatch.push(item);
        if (pendingBatch.length >= CHECKPOINT_BATCH_SIZE) {
          scheduleBatchFlush();
        }
      }
    } else if (eventName === 'done') {
      databaseId = String(parsed.databaseId ?? '');
      databaseTitle = String(parsed.databaseTitle ?? 'Biblimpro');
      if (typeof parsed.skippedCount === 'number') {
        skippedCount = parsed.skippedCount;
      }
      warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [];
      lastProgress = {
        phase: 'done',
        message: 'Récupération Notion terminée.',
        processed: Number(parsed.total ?? payloads.length),
        total: Number(parsed.total ?? payloads.length),
        skippedCount,
        savedSoFar: params.onBatch ? savedSoFar + pendingBatch.length : payloads.length,
      };
      params.onProgress?.(lastProgress);
    } else if (eventName === 'error') {
      streamError = String(parsed.error ?? 'Erreur pendant la synchronisation Notion.');
    }
  };

  let readFailure: unknown = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const chunk = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        if (chunk.trim()) processEventBlock(chunk);
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  } catch (err) {
    readFailure = err;
  } finally {
    if (params.onBatch) {
      scheduleBatchFlush();
      await flushChain;
    }
  }

  if (flushError) {
    throw flushError instanceof Error ? flushError : new Error(String(flushError));
  }

  if (readFailure) {
    const msg =
      params.signal?.aborted || (readFailure as Error)?.name === 'AbortError'
        ? 'Synchronisation interrompue.'
        : readFailure instanceof Error
          ? readFailure.message
          : 'Connexion interrompue pendant la synchronisation.';
    throw new NotionSyncPartialError(msg, savedSoFar);
  }

  if (streamError) {
    throw new NotionSyncPartialError(streamError, savedSoFar);
  }

  return {
    databaseId,
    databaseTitle,
    payloads,
    skippedCount,
    warnings,
  };
}
