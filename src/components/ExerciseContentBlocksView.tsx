import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Link2 } from 'lucide-react';
import type { BlockItem } from '../types/workspace';
import { isValidAudioUrl } from '../utils/audio';
import { buildYouTubeEmbedUrl } from '../utils/youtube';
import { AudioPlayerBar } from './AudioPlayerBar';

interface ExerciseContentBlocksViewProps {
  blocks: BlockItem[];
  onToggleTodo?: (blockId: string, checked: boolean) => void;
}

export function ExerciseContentBlocksView({
  blocks,
  onToggleTodo,
}: ExerciseContentBlocksViewProps) {
  const [openToggles, setOpenToggles] = useState<Record<string, boolean>>({});
  let numberedCounter = 0;

  return (
    <div className="space-y-2.5 text-sm">
      {blocks.map((block) => {
        if (block.type === 'numbered') numberedCounter += 1;
        else numberedCounter = 0;
        const currentNum = numberedCounter;

        if (block.type === 'divider') {
          return <hr key={block.id} className="border-slate-200 dark:border-slate-800 my-2" />;
        }

        if (block.type === 'youtube') {
          const embedUrl = buildYouTubeEmbedUrl(block.url ?? '');
          if (!embedUrl) return null;
          return (
            <div
              key={block.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-950"
            >
              <div className="aspect-video w-full">
                <iframe
                  src={embedUrl}
                  title={block.content.trim() || 'Vidéo YouTube de référence'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-full border-0"
                />
              </div>
              {block.content.trim() && (
                <div className="px-3 py-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="truncate">{block.content}</span>
                  {block.url && (
                    <a
                      href={block.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                    >
                      <span>YouTube</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (block.type === 'audio') {
          const rawUrl = block.url ?? '';
          if (!isValidAudioUrl(rawUrl)) return null;
          return <AudioPlayerBar key={block.id} src={rawUrl.trim()} title={block.content} />;
        }

        if (block.type === 'bookmark') {
          if (!block.url || !/^https?:\/\//i.test(block.url)) return null;
          return (
            <a
              key={block.id}
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <span className="inline-flex items-center gap-2 min-w-0 truncate">
                <Link2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{block.content.trim() || block.url}</span>
              </span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          );
        }

        if (block.type === 'todo') {
          if (!block.content.trim()) return null;
          return (
            <label
              key={block.id}
              className="flex items-start gap-2.5 text-sm cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={Boolean(block.checked)}
                onChange={(e) => onToggleTodo?.(block.id, e.target.checked)}
                className="mt-1 w-4 h-4 rounded accent-indigo-600 shrink-0"
              />
              <span
                className={
                  block.checked
                    ? 'text-slate-400 line-through'
                    : 'text-slate-800 dark:text-slate-200'
                }
              >
                {block.content}
              </span>
            </label>
          );
        }

        if (block.type === 'callout') {
          if (!block.content.trim()) return null;
          return (
            <div
              key={block.id}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
            >
              <span className="shrink-0 text-base leading-none mt-0.5">{block.icon || '💡'}</span>
              <p className="whitespace-pre-wrap leading-relaxed">{block.content}</p>
            </div>
          );
        }

        if (block.type === 'toggle') {
          if (!block.content.trim() && !(block.details ?? '').trim()) return null;
          const isOpen = openToggles[block.id] ?? block.isOpen ?? true;
          return (
            <div key={block.id} className="space-y-1">
              <button
                type="button"
                onClick={() =>
                  setOpenToggles((prev) => ({ ...prev, [block.id]: !isOpen }))
                }
                className="flex items-center gap-1.5 text-left font-medium text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{block.content || 'Détails'}</span>
              </button>
              {isOpen && block.details && (
                <p className="ml-5 pl-3 py-1 border-l border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {block.details}
                </p>
              )}
            </div>
          );
        }

        if (block.type === 'table' && block.tableRows && block.tableRows.length > 0) {
          return (
            <div
              key={block.id}
              className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
            >
              <table className="w-full border-collapse text-left text-xs">
                <tbody>
                  {block.tableRows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={`border-b border-slate-200 dark:border-slate-800 last:border-b-0 ${
                        ri === 0 ? 'bg-slate-50 dark:bg-slate-800/60 font-medium' : ''
                      }`}
                    >
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-2.5 py-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-slate-700 dark:text-slate-300"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'code') {
          if (!block.content.trim()) return null;
          return (
            <pre
              key={block.id}
              className="p-3 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto"
            >
              <code>{block.content}</code>
            </pre>
          );
        }

        if (!block.content.trim()) return null;

        if (block.type === 'heading1') {
          return (
            <h3 key={block.id} className="font-display text-lg font-bold text-slate-950 dark:text-white pt-1">
              {block.content}
            </h3>
          );
        }
        if (block.type === 'heading2') {
          return (
            <h4 key={block.id} className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 pt-1">
              {block.content}
            </h4>
          );
        }
        if (block.type === 'heading3') {
          return (
            <h5 key={block.id} className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-0.5">
              {block.content}
            </h5>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote
              key={block.id}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 italic text-slate-700 dark:text-slate-300"
            >
              {block.content}
            </blockquote>
          );
        }
        if (block.type === 'bullet') {
          return (
            <div key={block.id} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
              <span className="text-slate-400 shrink-0">•</span>
              <span className="whitespace-pre-wrap">{block.content}</span>
            </div>
          );
        }
        if (block.type === 'numbered') {
          return (
            <div key={block.id} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
              <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0 mt-0.5">
                {currentNum}.
              </span>
              <span className="whitespace-pre-wrap">{block.content}</span>
            </div>
          );
        }

        return (
          <p key={block.id} className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {block.content}
          </p>
        );
      })}
    </div>
  );
}
