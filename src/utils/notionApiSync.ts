import type {
  BlockItem,
  CellValue,
  DatabaseColumn,
  DatabaseRow,
  RowComment,
  TableBlockRow,
} from '../types/workspace';
import { isDirectAudioFileUrl } from './audio';
import { getExerciseScoreValue, normalizeExerciseScores } from './exerciseRanking';
import { IMPRO_COL_IDS, IMPRO_DB_IDS } from './improCsvLoader';
import { isYouTubeUrl } from './youtube';

export const DEFAULT_BIBLIMPRO_NOTION_DB_ID = '2e2ddc608f9980438568f6cda4766a95';

export interface NotionRichTextSpan {
  plain_text?: string;
  href?: string | null;
  text?: { content?: string; link?: { url?: string } | null };
}

export interface NotionApiBlock {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionApiBlock[];
  paragraph?: { rich_text?: NotionRichTextSpan[] };
  heading_1?: { rich_text?: NotionRichTextSpan[]; is_toggleable?: boolean };
  heading_2?: { rich_text?: NotionRichTextSpan[]; is_toggleable?: boolean };
  heading_3?: { rich_text?: NotionRichTextSpan[]; is_toggleable?: boolean };
  bulleted_list_item?: { rich_text?: NotionRichTextSpan[] };
  numbered_list_item?: { rich_text?: NotionRichTextSpan[] };
  to_do?: { rich_text?: NotionRichTextSpan[]; checked?: boolean };
  toggle?: { rich_text?: NotionRichTextSpan[] };
  quote?: { rich_text?: NotionRichTextSpan[] };
  callout?: {
    rich_text?: NotionRichTextSpan[];
    icon?: { type?: string; emoji?: string } | null;
  };
  code?: { rich_text?: NotionRichTextSpan[]; language?: string };
  table?: { table_width?: number; has_column_header?: boolean; has_row_header?: boolean };
  table_row?: { cells?: NotionRichTextSpan[][] };
  bookmark?: { url?: string; caption?: NotionRichTextSpan[] };
  embed?: { url?: string; caption?: NotionRichTextSpan[] };
  link_preview?: { url?: string };
  video?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string; expiry_time?: string };
    caption?: NotionRichTextSpan[];
  };
  audio?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string; expiry_time?: string };
    caption?: NotionRichTextSpan[];
  };
  image?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string; expiry_time?: string };
    caption?: NotionRichTextSpan[];
  };
  file?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string; expiry_time?: string };
    caption?: NotionRichTextSpan[];
    name?: string;
  };
  pdf?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string; expiry_time?: string };
    caption?: NotionRichTextSpan[];
  };
  child_page?: { title?: string };
  child_database?: { title?: string };
}

export interface NotionApiComment {
  id: string;
  created_time: string;
  created_by?: { id?: string; object?: string; name?: string };
  rich_text?: NotionRichTextSpan[];
}

export interface NotionApiPropertyValue {
  id?: string;
  type: string;
  title?: NotionRichTextSpan[];
  rich_text?: NotionRichTextSpan[];
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  checkbox?: boolean;
  relation?: Array<{ id: string }>;
  url?: string | null;
  number?: number | null;
  date?: { start?: string; end?: string | null } | null;
}

export interface NotionApiPage {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionApiPropertyValue>;
}

export interface NotionExercisePropertiesPayload {
  nom: string;
  etapes: string[];
  tags: string[];
  description: string;
  check1?: boolean;
  check2?: boolean;
  checkV?: boolean;
  seanceNotionIds: string[];
}

export interface NotionExerciseSyncPayload {
  notionPageId: string;
  notionUrl?: string;
  lastEditedTime?: string;
  properties: NotionExercisePropertiesPayload;
  blocks: BlockItem[];
  comments: RowComment[];
}

export interface NotionSyncStatusResponse {
  configured: boolean;
  reachable: boolean;
  defaultDatabaseId: string;
  databaseId?: string;
  databaseTitle?: string;
  error?: string;
}

export interface NotionSyncMergeSummary {
  updatedCount: number;
  createdCount: number;
  unchangedCount: number;
  blocksSyncedCount: number;
  commentsSyncedCount: number;
  syncedAt: string;
}

