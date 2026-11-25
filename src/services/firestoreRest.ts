import type { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebase';

export interface FirestoreRestValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string | number;
  doubleValue?: number | string;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

export interface RestFieldTransform {
  fieldPath: string;
  setToServerValue: 'REQUEST_TIME';
}

export type RestWriteOp =
  | {
      update: {
        name: string;
        fields: Record<string, FirestoreRestValue>;
      };
      updateMask?: {
        fieldPaths: string[];
      };
      updateTransforms?: RestFieldTransform[];
      currentDocument?: {
        exists?: boolean;
      };
    }
  | {
      delete: string;
    };

export class FirestoreRestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'FirestoreRestError';
    this.status = status;
    this.code = code;
  }
}

const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
  firebaseConfig.projectId
)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;

export function buildFirestoreDocumentName(relativePath: string): string {
  const clean = relativePath.replace(/^\/+|\/+$/g, '');
  return `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${clean}`;
}

function buildDocumentUrl(relativePath: string): string {
  const segments = relativePath
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg));
  return `${FIRESTORE_REST_BASE}/${segments.join('/')}?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
}

function buildRunQueryUrl(parentRelativePath: string): string {
  const clean = parentRelativePath.replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return `${FIRESTORE_REST_BASE}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  }
  const segments = clean
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg));
  return `${FIRESTORE_REST_BASE}/${segments.join('/')}:runQuery?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
}

function buildCommitUrl(): string {
  return `${FIRESTORE_REST_BASE}:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
}

export function isWebChannelTransportError(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
      ? err.code.toLowerCase()
      : '';
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();

  if (code.includes('permission-denied') || msg.includes('missing or insufficient permissions')) {
    return false;
  }

  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('target id already exists') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('failed to get document')
  );
}

export function decodeFirestoreRestValue(val: FirestoreRestValue | undefined): unknown {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) {
    const n = Number(val.integerValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('doubleValue' in val) {
    const n = Number(val.doubleValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('stringValue' in val) return String(val.stringValue ?? '');
  if ('timestampValue' in val) return String(val.timestampValue ?? '');
  if ('arrayValue' in val) {
    const list = val.arrayValue?.values;
    return Array.isArray(list) ? list.map((item) => decodeFirestoreRestValue(item)) : [];
  }
  if ('mapValue' in val) {
    return decodeFirestoreRestFields(val.mapValue?.fields);
  }
  return null;
}

export function decodeFirestoreRestFields(
  fields: Record<string, FirestoreRestValue> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreRestValue(v);
    }
  }
  return out;
}

export function encodeFirestoreRestValue(value: unknown): FirestoreRestValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { integerValue: '0' };
    }
    if (Number.isSafeInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    const values = value
      .filter((item) => item !== undefined)
      .map((item) => encodeFirestoreRestValue(item));
    return { arrayValue: values.length > 0 ? { values } : {} };
  }
  if (typeof value === 'object') {
    const fields = encodeFirestoreRestFields(value as Record<string, unknown>);
    return { mapValue: Object.keys(fields).length > 0 ? { fields } : {} };
  }
  return { stringValue: String(value) };
}

export function encodeFirestoreRestFields(
  obj: Record<string, unknown>
): Record<string, FirestoreRestValue> {
  const fields: Record<string, FirestoreRestValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = encodeFirestoreRestValue(v);
  }
  return fields;
}

export function buildRestSetWrite(
  relativePath: string,
  dataWithoutServerTimestamps: Record<string, unknown>,
  serverTimestampFields: string[] = ['createdAt', 'updatedAt'],
  preconditionExists?: boolean
): RestWriteOp {
  const write: Extract<RestWriteOp, { update: unknown }> = {
    update: {
      name: buildFirestoreDocumentName(relativePath),
      fields: encodeFirestoreRestFields(dataWithoutServerTimestamps),
    },
  };
  if (serverTimestampFields.length > 0) {
    write.updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }
  if (typeof preconditionExists === 'boolean') {
    write.currentDocument = { exists: preconditionExists };
  }
  return write;
}

