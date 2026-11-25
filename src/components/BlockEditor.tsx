import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Info,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Plus,
  Smile,
  Table,
  Text,
  Trash2,
  Video,
  Volume2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useColumnDrag } from '../hooks/useColumnDrag';
import type { BlockItem, BlockType, TableBlockRow, WorkspacePage } from '../types/workspace';
import { isDirectAudioFileUrl, isValidAudioUrl } from '../utils/audio';
import { reorderByIndex } from '../utils/columnOrder';
import { generateId } from '../utils/id';
import { parseNotionHtml, parseNotionMarkdown } from '../utils/notionImporter';
import { buildYouTubeEmbedUrl, isYouTubeUrl } from '../utils/youtube';
import { AudioPlayerBar } from './AudioPlayerBar';
import { EmojiPicker } from './EmojiPicker';

interface BlockEditorProps {
  page?: WorkspacePage;
  blocks?: BlockItem[];
  onChangeBlocks?: (next: BlockItem[]) => void;
  editorKey?: string;
  titleForPaste?: string;
  embedded?: boolean;
  emptyPlaceholder?: string;
}

interface SlashOption {
  type: BlockType;
  label: string;
  keywords: string;
  icon: typeof Text;
}

const SLASH_OPTIONS: SlashOption[] = [
  { type: 'paragraph', label: 'Texte', keywords: 'texte paragraphe', icon: Text },
  { type: 'heading1', label: 'Titre 1', keywords: 'titre h1 grand', icon: Heading1 },
  { type: 'heading2', label: 'Titre 2', keywords: 'titre h2 moyen', icon: Heading2 },
  { type: 'heading3', label: 'Titre 3', keywords: 'titre h3 petit', icon: Heading3 },
  { type: 'todo', label: 'Liste à cocher', keywords: 'tache case a cocher todo checklist', icon: ListChecks },
  { type: 'youtube', label: 'Vidéo YouTube', keywords: 'youtube video embed media lien', icon: Video },
  { type: 'audio', label: 'Lecteur audio', keywords: 'audio son mp3 musique lecteur wav m4a', icon: Volume2 },
  { type: 'bullet', label: 'Liste à puces', keywords: 'liste puce bullet', icon: List },
  { type: 'numbered', label: 'Liste numérotée', keywords: 'numero liste ordonnee', icon: ListOrdered },
  { type: 'toggle', label: 'Liste dépliante', keywords: 'depliant toggle accordeon', icon: ChevronRight },
  { type: 'callout', label: 'Encadré', keywords: 'encadre note callout aside', icon: MessageSquareQuote },
  { type: 'quote', label: 'Citation', keywords: 'citation quote', icon: MessageSquareQuote },
  { type: 'table', label: 'Tableau simple', keywords: 'tableau table grille', icon: Table },
  { type: 'bookmark', label: 'Signet', keywords: 'signet lien url bookmark', icon: Link2 },
  { type: 'code', label: 'Code', keywords: 'code script', icon: Code2 },
  { type: 'divider', label: 'Séparateur', keywords: 'separateur ligne divider', icon: Minus },
];

