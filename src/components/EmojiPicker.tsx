import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shuffle, X } from 'lucide-react';
import {
  ALL_EMOJIS,
  EMOJI_CATEGORIES,
  loadRecentEmojis,
  pushRecentEmoji,
} from '../utils/emojiCatalog';

interface EmojiPickerProps {
  value?: string;
  maxLength?: number;
  defaultIcon?: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  title?: string;
  className?: string;
}

export function EmojiPicker({
  value,
  maxLength = 32,
  defaultIcon,
  onSelect,
  onClose,
  title = 'Choisir un émoji',
  className = '',
}: EmojiPickerProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [customInput, setCustomInput] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => loadRecentEmojis());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const handlePick = (rawEmoji: string) => {
    const clean = rawEmoji.trim().slice(0, maxLength);
    if (!clean) return;
    setRecentEmojis(pushRecentEmoji(clean));
    onSelect(clean);
    onClose();
  };

  const handleRandom = () => {
    const pool = ALL_EMOJIS;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    if (chosen) handlePick(chosen.emoji);
  };

  const normalizedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return ALL_EMOJIS.filter(
      (item) =>
        item.emoji === normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.keywords.toLowerCase().includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const displayedCategories = useMemo(() => {
    if (activeCategory === 'all') return EMOJI_CATEGORIES;
    return EMOJI_CATEGORIES.filter((c) => c.id === activeCategory);
  }, [activeCategory]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={`w-[320px] sm:w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden z-40 ${className}`}
    >
      {/* Header + Search */}
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRandom}
              title="Émoji aléatoire"
              className="h-6 px-2 rounded-md text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
            >
              <Shuffle className="w-3 h-3" />
              <span>Aléatoire</span>
            </button>
            {defaultIcon && value !== defaultIcon && (
              <button
                type="button"
                onClick={() => handlePick(defaultIcon)}
                className="h-6 px-2 rounded-md text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Défaut
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer le sélecteur d'émojis"
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (ex: théâtre, rire, idée, chrono...)"
            aria-label="Rechercher un émoji"
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {!normalizedQuery && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeCategory === 'all'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Tous
            </button>
            {EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.label}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap inline-flex items-center gap-1 transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{cat.icon}</span>
                <span className="hidden sm:inline">{cat.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Emoji grid */}
      <div className="max-h-64 overflow-y-auto p-2.5 space-y-3">
        {normalizedQuery ? (
          searchResults.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Aucun émoji trouvé. Vous pouvez aussi en coller un ci-dessous.
            </div>
          ) : (
            <div className="grid grid-cols-8 gap-1">
              {searchResults.map((item) => (
                <button
                  key={`${item.emoji}-${item.label}`}
                  type="button"
                  onClick={() => handlePick(item.emoji)}
                  title={item.label}
                  className={`h-8 flex items-center justify-center rounded-md text-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    value === item.emoji ? 'bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500' : ''
                  }`}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            {activeCategory === 'all' && recentEmojis.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-400 px-1">Récents</div>
                <div className="grid grid-cols-8 gap-1">
                  {recentEmojis.map((em) => (
                    <button
                      key={`recent-${em}`}
                      type="button"
                      onClick={() => handlePick(em)}
                      className={`h-8 flex items-center justify-center rounded-md text-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        value === em ? 'bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500' : ''
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayedCategories.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="text-[11px] font-medium text-slate-400 px-1">{cat.label}</div>
                <div className="grid grid-cols-8 gap-1">
                  {cat.items.map((item) => (
                    <button
                      key={`${cat.id}-${item.emoji}`}
                      type="button"
                      onClick={() => handlePick(item.emoji)}
                      title={item.label}
                      className={`h-8 flex items-center justify-center rounded-md text-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        value === item.emoji ? 'bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500' : ''
                      }`}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Custom emoji input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customInput.trim()) {
            handlePick(customInput);
          }
        }}
        className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center gap-1.5"
      >
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Coller ou saisir n'importe quel émoji…"
          aria-label="Saisir un émoji personnalisé"
          className="flex-1 min-w-0 h-7 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!customInput.trim()}
          className="h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium whitespace-nowrap"
        >
          Appliquer
        </button>
      </form>
    </div>
  );
}
