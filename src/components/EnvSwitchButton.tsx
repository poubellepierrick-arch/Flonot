import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ExternalLink, Lock, X } from 'lucide-react';
import { getEnvSwitchInfo, isEnvSwitchPasswordValid } from '../utils/envSwitch';

export function EnvSwitchButton() {
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const envInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return getEnvSwitchInfo({ hostname: 'localhost', origin: 'http://localhost:3000' });
    }
    return getEnvSwitchInfo(window.location);
  }, []);

  const isPasswordValid = isEnvSwitchPasswordValid(password);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalOpen]);

  const handleOpen = () => {
    setPassword('');
    setError(null);
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setPassword('');
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isPasswordValid) {
      setError('Mot de passe incorrect.');
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    linkRef.current?.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={envInfo.targetTitle}
        aria-label={envInfo.targetTitle}
        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="hidden sm:inline">{envInfo.buttonLabel}</span>
      </button>

      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) handleClose();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="env-switch-title"
              className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] shadow-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <h2
                    id="env-switch-title"
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    Basculer vers {envInfo.buttonLabel}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Fermer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {envInfo.currentEnv === 'dev' ? (
                    <>
                      Vous êtes en mode <span className="font-semibold text-slate-900 dark:text-white">dev</span>.
                      Entrez le mot de passe pour ouvrir la prévisualisation{' '}
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">prev</span>{' '}
                      dans un nouvel onglet.
                    </>
                  ) : (
                    <>
                      Vous êtes sur la prévisualisation{' '}
                      <span className="font-semibold text-slate-900 dark:text-white">prev</span>.
                      Entrez le mot de passe pour ouvrir la page{' '}
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">dev (AI Studio)</span>{' '}
                      dans un nouvel onglet.
                    </>
                  )}
                </p>

                <div className="space-y-1.5">
                  <label
                    htmlFor="env-switch-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Mot de passe
                  </label>
                  <input
                    ref={inputRef}
                    id="env-switch-password"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••"
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                  />
                  {error && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="h-8 px-3 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Annuler
                  </button>
                  {isPasswordValid ? (
                    <a
                      ref={linkRef}
                      href={envInfo.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        window.setTimeout(handleClose, 0);
                      }}
                      className="h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      <span>Accéder ({envInfo.buttonLabel})</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  ) : (
                    <button
                      type="submit"
                      className="h-8 px-3 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
                    >
                      <span>Accéder ({envInfo.buttonLabel})</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