function AutoTextarea({
  value,
  onChangeValue,
  onKeyDown,
  onPaste,
  onFocus,
  placeholder,
  ariaLabel,
  className,
  inputRef,
}: {
  value: string;
  onChangeValue: (val: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  placeholder?: string;
  ariaLabel: string;
  className: string;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const syncHeight = () => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    syncHeight();
  }, [value]);

  useEffect(() => {
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, []);

  return (
    <textarea
      ref={(el) => {
        localRef.current = el;
        inputRef?.(el);
      }}
      value={value}
      rows={1}
      onChange={(e) => onChangeValue(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`overflow-hidden resize-none ${className}`}
    />
  );
}

function extractFlownotePageLinks(text: string): Array<{ label: string; pageId: string }> {
  const out: Array<{ label: string; pageId: string }> = [];
  const seen = new Set<string>();
  const re = /\[([^\]]+)\]\(flownote:\/\/page\/([a-zA-Z0-9_-]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      out.push({ label: m[1].trim() || 'Page liée', pageId: m[2] });
    }
  }
  return out;
}

export function BlockEditor({
  page,
  blocks: blocksProp,
  onChangeBlocks,
  editorKey,
  titleForPaste,
  embedded = false,
  emptyPlaceholder,
}: BlockEditorProps) {
  const {
    pages,
    rowsByPage,
    selectPage,
    updatePageTitle,
    updatePageIcon,
    updatePageBlocks,
    openImproDetail,
  } = useWorkspace();
  const [slashTargetId, setSlashTargetId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [calloutIconPickerBlockId, setCalloutIconPickerBlockId] = useState<string | null>(null);
  const [textEmojiPickerBlockId, setTextEmojiPickerBlockId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const blockInputsRef = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map());
  const tableCellRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingTableFocusRef = useRef<string | null>(null);

  const effectiveKey = page?.id ?? editorKey ?? 'standalone';
  const sourceBlocks = page ? page.blocks : (blocksProp ?? []);
  const blocks: BlockItem[] =
    sourceBlocks.length > 0
      ? sourceBlocks
      : [{ id: generateId('blk'), type: 'paragraph', content: '' }];

  useEffect(() => {
    setSlashTargetId(null);
    setShowIconPicker(false);
    setCalloutIconPickerBlockId(null);
    setTextEmojiPickerBlockId(null);
    setActiveBlockId(null);
  }, [effectiveKey]);

  useEffect(() => {
    if (!focusBlockId) return;
    const el = blockInputsRef.current.get(focusBlockId);
    if (el) {
      el.focus();
      setFocusBlockId(null);
    }
  }, [focusBlockId, blocks]);

  useEffect(() => {
    const key = pendingTableFocusRef.current;
    if (!key) return;
    const el = tableCellRefs.current.get(key);
    if (el) {
      el.focus();
      pendingTableFocusRef.current = null;
    }
  }, [blocks]);

  const filteredSlash = SLASH_OPTIONS.filter((opt) => {
    if (!slashQuery) return true;
    const q = slashQuery.toLowerCase();
    return opt.label.toLowerCase().includes(q) || opt.keywords.includes(q);
  });

  const setBlocks = (next: BlockItem[]) => {
    const clamped = next.slice(0, 400);
    if (onChangeBlocks) {
      onChangeBlocks(clamped);
    } else if (page) {
      updatePageBlocks(page.id, clamped);
    }
  };

  const insertBlockAfter = (afterId: string, type: BlockType = 'paragraph') => {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const created: BlockItem = {
      id: generateId('blk'),
      type,
      content: type === 'table' ? 'Tableau' : '',
      ...(type === 'todo' ? { checked: false } : {}),
      ...(type === 'code' ? { language: 'typescript' } : {}),
      ...(type === 'callout' ? { icon: '💡' } : {}),
      ...(type === 'toggle' ? { isOpen: true, details: '' } : {}),
      ...(type === 'bookmark' ? { url: 'https://' } : {}),
      ...(type === 'youtube' ? { url: '' } : {}),
      ...(type === 'audio' ? { url: '' } : {}),
      ...(type === 'table'
        ? {
            tableRows: [
              { cells: ['Colonne 1', 'Colonne 2'] },
              { cells: ['', ''] },
            ],
          }
        : {}),
    };
    const next = [...blocks];
    next.splice(idx + 1, 0, created);
    setBlocks(next);
    setFocusBlockId(created.id);
    setActiveBlockId(created.id);
    return created.id;
  };

  const applyBlockType = (blockId: string, newType: BlockType, clearSlash = false) => {
    const next = blocks.map((b) => {
      if (b.id !== blockId) return b;
      const content = clearSlash ? b.content.replace(/^\/\S*/, '').trimStart() : b.content;
      const updated: BlockItem = {
        id: b.id,
        type: newType,
        content:
          newType === 'divider'
            ? ''
            : newType === 'table'
              ? 'Tableau'
              : (newType === 'youtube' && isYouTubeUrl(content)) ||
                  (newType === 'audio' && isValidAudioUrl(content))
                ? ''
                : content,
      };
      if (newType === 'todo') updated.checked = b.checked ?? false;
      if (newType === 'code') updated.language = b.language ?? 'typescript';
      if (newType === 'callout') updated.icon = b.icon ?? '💡';
      if (newType === 'toggle') {
        updated.isOpen = true;
        updated.details = b.details ?? '';
      }
      if (newType === 'bookmark') {
        updated.url = b.url ?? (/^https?:\/\//i.test(content) ? content : 'https://');
      }
      if (newType === 'youtube') {
        updated.url = b.url ?? (isYouTubeUrl(content) ? content.trim() : '');
      }
      if (newType === 'audio') {
        updated.url = b.url ?? (isValidAudioUrl(content) ? content.trim() : '');
      }
      if (newType === 'table') {
        updated.tableRows = b.tableRows ?? [
          { cells: ['Colonne 1', 'Colonne 2'] },
          { cells: [content || '', ''] },
        ];
      }
      return updated;
    });
    setBlocks(next);
    setSlashTargetId(null);
    setSlashQuery('');
    setSlashIndex(0);
    setFocusBlockId(blockId);
  };

  const handleContentChange = (block: BlockItem, value: string) => {
    if (block.type === 'paragraph') {
      const shortcuts: Array<[RegExp, BlockType]> = [
        [/^###\s$/, 'heading3'],
        [/^##\s$/, 'heading2'],
        [/^#\s$/, 'heading1'],
        [/^[-*]\s$/, 'bullet'],
        [/^1\.\s$/, 'numbered'],
        [/^\[\s?\]\s$/, 'todo'],
        [/^>\s$/, 'quote'],
        [/^---$/, 'divider'],
        [/^```$/, 'code'],
      ];
      for (const [pattern, targetType] of shortcuts) {
        if (pattern.test(value)) {
          const next = blocks.map((b) =>
            b.id === block.id
              ? {
                  id: b.id,
                  type: targetType,
                  content: '',
                  ...(targetType === 'todo' ? { checked: false } : {}),
                  ...(targetType === 'code' ? { language: 'typescript' } : {}),
                }
              : b
          );
          setBlocks(next);
          setSlashTargetId(null);
          return;
        }
      }
    }

    if (value.startsWith('/')) {
      setSlashTargetId(block.id);
      setSlashQuery(value.slice(1));
      setSlashIndex(0);
    } else if (slashTargetId === block.id) {
      setSlashTargetId(null);
      setSlashQuery('');
    }

    setBlocks(blocks.map((b) => (b.id === block.id ? { ...b, content: value } : b)));
  };

  const handleBlockPaste = (block: BlockItem, e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (block.type === 'code') return;
    const html = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');

    if (
      block.type === 'paragraph' &&
      block.content.trim() === '' &&
      !plain.includes('\n') &&
      isYouTubeUrl(plain.trim())
    ) {
      e.preventDefault();
      setBlocks(
        blocks.map((b) =>
          b.id === block.id ? { id: b.id, type: 'youtube', url: plain.trim(), content: '' } : b
        )
      );
      return;
    }

    if (
      block.type === 'paragraph' &&
      block.content.trim() === '' &&
      !plain.includes('\n') &&
      isDirectAudioFileUrl(plain.trim())
    ) {
      e.preventDefault();
      setBlocks(
        blocks.map((b) =>
          b.id === block.id ? { id: b.id, type: 'audio', url: plain.trim(), content: '' } : b
        )
      );
      return;
    }

    const hasNotionHtml =
      Boolean(html) &&
      /<(h[1-3]|ul|ol|li|table|details|blockquote|pre|figure)\b/i.test(html);
    const hasMultiLineMarkdown =
      plain.includes('\n') &&
      /(^|\n)\s*(?:#{1,3}\s|[-*+]\s|\d+\.\s|>\s|```|<aside>|<details|\|.+\|)/m.test(plain);

    if (!hasNotionHtml && !hasMultiLineMarkdown) return;

    const pasteTitle = page?.title ?? titleForPaste ?? 'Fiche';
    const parsed = hasNotionHtml
      ? parseNotionHtml(html, pasteTitle)
      : parseNotionMarkdown(plain, pasteTitle);

    if (parsed.blocks.length <= 1 && parsed.blocks[0]?.type === 'paragraph') {
      return;
    }

    e.preventDefault();
    const idx = blocks.findIndex((b) => b.id === block.id);
    if (idx < 0) return;

    const next = [...blocks];
    if (block.content.trim() === '') {
      next.splice(idx, 1, ...parsed.blocks);
    } else {
      next.splice(idx + 1, 0, ...parsed.blocks);
    }
    setBlocks(next);
    const lastInserted = parsed.blocks[parsed.blocks.length - 1];
    if (lastInserted) setFocusBlockId(lastInserted.id);
  };

  const handleKeyDown = (block: BlockItem, e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (slashTargetId === block.id && filteredSlash.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSlash.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = filteredSlash[slashIndex] ?? filteredSlash[0];
        if (chosen) applyBlockType(block.id, chosen.type, true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashTargetId(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      if (
        (block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered') &&
        block.content.trim() === ''
      ) {
        applyBlockType(block.id, 'paragraph');
      } else {
        const nextType: BlockType =
          block.type === 'todo' || block.type === 'bullet' || block.type === 'numbered'
            ? block.type
            : 'paragraph';
        insertBlockAfter(block.id, nextType);
      }
      return;
    }

    if (e.key === 'Backspace' && block.content === '') {
      if (block.type !== 'paragraph') {
        e.preventDefault();
        applyBlockType(block.id, 'paragraph');
        return;
      }
      if (blocks.length > 1) {
        e.preventDefault();
        const idx = blocks.findIndex((b) => b.id === block.id);
        const prevBlock = blocks[idx - 1];
        setBlocks(blocks.filter((b) => b.id !== block.id));
        if (prevBlock) setFocusBlockId(prevBlock.id);
      }
    }
  };

  const moveBlock = (blockId: string, dir: -1 | 1) => {
    const idx = blocks.findIndex((b) => b.id === blockId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [removed] = next.splice(idx, 1);
    next.splice(target, 0, removed);
    setBlocks(next);
  };

  const deleteBlock = (blockId: string) => {
    if (blocks.length <= 1) {
      setBlocks([{ id: blockId, type: 'paragraph', content: '' }]);
      return;
    }
    setBlocks(blocks.filter((b) => b.id !== blockId));
  };

  const updateTableRows = (blockId: string, tableRows: TableBlockRow[]) => {
    setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, tableRows } : b)));
  };

  const tableColDrag = useColumnDrag((sourceKey, targetKey, position) => {
    const [srcBlockId, srcIdxStr] = sourceKey.split('::');
    const [tgtBlockId, tgtIdxStr] = targetKey.split('::');
    if (!srcBlockId || srcBlockId !== tgtBlockId) return;
    const fromIdx = Number(srcIdxStr);
    const toIdx = Number(tgtIdxStr);
    if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || fromIdx === toIdx) return;
    const targetBlock = blocks.find((b) => b.id === srcBlockId);
    if (!targetBlock) return;
    const current = targetBlock.tableRows ?? [{ cells: ['Colonne 1', 'Colonne 2'] }];
    const nextRows = current.map((row) => ({
      cells: reorderByIndex(row.cells, fromIdx, toIdx, position),
    }));
    updateTableRows(srcBlockId, nextRows);
  });

  const copyCode = (block: BlockItem) => {
    void navigator.clipboard?.writeText(block.content);
    setCopiedId(block.id);
    setTimeout(() => setCopiedId((prev) => (prev === block.id ? null : prev)), 1500);
  };

  const insertEmojiIntoBlock = (blockId: string, emoji: string) => {
    const input = blockInputsRef.current.get(blockId);
    const targetBlock = blocks.find((b) => b.id === blockId);
    if (!targetBlock) return;
    const current = targetBlock.content;
    if (
      input &&
      typeof input.selectionStart === 'number' &&
      typeof input.selectionEnd === 'number'
    ) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const nextContent = current.slice(0, start) + emoji + current.slice(end);
      setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, content: nextContent } : b)));
      window.requestAnimationFrame(() => {
        input.focus();
        const cursor = start + emoji.length;
        try {
          input.setSelectionRange(cursor, cursor);
        } catch {
          // ignore if input doesn't support selection range
        }
      });
    } else {
      setBlocks(blocks.map((b) => (b.id === blockId ? { ...b, content: `${current}${emoji}` } : b)));
      setFocusBlockId(blockId);
    }
  };

  const linkedRowEntry = (() => {
    if (!page) return null;
    for (const [dbId, rows] of Object.entries(rowsByPage)) {
      const found = rows.find((r) => r.linkedPageId === page.id);
      if (found) return { dbId, rowId: found.id };
    }
    return null;
  })();

  let numberedCounter = 0;

  return (
    <div
      className={
        embedded ? 'w-full space-y-2' : 'max-w-3xl mx-auto px-5 sm:pl-24 sm:pr-10 py-10'
      }
    >
      {/* En-tête de la page (mode pleine page uniquement) */}
      {!embedded && page && (
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-3 relative">
            <button
              type="button"
              onClick={() => {
                setCalloutIconPickerBlockId(null);
                setTextEmojiPickerBlockId(null);
                setShowIconPicker((v) => !v);
              }}
              title="Modifier l'icône / émoji de la page"
              aria-label="Changer l'icône de la page"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 hover:scale-105 transition-all shrink-0"
            >
              {page.icon || '📄'}
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 tabular-nums">
              <span>{page.source === 'notion_import' ? 'Importé de Notion' : 'Document'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {blocks.length} {blocks.length > 1 ? 'blocs' : 'bloc'}
              </span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  setCalloutIconPickerBlockId(null);
                  setTextEmojiPickerBlockId(null);
                  setShowIconPicker((v) => !v);
                }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <Smile className="w-3.5 h-3.5" />
                <span>Modifier l’icône</span>
              </button>
              {linkedRowEntry && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => openImproDetail(linkedRowEntry.dbId, linkedRowEntry.rowId, true)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Ouvrir la fiche</span>
                  </button>
                </>
              )}
            </div>

            {showIconPicker && (
              <div className="absolute left-0 top-13 z-40">
                <EmojiPicker
                  value={page.icon}
                  maxLength={32}
                  defaultIcon="📄"
                  title="Icône de la page"
                  onSelect={(emoji) => updatePageIcon(page.id, emoji)}
                  onClose={() => setShowIconPicker(false)}
                />
              </div>
            )}
          </div>

          <input
            type="text"
            value={page.title}
            onChange={(e) => updatePageTitle(page.id, e.target.value)}
            placeholder="Sans titre"
            aria-label="Titre de la page"
            className="w-full bg-transparent font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none"
          />
        </div>
      )}

      {/* Liste des blocs */}
      <div className="space-y-2">
        {blocks.map((block, index) => {
          if (block.type === 'numbered') numberedCounter += 1;
          else numberedCounter = 0;
          const currentNum = numberedCounter;
          const isBlockActive = activeBlockId === block.id;
          const canInsertTextEmoji =
            block.type !== 'divider' &&
            block.type !== 'table' &&
            block.type !== 'bookmark' &&
            block.type !== 'youtube' &&
            block.type !== 'audio';

          return (
            <div key={block.id} className="group relative">
              {/* Contrôles marge gauche sur desktop (pleine page) */}
              {!embedded && (
                <div className="hidden sm:flex sm:absolute sm:-left-24 sm:top-0.5 sm:w-24 sm:pr-2 items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => {
                      const createdId = insertBlockAfter(block.id, 'paragraph');
                      setSlashTargetId(createdId);
                      setSlashQuery('');
                    }}
                    aria-label="Ajouter un bloc en dessous"
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  {canInsertTextEmoji && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowIconPicker(false);
                        setCalloutIconPickerBlockId(null);
                        setTextEmojiPickerBlockId((prev) => (prev === block.id ? null : block.id));
                      }}
                      title="Insérer un émoji dans ce bloc"
                      aria-label="Insérer un émoji dans ce bloc"
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, -1)}
                  disabled={index === 0}
                  aria-label="Monter le bloc"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(block.id, 1)}
                  disabled={index === blocks.length - 1}
                  aria-label="Descendre le bloc"
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                  <button
                    type="button"
                    onClick={() => deleteBlock(block.id)}
                    aria-label="Supprimer le bloc"
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div className="w-full min-w-0 relative">
                {block.type === 'divider' ? (
                  <div className="py-3">
                    <hr className="border-slate-200 dark:border-slate-800" />
                  </div>
                ) : block.type === 'youtube' ? (
                  (() => {
                    const rawUrl = block.url ?? '';
                    const embedUrl = buildYouTubeEmbedUrl(rawUrl);
                    const hasNonEmptyUrl = rawUrl.trim().length > 0;
                    return (
                      <div className="my-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                          <Video className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <input
                            ref={(el) => {
                              if (el) blockInputsRef.current.set(block.id, el);
                            }}
                            type="url"
                            value={rawUrl}
                            onChange={(e) =>
                              setBlocks(
                                blocks.map((b) =>
                                  b.id === block.id ? { ...b, url: e.target.value } : b
                                )
                              )
                            }
                            onFocus={() => setActiveBlockId(block.id)}
                            placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                            aria-label="URL de la vidéo YouTube"
                            className="flex-1 min-w-0 bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                          />
                          {embedUrl && (
                            <a
                              href={rawUrl.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0 whitespace-nowrap"
                            >
                              <span>YouTube</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {embedUrl ? (
                          <div className="aspect-video w-full bg-slate-950">
                            <iframe
                              src={embedUrl}
                              title={block.content.trim() || 'Vidéo YouTube intégrée'}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                              loading="lazy"
                              referrerPolicy="strict-origin-when-cross-origin"
                              className="w-full h-full border-0"
                            />
                          </div>
                        ) : (
                          <div className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                            {hasNonEmptyUrl ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                Lien YouTube non reconnu (formats acceptés : youtube.com/watch?v=..., youtu.be/..., /shorts/...).
                              </span>
                            ) : (
                              <span>
                                Collez un lien YouTube ci-dessus pour afficher le lecteur vidéo intégré.
                              </span>
                            )}
                          </div>
                        )}
                        <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <input
                            type="text"
                            value={block.content}
                            onChange={(e) =>
                              setBlocks(
                                blocks.map((b) =>
                                  b.id === block.id ? { ...b, content: e.target.value } : b
                                )
                              )
                            }
                            onFocus={() => setActiveBlockId(block.id)}
                            placeholder="Légende ou minutage clé (optionnel)..."
                            aria-label="Légende de la vidéo YouTube"
                            className="w-full bg-transparent text-xs text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })()
                ) : block.type === 'audio' ? (
                  (() => {
                    const rawUrl = block.url ?? '';
                    const validUrl = isValidAudioUrl(rawUrl);
                    return (
                      <div className="my-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <input
                            ref={(el) => {
                              if (el) blockInputsRef.current.set(block.id, el);
                            }}
                            type="url"
                            value={rawUrl}
                            onChange={(e) =>
                              setBlocks(
                                blocks.map((b) =>
                                  b.id === block.id ? { ...b, url: e.target.value } : b
                                )
                              )
                            }
                            onFocus={() => setActiveBlockId(block.id)}
                            placeholder="https://.../piste.mp3 (MP3, WAV, OGG, M4A...)"
                            aria-label="URL du fichier audio"
                            className="flex-1 min-w-0 bg-transparent text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                          />
                          {validUrl && (
                            <a
                              href={rawUrl.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0 whitespace-nowrap"
                            >
                              <span>Ouvrir</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <div className="p-2.5">
                          {validUrl ? (
                            <AudioPlayerBar src={rawUrl.trim()} />
                          ) : (
                            <div className="px-3 py-3 text-center text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50/80 dark:bg-slate-950/40">
                              Collez un lien audio direct (.mp3, .wav, .ogg, .m4a...) pour afficher le lecteur intégré.
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800/80">
                          <input
                            type="text"
                            value={block.content}
                            onChange={(e) =>
                              setBlocks(
                                blocks.map((b) =>
                                  b.id === block.id ? { ...b, content: e.target.value } : b
                                )
                              )
                            }
                            onFocus={() => setActiveBlockId(block.id)}
                            placeholder="Titre de la piste ou repère sonore (optionnel)..."
                            aria-label="Titre de la piste audio"
                            className="w-full bg-transparent text-xs text-slate-600 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    );
                  })()
                ) : block.type === 'bookmark' ? (
                  <div className="my-1.5 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                      <input
                        ref={(el) => {
                          if (el) blockInputsRef.current.set(block.id, el);
                        }}
                        type="url"
                        value={block.url ?? block.content}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id
                                ? { ...b, url: e.target.value, content: e.target.value }
                                : b
                            )
                          )
                        }
                        onFocus={() => setActiveBlockId(block.id)}
                        placeholder="https://..."
                        aria-label="URL du signet"
                        className="w-full bg-transparent text-sm text-indigo-600 dark:text-indigo-400 focus:outline-none"
                      />
                    </div>
                    {block.url && /^(?:https?:\/\/|\/api\/notion\/media\/)/i.test(block.url) && (
                      <a
                        href={block.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 shrink-0"
                      >
                        <span>Ouvrir</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ) : block.type === 'callout' ? (
                  <div className="relative my-1.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowIconPicker(false);
                        setTextEmojiPickerBlockId(null);
                        setCalloutIconPickerBlockId((prev) => (prev === block.id ? null : block.id));
                      }}
                      title="Changer l'émoji de l'encadré"
                      aria-label="Changer l'émoji de l'encadré"
                      className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-md text-base hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors shrink-0"
                    >
                      {block.icon || '💡'}
                    </button>
                    {calloutIconPickerBlockId === block.id && (
                      <div className="absolute left-3 top-12 z-40">
                        <EmojiPicker
                          value={block.icon}
                          maxLength={16}
                          defaultIcon="💡"
                          title="Émoji de l'encadré"
                          onSelect={(emoji) =>
                            setBlocks(
                              blocks.map((b) => (b.id === block.id ? { ...b, icon: emoji.slice(0, 16) } : b))
                            )
                          }
                          onClose={() => setCalloutIconPickerBlockId(null)}
                        />
                      </div>
                    )}
                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onPaste={(e) => handleBlockPaste(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder="Note en encadré..."
                      ariaLabel="Texte de l'encadré"
                      className="w-full bg-transparent text-sm leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                  </div>
                ) : block.type === 'toggle' ? (
                  <div className="my-1 space-y-1">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, isOpen: !(b.isOpen ?? true) } : b
                            )
                          )
                        }
                        aria-label={block.isOpen ? 'Replier' : 'Déplier'}
                        className="mt-1 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                      >
                        {block.isOpen ?? true ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <AutoTextarea
                        inputRef={(el) => {
                          if (el) blockInputsRef.current.set(block.id, el);
                        }}
                        value={block.content}
                        onChangeValue={(val) => handleContentChange(block, val)}
                        onKeyDown={(e) => handleKeyDown(block, e)}
                        onPaste={(e) => handleBlockPaste(block, e)}
                        onFocus={() => setActiveBlockId(block.id)}
                        placeholder="Titre du bloc dépliant..."
                        ariaLabel="Titre du bloc dépliant"
                        className="w-full bg-transparent text-[15px] font-medium text-slate-900 dark:text-slate-100 focus:outline-none leading-relaxed"
                      />
                    </div>
                    {(block.isOpen ?? true) && (
                      <div className="ml-7 pl-3 py-1 rounded-md border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                        <AutoTextarea
                          value={block.details ?? ''}
                          onChangeValue={(val) =>
                            setBlocks(
                              blocks.map((b) => (b.id === block.id ? { ...b, details: val } : b))
                            )
                          }
                          onFocus={() => setActiveBlockId(block.id)}
                          placeholder="Contenu détaillé..."
                          ariaLabel="Contenu du bloc dépliant"
                          className="w-full bg-transparent text-sm text-slate-700 dark:text-slate-300 focus:outline-none leading-relaxed"
                        />
                      </div>
                    )}
                  </div>
                ) : block.type === 'table' ? (
                  <div className="my-2 space-y-2">
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/40">
                      <table className="w-full border-collapse text-left">
                        <tbody>
                          {(block.tableRows ?? [{ cells: ['Colonne 1', 'Colonne 2'] }]).map(
                            (tRow, rIdx) => (
                              <tr
                                key={rIdx}
                                className={`border-b border-slate-200 dark:border-slate-800 last:border-b-0 ${
                                  rIdx === 0 ? 'bg-slate-50 dark:bg-slate-900/70 font-medium' : ''
                                }`}
                              >
                                {tRow.cells.map((cell, cIdx) => {
                                  const colKey = `${block.id}::${cIdx}`;
                                  const isHeaderRow = rIdx === 0;
                                  const isDragging = tableColDrag.dragColId === colKey;
                                  const dropSide =
                                    isHeaderRow && tableColDrag.dropIndicator?.colId === colKey
                                      ? tableColDrag.dropIndicator.position
                                      : null;
                                  return (
                                    <td
                                      key={cIdx}
                                      {...(isHeaderRow ? tableColDrag.getThDropProps(colKey) : {})}
                                      className={`group/tcol relative px-2.5 py-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0 transition-opacity ${
                                        isDragging ? 'opacity-45' : ''
                                      }`}
                                    >
                                      {dropSide && (
                                        <div
                                          aria-hidden="true"
                                          className={`pointer-events-none absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-20 ${
                                            dropSide === 'before' ? 'left-0' : 'right-0'
                                          }`}
                                        />
                                      )}
                                      <div className="flex items-center gap-1">
                                        {isHeaderRow && (
                                          <span
                                            {...tableColDrag.getDragHandleProps(colKey)}
                                            title="Glisser pour réordonner la colonne"
                                            className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 opacity-40 group-hover/tcol:opacity-100 shrink-0"
                                          >
                                            <GripVertical className="w-3 h-3" />
                                          </span>
                                        )}
                                        <input
                                          ref={(el) => {
                                            const cellKey = `${block.id}:${rIdx}:${cIdx}`;
                                            if (el) tableCellRefs.current.set(cellKey, el);
                                            else tableCellRefs.current.delete(cellKey);
                                          }}
                                          type="text"
                                          value={cell}
                                          onChange={(e) => {
                                            const current = block.tableRows ?? [];
                                            const updated = current.map((row, ri) =>
                                              ri === rIdx
                                                ? {
                                                    cells: row.cells.map((c, ci) =>
                                                      ci === cIdx ? e.target.value : c
                                                    ),
                                                  }
                                                : row
                                            );
                                            updateTableRows(block.id, updated);
                                          }}
                                          aria-label={`Cellule ${rIdx + 1}-${cIdx + 1}`}
                                          className="w-full bg-transparent text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
                                        />
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="w-8 px-1 text-center">
                                  {(block.tableRows?.length ?? 0) > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextRows = (block.tableRows ?? []).filter(
                                          (_, ri) => ri !== rIdx
                                        );
                                        updateTableRows(block.id, nextRows);
                                      }}
                                      aria-label={`Supprimer la ligne ${rIdx + 1}`}
                                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const current =
                            block.tableRows && block.tableRows.length > 0
                              ? block.tableRows
                              : [{ cells: ['Colonne 1', 'Colonne 2'] }];
                          const colCount = current[0]?.cells.length || 2;
                          const emptyRow = { cells: Array.from({ length: colCount }, () => '') };
                          const nextRows = [current[0], emptyRow, ...current.slice(1)];
                          pendingTableFocusRef.current = `${block.id}:1:0`;
                          updateTableRows(block.id, nextRows);
                        }}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      >
                        + Ligne
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const current =
                            block.tableRows && block.tableRows.length > 0
                              ? block.tableRows
                              : [{ cells: ['Colonne 1'] }];
                          updateTableRows(
                            block.id,
                            current.map((r, ri) => ({
                              cells: [...r.cells, ri === 0 ? `Colonne ${r.cells.length + 1}` : ''],
                            }))
                          );
                        }}
                        className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                      >
                        + Colonne
                      </button>
                    </div>
                  </div>
                ) : block.type === 'code' ? (
                  <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden my-1.5">
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800 text-xs text-slate-400">
                      <input
                        type="text"
                        value={block.language ?? 'texte'}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, language: e.target.value.slice(0, 40) } : b
                            )
                          )
                        }
                        aria-label="Langage du bloc de code"
                        className="bg-transparent font-mono text-xs text-slate-300 focus:outline-none w-28"
                      />
                      <button
                        type="button"
                        onClick={() => copyCode(block)}
                        className="flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                      >
                        {copiedId === block.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                    </div>
                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder="Saisissez votre code..."
                      ariaLabel="Bloc de code"
                      className="w-full p-3.5 bg-transparent font-mono text-xs sm:text-sm text-slate-100 focus:outline-none leading-relaxed"
                    />
                  </div>
                ) : (
                  <div
                    className={`flex items-start gap-2.5 ${
                      block.type === 'quote'
                        ? 'px-4 py-3 my-1 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 italic'
                        : 'py-0.5'
                    }`}
                  >
                    {block.type === 'todo' && (
                      <input
                        type="checkbox"
                        checked={Boolean(block.checked)}
                        onChange={(e) =>
                          setBlocks(
                            blocks.map((b) =>
                              b.id === block.id ? { ...b, checked: e.target.checked } : b
                            )
                          )
                        }
                        aria-label={`Tâche : ${block.content || 'vide'}`}
                        className="mt-1.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-indigo-600 shrink-0 cursor-pointer"
                      />
                    )}
                    {block.type === 'bullet' && (
                      <span className="mt-1 text-slate-400 select-none shrink-0">•</span>
                    )}
                    {block.type === 'numbered' && (
                      <span className="mt-1 text-xs font-mono tabular-nums text-slate-500 select-none shrink-0 w-5 text-right">
                        {currentNum}.
                      </span>
                    )}
                    <AutoTextarea
                      inputRef={(el) => {
                        if (el) blockInputsRef.current.set(block.id, el);
                      }}
                      value={block.content}
                      onChangeValue={(val) => handleContentChange(block, val)}
                      onKeyDown={(e) => handleKeyDown(block, e)}
                      onPaste={(e) => handleBlockPaste(block, e)}
                      onFocus={() => setActiveBlockId(block.id)}
                      placeholder={
                        block.type === 'heading1'
                          ? 'Titre 1'
                          : block.type === 'heading2'
                            ? 'Titre 2'
                            : block.type === 'heading3'
                              ? 'Titre 3'
                              : index === 0
                                ? emptyPlaceholder ?? 'Écrire, coller depuis Notion ou taper /...'
                                : 'Texte...'
                      }
                      ariaLabel={`Bloc ${block.type}`}
                      className={`w-full bg-transparent focus:outline-none leading-relaxed ${
                        block.type === 'heading1'
                          ? 'font-display text-2xl font-bold text-slate-950 dark:text-white pt-3 pb-1'
                          : block.type === 'heading2'
                            ? 'font-display text-xl font-semibold text-slate-900 dark:text-slate-100 pt-2.5 pb-0.5'
                            : block.type === 'heading3'
                              ? 'font-display text-base font-semibold text-slate-900 dark:text-slate-100 pt-1.5'
                              : block.type === 'todo' && block.checked
                                ? 'text-[15px] text-slate-400 line-through'
                                : 'text-[15px] text-slate-800 dark:text-slate-200'
                      }`}
                    />
                  </div>
                )}

                {(() => {
                  const internalLinks = extractFlownotePageLinks(
                    `${block.content || ''}\n${block.details || ''}`
                  );
                  if (internalLinks.length === 0) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {internalLinks.map((lnk) => {
                        const target = pages.find((p) => p.id === lnk.pageId && !p.isTrashed);
                        return (
                          <button
                            key={lnk.pageId}
                            type="button"
                            onClick={() => selectPage(lnk.pageId)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>{target?.title || lnk.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Barre d'actions compacte (mobile ou mode intégré) */}
                {isBlockActive && (
                  <div
                    className={`${
                      embedded ? 'flex' : 'sm:hidden flex'
                    } flex-wrap items-center gap-1.5 pt-1`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const createdId = insertBlockAfter(block.id, 'paragraph');
                        setSlashTargetId(createdId);
                        setSlashQuery('');
                      }}
                      className="px-2 py-0.5 rounded-md text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-indigo-400"
                    >
                      + Bloc
                    </button>
                    {canInsertTextEmoji && (
                      <button
                        type="button"
                        onClick={() =>
                          setTextEmojiPickerBlockId((prev) => (prev === block.id ? null : block.id))
                        }
                        className="px-2 py-0.5 rounded-md text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 inline-flex items-center gap-1"
                      >
                        <Smile className="w-3 h-3" />
                        <span>Émoji</span>
                      </button>
                    )}
                    {embedded && (
                      <>
                        <button
                          type="button"
                          onClick={() => moveBlock(block.id, -1)}
                          disabled={index === 0}
                          aria-label="Monter le bloc"
                          className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBlock(block.id, 1)}
                          disabled={index === blocks.length - 1}
                          aria-label="Descendre le bloc"
                          className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteBlock(block.id)}
                      className="px-2 py-0.5 rounded-md text-xs text-red-600 dark:text-red-400 border border-slate-200 dark:border-slate-800"
                    >
                      Supprimer
                    </button>
                  </div>
                )}

                {textEmojiPickerBlockId === block.id && (
                  <div className="mt-1.5 relative z-40">
                    <EmojiPicker
                      title="Insérer un émoji"
                      onSelect={(emoji) => insertEmojiIntoBlock(block.id, emoji)}
                      onClose={() => setTextEmojiPickerBlockId(null)}
                    />
                  </div>
                )}

                {/* Menu commandes slash */}
                {slashTargetId === block.id && (
                  <div
                    role="listbox"
                    aria-label="Types de blocs"
                    className="mt-1 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-20 max-h-72 overflow-y-auto"
                  >
                    {filteredSlash.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Aucun bloc</div>
                    ) : (
                      filteredSlash.map((opt, optIdx) => {
                        const Icon = opt.icon;
                        const active = optIdx === slashIndex;
                        return (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() => applyBlockType(block.id, opt.type, true)}
                            className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-sm transition-colors ${
                              active
                                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0 opacity-70" />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barre d'ajout rapide */}
      <div className={`${embedded ? 'pt-2' : 'mt-6'} flex flex-wrap items-center gap-1.5`}>
        {(
          [
            { type: 'youtube', label: 'Vidéo YouTube', icon: Video },
            { type: 'audio', label: 'Audio', icon: Volume2 },
            { type: 'todo', label: 'Liste à cocher', icon: ListChecks },
            { type: 'callout', label: 'Encadré', icon: MessageSquareQuote },
            { type: 'toggle', label: 'Dépliant', icon: ChevronRight },
            { type: 'table', label: 'Tableau', icon: Table },
            { type: 'paragraph', label: 'Bloc texte', icon: Plus },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.type}
              type="button"
              onClick={() => {
                const last = blocks[blocks.length - 1];
                if (last) insertBlockAfter(last.id, item.type);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors whitespace-nowrap"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