export function buildRestUpdateWrite(
  relativePath: string,
  patchWithoutServerTimestamps: Record<string, unknown>,
  serverTimestampFields: string[] = ['updatedAt']
): RestWriteOp {
  const encodedFields = encodeFirestoreRestFields(patchWithoutServerTimestamps);
  const write: Extract<RestWriteOp, { update: unknown }> = {
    update: {
      name: buildFirestoreDocumentName(relativePath),
      fields: encodedFields,
    },
    updateMask: {
      fieldPaths: Object.keys(encodedFields),
    },
    currentDocument: { exists: true },
  };
  if (serverTimestampFields.length > 0) {
    write.updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }
  return write;
}

export function buildRestDeleteWrite(relativePath: string): RestWriteOp {
  return {
    delete: buildFirestoreDocumentName(relativePath),
  };
}

async function getBearerHeaders(
  withAuth: boolean,
  explicitUser?: User | null
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!withAuth) return headers;
  const activeUser = explicitUser ?? auth.currentUser;
  if (!activeUser) {
    throw new FirestoreRestError(401, 'UNAUTHENTICATED', 'Session Firebase requise.');
  }
  const token = await activeUser.getIdToken();
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseRestError(res: Response): Promise<FirestoreRestError> {
  let code = `HTTP_${res.status}`;
  let message = `Erreur Firestore REST (${res.status})`;
  try {
    const body = (await res.json()) as {
      error?: { status?: string; message?: string };
    };
    if (body?.error?.status) code = body.error.status;
    if (body?.error?.message) message = body.error.message;
  } catch {
    // Ignore si le corps n'est pas du JSON
  }
  return new FirestoreRestError(res.status, code, message);
}

export async function restGetDocument(
  relativePath: string,
  options: { withAuth?: boolean; user?: User | null; signal?: AbortSignal } = {}
): Promise<{ exists: false } | { exists: true; data: Record<string, unknown> }> {
  const headers = await getBearerHeaders(Boolean(options.withAuth), options.user);
  const res = await fetch(buildDocumentUrl(relativePath), {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: options.signal,
  });
  if (res.status === 404) {
    return { exists: false };
  }
  if (!res.ok) {
    throw await parseRestError(res);
  }
  const json = (await res.json()) as {
    name?: string;
    fields?: Record<string, FirestoreRestValue>;
  };
  return {
    exists: true,
    data: decodeFirestoreRestFields(json.fields),
  };
}

export async function restRunCollectionQuery(
  parentRelativePath: string,
  collectionId: string,
  ownerId: string,
  options: { user?: User | null; signal?: AbortSignal } = {}
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const headers = await getBearerHeaders(true, options.user);
  headers['Content-Type'] = 'application/json';

  const res = await fetch(buildRunQueryUrl(parentRelativePath), {
    method: 'POST',
    headers,
    cache: 'no-store',
    signal: options.signal,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ownerId' },
            op: 'EQUAL',
            value: { stringValue: ownerId },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    throw await parseRestError(res);
  }

  const rows = (await res.json()) as Array<{
    document?: {
      name?: string;
      fields?: Record<string, FirestoreRestValue>;
      createTime?: string;
      updateTime?: string;
    };
  }>;

  if (!Array.isArray(rows)) return [];
  const results: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const item of rows) {
    if (!item.document?.name) continue;
    const id = item.document.name.split('/').pop() ?? '';
    if (!id) continue;
    const data = decodeFirestoreRestFields(item.document.fields);
    if (data.createdAt === undefined && item.document.createTime) {
      data.createdAt = item.document.createTime;
    }
    if (data.updatedAt === undefined && item.document.updateTime) {
      data.updatedAt = item.document.updateTime;
    }
    results.push({ id, data });
  }
  return results;
}

export async function restCommitWrites(
  writes: RestWriteOp[],
  options: { user?: User | null; signal?: AbortSignal } = {}
): Promise<void> {
  if (writes.length === 0) return;
  const CHUNK_SIZE = 350;
  for (let i = 0; i < writes.length; i += CHUNK_SIZE) {
    const chunk = writes.slice(i, i + CHUNK_SIZE);
    const headers = await getBearerHeaders(true, options.user);
    headers['Content-Type'] = 'application/json';

    const res = await fetch(buildCommitUrl(), {
      method: 'POST',
      headers,
      cache: 'no-store',
      signal: options.signal,
      body: JSON.stringify({ writes: chunk }),
    });
    if (!res.ok) {
      throw await parseRestError(res);
    }
  }
}
