import { useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { reorderIds } from '../utils/columnOrder';

interface ChoiceOrderEditorProps {
  choices: string[];
  onChange: (nextChoices: string[]) => void;
  title?: string;
}

export function ChoiceOrderEditor({
  choices,
  onChange,
  title = 'Ordre personnalisé des choix',
}: ChoiceOrderEditorProps) {
  const [draggingChoice, setDraggingChoice] = useState<string | null>(null);
  const [dragOverChoice, setDragOverChoice] = useState<{
    choice: string;
    position: 'before' | 'after';
  } | null>(null);

  if (choices.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Aucun choix détecté pour cette colonne.
      </p>
    );
  }

  const moveStep = (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= choices.length) return;
    const next = [...choices];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, choice: string) => {
    setDraggingChoice(choice);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', choice);
    } catch {
      // ignore
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, choice: string) => {
    if (!draggingChoice || draggingChoice === choice) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDragOverChoice((prev) =>
      prev && prev.choice === choice && prev.position === position ? prev : { choice, position }
    );
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetChoice: string) => {
    e.preventDefault();
    const source = draggingChoice;
    if (!source || source === targetChoice) {
      setDraggingChoice(null);
      setDragOverChoice(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    const next = reorderIds(choices, source, targetChoice, position);
    if (next !== choices) {
      onChange(next);
    }
    setDraggingChoice(null);
    setDragOverChoice(null);
  };

  const handleDragEnd = () => {
    setDraggingChoice(null);
    setDragOverChoice(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{title}</span>
        <span className="text-[11px] text-slate-400">Glisser ou ↑↓</span>
      </div>
      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950">
        {choices.map((choice, idx) => {
          const isDragging = draggingChoice === choice;
          const isOver = dragOverChoice?.choice === choice;
          return (
            <div
              key={choice}
              draggable
              onDragStart={(e) => handleDragStart(e, choice)}
              onDragOver={(e) => handleDragOver(e, choice)}
              onDrop={(e) => handleDrop(e, choice)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-xs select-none transition-colors ${
                isDragging ? 'opacity-40' : ''
              } ${
                isOver && dragOverChoice?.position === 'before'
                  ? 'border-t-2 border-t-indigo-600 dark:border-t-indigo-400'
                  : ''
              } ${
                isOver && dragOverChoice?.position === 'after'
                  ? 'border-b-2 border-b-indigo-600 dark:border-b-indigo-400'
                  : ''
              } hover:bg-slate-50 dark:hover:bg-slate-900`}
            >
              <GripVertical
                className="w-3.5 h-3.5 text-slate-400 cursor-grab shrink-0"
                aria-hidden="true"
              />
              <span className="w-5 text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                {idx + 1}.
              </span>
              <span className="flex-1 min-w-0 truncate text-slate-800 dark:text-slate-200 font-medium">
                {choice}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveStep(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Monter ${choice}`}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === choices.length - 1}
                  aria-label={`Descendre ${choice}`}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
