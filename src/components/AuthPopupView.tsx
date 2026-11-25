import { useEffect, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import { auth, formatFirebaseSyncError, googleProvider } from '../services/firebase';
import {
  AUTH_POPUP_MESSAGE_TYPE,
  parseAuthPopupNonceFromSearch,
} from '../utils/embedMode';
import { loadStoredTheme } from '../utils/localPersistence';

export function AuthPopupView() {
  const [nonce] = useState<string | null>(() =>
    typeof window !== 'undefined' ? parseAuthPopupNonceFromSearch(window.location.search) : null
  );
  const [hasOpener] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return Boolean(window.opener && !window.opener.closed);
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const theme = loadStoredTheme();
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const handleContinueGoogle = async () => {
    if (!nonce || !hasOpener || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (!cred?.idToken && !cred?.accessToken) {
        setError('Jeton Google manquant dans la réponse de connexion.');
        setLoading(false);
        return;
      }
      if (!window.opener || window.opener.closed) {
        setError(
          'La fenêtre embed d’origine a été fermée ou isolée par l’application hôte (vérifiez allow-popups-to-escape-sandbox).'
        );
        setLoading(false);
        return;
      }
      window.opener.postMessage(
        {
          type: AUTH_POPUP_MESSAGE_TYPE,
          nonce,
          idToken: cred.idToken ?? null,
          accessToken: cred.accessToken ?? null,
        },
        window.location.origin
      );
      setDone(true);
      setTimeout(() => {
        window.close();
      }, 280);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Connexion annulée';
      setError(formatFirebaseSyncError(raw) ?? raw);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-stone-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-sm w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Connexion à votre espace
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Authentification sécurisée pour activer l’édition synchronisée dans votre tableau intégré.
          </p>
        </div>

        {!hasOpener || !nonce ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 text-left flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                La fenêtre parente bloque le lien de retour vers l’embed. Dans l’application qui héberge l’iframe, retirez l’attribut <code>sandbox</code> ou ajoutez <code>allow-popups allow-popups-to-escape-sandbox</code>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.close()}
              className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Fermer cette fenêtre
            </button>
          </div>
        ) : done ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Connexion réussie, retour vers le tableau…</span>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300 text-left">
                {error}
              </div>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleContinueGoogle()}
              className="w-full h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Connexion en cours…' : 'Continuer avec Google'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