export function compactNotionUuid(raw: string): string {
  return raw.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

export function formatNotionUuid(raw: string): string | null {
  const hex = compactNotionUuid(raw);
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function extractNotionUuid(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const directHex = compactNotionUuid(trimmed);
  if (/^[a-f0-9]{32}$/.test(directHex) && /^[a-fA-F0-9-]+$/.test(trimmed)) {
    return directHex;
  }

  try {
    const parsed = new URL(trimmed);
    const pathMatches = parsed.pathname.match(/[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g);
    if (pathMatches && pathMatches.length > 0) {
      const hex = compactNotionUuid(pathMatches[pathMatches.length - 1]);
      if (hex.length === 32) return hex;
    }
  } catch {
    // Fallback regex extraction if partial URL or string with UUID
  }

  const fallbackMatches = trimmed.match(/[a-fA-F0-9]{32}|[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/g);
  if (fallbackMatches && fallbackMatches.length > 0) {
    const hex = compactNotionUuid(fallbackMatches[fallbackMatches.length - 1]);
    if (hex.length === 32) return hex;
  }
  return null;
}

export function isSafeHttpUrl(raw: string | undefined | null): raw is string {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function normalizeExerciseMatchKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePropertyKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function richTextToPlainString(spans?: NotionRichTextSpan[]): string {
  if (!Array.isArray(spans) || spans.length === 0) return '';
  return spans
    .map((span) => {
      if (typeof span?.plain_text === 'string') return span.plain_text;
      if (typeof span?.text?.content === 'string') return span.text.content;
      return '';
    })
    .join('');
}

function flattenChildrenToText(children: NotionApiBlock[] | undefined, depth = 0): string {
  if (!Array.isArray(children) || children.length === 0) return '';
  const indent = depth > 0 ? '  '.repeat(Math.min(depth, 4)) : '';
  const lines: string[] = [];

  for (const child of children) {
    if (!child) continue;
    const t = child.type;
    if (t === 'paragraph') {
      const txt = richTextToPlainString(child.paragraph?.rich_text).trim();
      if (txt) lines.push(`${indent}${txt}`);
    } else if (t === 'heading_1' || t === 'heading_2' || t === 'heading_3') {
      const txt = richTextToPlainString(child[t]?.rich_text).trim();
      if (txt) lines.push(`${indent}${txt}`);
    } else if (t === 'bulleted_list_item') {
      const txt = richTextToPlainString(child.bulleted_list_item?.rich_text).trim();
      if (txt) lines.push(`${indent}• ${txt}`);
    } else if (t === 'numbered_list_item') {
      const txt = richTextToPlainString(child.numbered_list_item?.rich_text).trim();
      if (txt) lines.push(`${indent}- ${txt}`);
    } else if (t === 'to_do') {
      const txt = richTextToPlainString(child.to_do?.rich_text).trim();
      const mark = child.to_do?.checked ? '[x]' : '[ ]';
      if (txt) lines.push(`${indent}${mark} ${txt}`);
    } else if (t === 'quote') {
      const txt = richTextToPlainString(child.quote?.rich_text).trim();
      if (txt) lines.push(`${indent}« ${txt} »`);
    } else if (t === 'callout') {
      const txt = richTextToPlainString(child.callout?.rich_text).trim();
      const icon = child.callout?.icon?.emoji ?? '💡';
      if (txt) lines.push(`${indent}${icon} ${txt}`);
    } else if (t === 'toggle') {
      const txt = richTextToPlainString(child.toggle?.rich_text).trim();
      if (txt) lines.push(`${indent}▸ ${txt}`);
    } else if (t === 'code') {
      const txt = richTextToPlainString(child.code?.rich_text).trim();
      if (txt) lines.push(`${indent}${txt}`);
    } else if (t === 'divider') {
      lines.push(`${indent}---`);
    } else if (t === 'bookmark' && isSafeHttpUrl(child.bookmark?.url)) {
      const cap = richTextToPlainString(child.bookmark?.caption).trim();
      lines.push(`${indent}${cap ? `${cap} : ` : ''}${child.bookmark.url}`);
    } else if (t === 'embed' && isSafeHttpUrl(child.embed?.url)) {
      lines.push(`${indent}${child.embed.url}`);
    }

    if (Array.isArray(child.children) && child.children.length > 0) {
      const nested = flattenChildrenToText(child.children, depth + 1);
      if (nested) lines.push(nested);
    }
  }

  return lines.join('\n').slice(0, 10000);
}

function collectNestedMediaBlocks(
  children: NotionApiBlock[] | undefined,
  out: BlockItem[]
): void {
  if (!Array.isArray(children) || children.length === 0) return;
  for (const child of children) {
    if (!child) continue;
    const mapped = mapSingleNotionBlock(child, false);
    for (const m of mapped) {
      if (m.type === 'youtube' || m.type === 'audio' || m.type === 'table') {
        out.push(m);
      }
    }
    if (
      child.type !== 'toggle' &&
      child.type !== 'callout' &&
      Array.isArray(child.children) &&
      child.children.length > 0
    ) {
      collectNestedMediaBlocks(child.children, out);
    }
  }
}

function buildMediaUrlOrProxy(
  blockId: string,
  mediaObj?: {
    type?: 'external' | 'file';
    external?: { url?: string };
    file?: { url?: string };
  }
): string | null {
  if (!mediaObj) return null;
  if (mediaObj.type === 'external' && isSafeHttpUrl(mediaObj.external?.url)) {
    return mediaObj.external.url.trim().slice(0, 2000);
  }
  if (mediaObj.type === 'file' || isSafeHttpUrl(mediaObj.file?.url)) {
    const compact = compactNotionUuid(blockId);
    if (compact.length === 32) {
      return `/api/notion/media/${compact}`;
    }
    if (isSafeHttpUrl(mediaObj.file?.url)) {
      return mediaObj.file.url.trim().slice(0, 2000);
    }
  }
  if (isSafeHttpUrl(mediaObj.external?.url)) {
    return mediaObj.external.url.trim().slice(0, 2000);
  }
  return null;
}

function mapSingleNotionBlock(block: NotionApiBlock, includeChildren = true): BlockItem[] {
  const compactId = compactNotionUuid(block.id) || block.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const baseId = `nblk_${compactId}`.slice(0, 120);
  const out: BlockItem[] = [];

  const pushChildBlocks = (children?: NotionApiBlock[]) => {
    if (!includeChildren || !Array.isArray(children) || children.length === 0) return;
    for (const child of children) {
      out.push(...mapSingleNotionBlock(child, true));
    }
  };

  switch (block.type) {
    case 'paragraph': {
      const content = richTextToPlainString(block.paragraph?.rich_text).trim();
      const singleLine = content && !content.includes('\n');
      if (singleLine && isYouTubeUrl(content)) {
        out.push({ id: baseId, type: 'youtube', url: content.slice(0, 2000), content: '' });
      } else if (singleLine && isDirectAudioFileUrl(content)) {
        out.push({ id: baseId, type: 'audio', url: content.slice(0, 2000), content: '' });
      } else {
        out.push({ id: baseId, type: 'paragraph', content: content.slice(0, 20000) });
      }
      pushChildBlocks(block.children);
      break;
    }

    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const data = block[block.type];
      const content = richTextToPlainString(data?.rich_text).trim();
      const flowType =
        block.type === 'heading_1'
          ? 'heading1'
          : block.type === 'heading_2'
            ? 'heading2'
            : 'heading3';
      if (data?.is_toggleable && Array.isArray(block.children) && block.children.length > 0) {
        const details = flattenChildrenToText(block.children);
        out.push({
          id: baseId,
          type: 'toggle',
          content: content.slice(0, 20000),
          details,
          isOpen: false,
        });
        collectNestedMediaBlocks(block.children, out);
      } else {
        out.push({ id: baseId, type: flowType, content: content.slice(0, 20000) });
        pushChildBlocks(block.children);
      }
      break;
    }

    case 'bulleted_list_item': {
      const content = richTextToPlainString(block.bulleted_list_item?.rich_text).trim();
      out.push({ id: baseId, type: 'bullet', content: content.slice(0, 20000) });
      pushChildBlocks(block.children);
      break;
    }

    case 'numbered_list_item': {
      const content = richTextToPlainString(block.numbered_list_item?.rich_text).trim();
      out.push({ id: baseId, type: 'numbered', content: content.slice(0, 20000) });
      pushChildBlocks(block.children);
      break;
    }

    case 'to_do': {
      const content = richTextToPlainString(block.to_do?.rich_text).trim();
      out.push({
        id: baseId,
        type: 'todo',
        checked: Boolean(block.to_do?.checked),
        content: content.slice(0, 20000),
      });
      pushChildBlocks(block.children);
      break;
    }

    case 'toggle': {
      const content = richTextToPlainString(block.toggle?.rich_text).trim() || 'Détails';
      const details = flattenChildrenToText(block.children);
      out.push({
        id: baseId,
        type: 'toggle',
        content: content.slice(0, 20000),
        details,
        isOpen: false,
      });
      if (includeChildren) {
        collectNestedMediaBlocks(block.children, out);
      }
      break;
    }

    case 'quote': {
      const main = richTextToPlainString(block.quote?.rich_text).trim();
      const childText = flattenChildrenToText(block.children);
      const combined = [main, childText].filter(Boolean).join('\n').slice(0, 20000);
      out.push({ id: baseId, type: 'quote', content: combined });
      if (includeChildren) {
        collectNestedMediaBlocks(block.children, out);
      }
      break;
    }

    case 'callout': {
      const main = richTextToPlainString(block.callout?.rich_text).trim();
      const childText = flattenChildrenToText(block.children);
      const combined = [main, childText].filter(Boolean).join('\n').slice(0, 20000);
      const icon = (block.callout?.icon?.emoji ?? '💡').slice(0, 16) || '💡';
      out.push({ id: baseId, type: 'callout', icon, content: combined });
      if (includeChildren) {
        collectNestedMediaBlocks(block.children, out);
      }
      break;
    }

    case 'code': {
      const content = richTextToPlainString(block.code?.rich_text);
      const language = String(block.code?.language || 'texte').slice(0, 40) || 'texte';
      out.push({ id: baseId, type: 'code', language, content: content.slice(0, 20000) });
      break;
    }

    case 'divider': {
      out.push({ id: baseId, type: 'divider', content: '' });
      break;
    }

    case 'table': {
      const rowBlocks = (block.children ?? []).filter((c) => c.type === 'table_row');
      const tableRows: TableBlockRow[] = rowBlocks.slice(0, 100).map((row) => ({
        cells: (row.table_row?.cells ?? [])
          .slice(0, 20)
          .map((cellSpans) => richTextToPlainString(cellSpans).trim().slice(0, 1000)),
      }));
      if (tableRows.length > 0) {
        out.push({
          id: baseId,
          type: 'table',
          content: 'Tableau',
          tableRows,
        });
      }
      break;
    }

    case 'audio': {
      const url = buildMediaUrlOrProxy(block.id, block.audio);
      const caption = richTextToPlainString(block.audio?.caption).trim().slice(0, 20000);
      if (url) {
        out.push({ id: baseId, type: 'audio', url, content: caption });
      }
      break;
    }

    case 'video': {
      const url = buildMediaUrlOrProxy(block.id, block.video);
      const caption = richTextToPlainString(block.video?.caption).trim().slice(0, 20000);
      if (url) {
        if (isYouTubeUrl(url)) {
          out.push({ id: baseId, type: 'youtube', url, content: caption });
        } else if (isDirectAudioFileUrl(url)) {
          out.push({ id: baseId, type: 'audio', url, content: caption });
        } else {
          out.push({ id: baseId, type: 'bookmark', url, content: caption || 'Vidéo' });
        }
      }
      break;
    }

    case 'embed':
    case 'bookmark':
    case 'link_preview': {
      const rawUrl =
        block.type === 'embed'
          ? block.embed?.url
          : block.type === 'bookmark'
            ? block.bookmark?.url
            : block.link_preview?.url;
      const caption =
        block.type === 'embed'
          ? richTextToPlainString(block.embed?.caption).trim()
          : block.type === 'bookmark'
            ? richTextToPlainString(block.bookmark?.caption).trim()
            : '';
      if (isSafeHttpUrl(rawUrl)) {
        const cleanUrl = rawUrl.trim().slice(0, 2000);
        if (isYouTubeUrl(cleanUrl)) {
          out.push({ id: baseId, type: 'youtube', url: cleanUrl, content: caption.slice(0, 20000) });
        } else if (isDirectAudioFileUrl(cleanUrl)) {
          out.push({ id: baseId, type: 'audio', url: cleanUrl, content: caption.slice(0, 20000) });
        } else {
          out.push({
            id: baseId,
            type: 'bookmark',
            url: cleanUrl,
            content: (caption || cleanUrl).slice(0, 20000),
          });
        }
      }
      break;
    }

    case 'image': {
      const url = buildMediaUrlOrProxy(block.id, block.image);
      const caption = richTextToPlainString(block.image?.caption).trim();
      if (url) {
        out.push({
          id: baseId,
          type: 'bookmark',
          url,
          content: (caption ? `Image : ${caption}` : 'Image Notion').slice(0, 20000),
        });
      }
      break;
    }

    case 'file':
    case 'pdf': {
      const mediaObj = block.type === 'file' ? block.file : block.pdf;
      const url = buildMediaUrlOrProxy(block.id, mediaObj);
      const caption = richTextToPlainString(mediaObj?.caption).trim();
      const fileName = block.type === 'file' ? block.file?.name?.trim() : undefined;
      const label = caption || fileName || (block.type === 'pdf' ? 'Document PDF' : 'Fichier Notion');
      if (url) {
        if (isDirectAudioFileUrl(url) || (fileName && isDirectAudioFileUrl(`https://example.com/${fileName}`))) {
          out.push({ id: baseId, type: 'audio', url, content: label.slice(0, 20000) });
        } else {
          out.push({ id: baseId, type: 'bookmark', url, content: label.slice(0, 20000) });
        }
      }
      break;
    }

    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'template': {
      pushChildBlocks(block.children);
      break;
    }

    case 'child_page': {
      const title = block.child_page?.title?.trim();
      if (title) {
        out.push({ id: baseId, type: 'paragraph', content: `📄 ${title}`.slice(0, 20000) });
      }
      break;
    }

    case 'child_database': {
      const title = block.child_database?.title?.trim();
      if (title) {
        out.push({ id: baseId, type: 'paragraph', content: `🗂️ ${title}`.slice(0, 20000) });
      }
      break;
    }

    default: {
      const rawObj = (block as unknown as Record<string, unknown>)[block.type] as
        | { rich_text?: NotionRichTextSpan[] }
        | undefined;
      const fallbackText = richTextToPlainString(rawObj?.rich_text).trim();
      if (fallbackText) {
        out.push({ id: baseId, type: 'paragraph', content: fallbackText.slice(0, 20000) });
      }
      pushChildBlocks(block.children);
      break;
    }
  }

  return out;
}

export function mapNotionBlocksToFlownoteBlocks(notionBlocks: NotionApiBlock[]): BlockItem[] {
  const mapped: BlockItem[] = [];
  for (const block of notionBlocks) {
    mapped.push(...mapSingleNotionBlock(block, true));
    if (mapped.length >= 400) break;
  }

  // Ensure deterministic unique IDs even if nested expansions repeat
  const seen = new Set<string>();
  return mapped
    .filter((b) => !(b.type === 'paragraph' && b.content.trim() === '' && mapped.length > 1))
    .slice(0, 400)
    .map((b, idx) => {
      let candidate = b.id;
      if (seen.has(candidate)) {
        candidate = `${b.id}_${idx}`.slice(0, 128);
      }
      seen.add(candidate);
      return { ...b, id: candidate };
    });
}

export function mapNotionCommentsToRowComments(
  comments: NotionApiComment[],
  resolvedAuthors?: Record<string, string>
): RowComment[] {
  const out: RowComment[] = [];
  const seen = new Set<string>();

  for (const c of comments) {
    const content = richTextToPlainString(c.rich_text).trim();
    if (!content) continue;
    const compactId = compactNotionUuid(c.id) || c.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const id = `ncmt_${compactId}`.slice(0, 128);
    if (seen.has(id)) continue;
    seen.add(id);

    const userId = c.created_by?.id ?? '';
    const authorName =
      c.created_by?.name?.trim() ||
      (userId && resolvedAuthors?.[userId]?.trim()) ||
      'Notion';

    out.push({
      id,
      authorName: authorName.slice(0, 80),
      content: content.slice(0, 2000),
      createdAt: String(c.created_time || new Date().toISOString()).slice(0, 64),
    });
    if (out.length >= 100) break;
  }

  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function extractBiblimproPropertiesFromNotionPage(
  page: NotionApiPage
): NotionExercisePropertiesPayload {
  const props = page.properties ?? {};
  let nom = '';
  let etapes: string[] = [];
  let tags: string[] = [];
  let description = '';
  let check1: boolean | undefined;
  let check2: boolean | undefined;
  let checkV: boolean | undefined;
  let seanceNotionIds: string[] = [];

  for (const [rawName, prop] of Object.entries(props)) {
    if (!prop) continue;
    const key = normalizePropertyKey(rawName);

    if (prop.type === 'title') {
      const titleText = richTextToPlainString(prop.title).trim();
      if (!nom || key === 'nom' || key === 'name' || key === 'titre' || key === 'exercice') {
        nom = titleText;
      }
      continue;
    }

    if (key === 'etape' || key === 'etapes') {
      if (prop.type === 'multi_select') {
        etapes = (prop.multi_select ?? []).map((o) => String(o.name ?? '').trim()).filter(Boolean);
      } else if (prop.type === 'select' && prop.select?.name) {
        etapes = [prop.select.name.trim()];
      }
      continue;
    }

    if (key === 'tag' || key === 'tags') {
      if (prop.type === 'multi_select') {
        tags = (prop.multi_select ?? []).map((o) => String(o.name ?? '').trim()).filter(Boolean);
      } else if (prop.type === 'select' && prop.select?.name) {
        tags = [prop.select.name.trim()];
      }
      continue;
    }

    if (key === 'description' || key === 'consigne' || key === 'consignes') {
      if (prop.type === 'rich_text') {
        description = richTextToPlainString(prop.rich_text).trim();
      }
      continue;
    }

    if (key === '1' || key === 'niveau 1') {
      if (prop.type === 'checkbox') check1 = Boolean(prop.checkbox);
      continue;
    }

    if (key === '2' || key === 'niveau 2') {
      if (prop.type === 'checkbox') check2 = Boolean(prop.checkbox);
      continue;
    }

    if (key === 'v' || key === 'valide') {
      if (prop.type === 'checkbox') checkV = Boolean(prop.checkbox);
      continue;
    }

    if (key === 'seances' || key === 'seance') {
      if (prop.type === 'relation') {
        seanceNotionIds = (prop.relation ?? [])
          .map((rel) => compactNotionUuid(rel.id))
          .filter((id) => id.length === 32);
      }
      continue;
    }
  }

  return {
    nom: nom.slice(0, 200) || 'Exercice sans titre',
    etapes,
    tags,
    description: description.slice(0, 5000),
    check1,
    check2,
    checkV,
    seanceNotionIds,
  };
}

/**
 * Fusionne des blocs Notion dans une fiche existante en respectant le choix :
 * "Ajouter le contenu Notion à la suite" sans dupliquer les blocs déjà importés.
 */
export function mergeBlocksAppendNotion(
  existingBlocks: BlockItem[],
  notionBlocks: BlockItem[]
): BlockItem[] {
  const cleanedExisting =
    existingBlocks.length === 1 &&
    existingBlocks[0].type === 'paragraph' &&
    existingBlocks[0].content.trim() === ''
      ? []
      : existingBlocks;

  if (notionBlocks.length === 0) return cleanedExisting;

  const incomingById = new Map(notionBlocks.map((b) => [b.id, b]));
  const updatedExisting = cleanedExisting.map((blk) => {
    if (!blk.id.startsWith('nblk_')) return blk;
    const fresh = incomingById.get(blk.id);
    return fresh ? fresh : blk;
  });

  const existingIdSet = new Set(updatedExisting.map((b) => b.id));
  const newNotionBlocks = notionBlocks.filter((b) => !existingIdSet.has(b.id));

  return [...updatedExisting, ...newNotionBlocks].slice(0, 400);
}

export function mergeCommentsWithNotion(
  existingComments: RowComment[],
  notionComments: RowComment[]
): RowComment[] {
  if (notionComments.length === 0) return existingComments;
  const incomingById = new Map(notionComments.map((c) => [c.id, c]));
  const updatedExisting = existingComments.map((c) => {
    if (!c.id.startsWith('ncmt_')) return c;
    return incomingById.get(c.id) ?? c;
  });
  const seen = new Set(updatedExisting.map((c) => c.id));
  const additions = notionComments.filter((c) => !seen.has(c.id));
  return [...updatedExisting, ...additions].slice(0, 100);
}

export function resolveSeanceIdsFromNotion(
  seanceNotionIds: string[],
  existingSeanceRows: DatabaseRow[]
): string[] {
  if (seanceNotionIds.length === 0 || existingSeanceRows.length === 0) return [];
  const rowIdSet = new Set(existingSeanceRows.map((r) => r.id));
  const byNotionPageId = new Map<string, string>();
  for (const r of existingSeanceRows) {
    if (r.notionPageId) {
      byNotionPageId.set(compactNotionUuid(r.notionPageId), r.id);
    }
  }

  const matched: string[] = [];
  for (const nId of seanceNotionIds) {
    const compact = compactNotionUuid(nId);
    const directRowId = byNotionPageId.get(compact);
    if (directRowId) {
      matched.push(directRowId);
      continue;
    }
    const canonicalCsvId = `sea_${compact.slice(0, 24)}`;
    if (rowIdSet.has(canonicalCsvId)) {
      matched.push(canonicalCsvId);
    }
  }
  return Array.from(new Set(matched));
}

export function mergeBiblimproNotionBatch(params: {
  payloads: NotionExerciseSyncPayload[];
  existingExerciseRows: DatabaseRow[];
  existingSeanceRows: DatabaseRow[];
  existingColumns: DatabaseColumn[];
  legacyBlocksByRowId?: Map<string, BlockItem[]>;
  workspaceId: string;
  ownerId: string;
  syncedAt?: string;
}): {
  nextRows: DatabaseRow[];
  changedRows: DatabaseRow[];
  newRowKeys: Set<string>;
  nextColumns: DatabaseColumn[];
  columnsChanged: boolean;
  summary: NotionSyncMergeSummary;
} {
  const {
    payloads,
    existingExerciseRows,
    existingSeanceRows,
    existingColumns,
    legacyBlocksByRowId,
    workspaceId,
    ownerId,
  } = params;
  const syncedAt = params.syncedAt ?? new Date().toISOString();

  const workingRows = [...existingExerciseRows];
  const byNotionId = new Map<string, number>();
  const byNormalizedName = new Map<string, number>();

  workingRows.forEach((r, idx) => {
    if (r.notionPageId) {
      byNotionId.set(compactNotionUuid(r.notionPageId), idx);
    }
    const nameKey = normalizeExerciseMatchKey(String(r.cells[IMPRO_COL_IDS.exercices.nom] ?? ''));
    if (nameKey && !byNormalizedName.has(nameKey)) {
      byNormalizedName.set(nameKey, idx);
    }
  });

  const changedIndices = new Set<number>();
  const newRowKeys = new Set<string>();
  let updatedCount = 0;
  let createdCount = 0;
  let unchangedCount = 0;
  let blocksSyncedCount = 0;
  let commentsSyncedCount = 0;

  let maxOrder = workingRows.reduce((m, r) => (r.order > m ? r.order : m), -1);
  let nextNewScore = Math.max(
    workingRows.length,
    workingRows.reduce((m, r) => Math.max(m, getExerciseScoreValue(r) ?? 0), 0)
  );

  const discoveredEtapes = new Set<string>();
  const discoveredTags = new Set<string>();

  for (const item of payloads) {
    const compactPageId = compactNotionUuid(item.notionPageId);
    const nameKey = normalizeExerciseMatchKey(item.properties.nom);

    item.properties.etapes.forEach((e) => discoveredEtapes.add(e));
    item.properties.tags.forEach((t) => discoveredTags.add(t));
    blocksSyncedCount += item.blocks.length;
    commentsSyncedCount += item.comments.length;

    let matchIdx = byNotionId.get(compactPageId);
    if (matchIdx === undefined && nameKey) {
      matchIdx = byNormalizedName.get(nameKey);
    }

    const mappedSeanceIds = resolveSeanceIdsFromNotion(
      item.properties.seanceNotionIds,
      existingSeanceRows
    );

    if (matchIdx !== undefined) {
      const existing = workingRows[matchIdx];
      const rawExistingSeances = existing.cells[IMPRO_COL_IDS.exercices.seances];
      const existingSeances = Array.isArray(rawExistingSeances)
        ? rawExistingSeances.map(String).filter(Boolean)
        : [];
      const mergedSeances = Array.from(new Set([...existingSeances, ...mappedSeanceIds]));

      const nextCells: Record<string, CellValue> = {
        ...existing.cells,
        [IMPRO_COL_IDS.exercices.nom]: item.properties.nom,
        [IMPRO_COL_IDS.exercices.etape]: item.properties.etapes,
        [IMPRO_COL_IDS.exercices.tags]: item.properties.tags,
        [IMPRO_COL_IDS.exercices.description]: item.properties.description,
        ...(item.properties.check1 !== undefined
          ? { [IMPRO_COL_IDS.exercices.check1]: item.properties.check1 }
          : {}),
        ...(item.properties.check2 !== undefined
          ? { [IMPRO_COL_IDS.exercices.check2]: item.properties.check2 }
          : {}),
        ...(item.properties.checkV !== undefined
          ? { [IMPRO_COL_IDS.exercices.checkV]: item.properties.checkV }
          : {}),
        ...(mergedSeances.length > 0 ? { [IMPRO_COL_IDS.exercices.seances]: mergedSeances } : {}),
      };

      const baseBlocks =
        existing.blocks ??
        (legacyBlocksByRowId ? legacyBlocksByRowId.get(existing.id) ?? [] : []);
      const nextBlocks = mergeBlocksAppendNotion(baseBlocks, item.blocks);
      const nextComments = mergeCommentsWithNotion(existing.comments ?? [], item.comments);

      const updatedRow: DatabaseRow = {
        ...existing,
        cells: nextCells,
        blocks: nextBlocks,
        comments: nextComments,
        notionPageId: compactPageId,
        notionSyncedAt: syncedAt,
      };

      const hasChanged =
        existing.notionPageId !== updatedRow.notionPageId ||
        !existing.notionSyncedAt ||
        JSON.stringify(existing.cells) !== JSON.stringify(updatedRow.cells) ||
        JSON.stringify(existing.blocks ?? []) !== JSON.stringify(updatedRow.blocks ?? []) ||
        JSON.stringify(existing.comments ?? []) !== JSON.stringify(updatedRow.comments ?? []);

      if (hasChanged) {
        workingRows[matchIdx] = updatedRow;
        changedIndices.add(matchIdx);
        updatedCount++;
      } else {
        // Still update notionSyncedAt silently if desired? Keep unchangedCount accurate!
        unchangedCount++;
      }
      byNotionId.set(compactPageId, matchIdx);
    } else {
      maxOrder += 1;
      nextNewScore += 1;
      const newRowId = `ex_notion_${compactPageId.slice(0, 24)}`;
      const newRow: DatabaseRow = {
        id: newRowId,
        pageId: IMPRO_DB_IDS.exercices,
        workspaceId,
        ownerId,
        order: maxOrder,
        cells: {
          [IMPRO_COL_IDS.exercices.nom]: item.properties.nom,
          [IMPRO_COL_IDS.exercices.score]: nextNewScore,
          [IMPRO_COL_IDS.exercices.check1]: Boolean(item.properties.check1),
          [IMPRO_COL_IDS.exercices.check2]: Boolean(item.properties.check2),
          [IMPRO_COL_IDS.exercices.checkV]: Boolean(item.properties.checkV),
          [IMPRO_COL_IDS.exercices.etape]: item.properties.etapes,
          [IMPRO_COL_IDS.exercices.tags]: item.properties.tags,
          [IMPRO_COL_IDS.exercices.description]: item.properties.description,
          [IMPRO_COL_IDS.exercices.seances]: mappedSeanceIds,
          [IMPRO_COL_IDS.exercices.utilisations]: mappedSeanceIds.length,
        },
        linkedPageId: null,
        blocks: item.blocks,
        comments: item.comments,
        notionPageId: compactPageId,
        notionSyncedAt: syncedAt,
      };
      const nextIdx = workingRows.length;
      workingRows.push(newRow);
      changedIndices.add(nextIdx);
      newRowKeys.add(`${IMPRO_DB_IDS.exercices}::${newRowId}`);
      byNotionId.set(compactPageId, nextIdx);
      if (nameKey) byNormalizedName.set(nameKey, nextIdx);
      createdCount++;
    }
  }

  let columnsChanged = false;
  const nextColumns = existingColumns.map((col) => {
    if (col.id === IMPRO_COL_IDS.exercices.etape && discoveredEtapes.size > 0) {
      const merged = Array.from(new Set([...(col.options ?? []), ...discoveredEtapes])).slice(0, 100);
      if (merged.length !== (col.options ?? []).length) {
        columnsChanged = true;
        return { ...col, options: merged };
      }
    }
    if (col.id === IMPRO_COL_IDS.exercices.tags && discoveredTags.size > 0) {
      const merged = Array.from(new Set([...(col.options ?? []), ...discoveredTags])).slice(0, 100);
      if (merged.length !== (col.options ?? []).length) {
        columnsChanged = true;
        return { ...col, options: merged };
      }
    }
    return col;
  });

  const hadAnyExistingScore = existingExerciseRows.some(
    (r) => getExerciseScoreValue(r) !== null
  );
  let finalRows = workingRows;
  const changedRowById = new Map<string, DatabaseRow>();
  for (const i of changedIndices) {
    const r = workingRows[i];
    if (r) changedRowById.set(r.id, r);
  }

  if (hadAnyExistingScore) {
    const normalized = normalizeExerciseScores(workingRows);
    finalRows = normalized.nextRows;
    for (const r of normalized.changedRows) {
      changedRowById.set(r.id, r);
    }
  }

  const changedRows = Array.from(changedRowById.values());

  return {
    nextRows: finalRows,
    changedRows,
    newRowKeys,
    nextColumns,
    columnsChanged,
    summary: {
      updatedCount,
      createdCount,
      unchangedCount,
      blocksSyncedCount,
      commentsSyncedCount,
      syncedAt,
    },
  };
}
