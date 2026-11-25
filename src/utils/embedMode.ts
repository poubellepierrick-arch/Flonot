export type EmbedTarget = 'exercices';

export const AUTH_POPUP_MESSAGE_TYPE = 'flownote-auth-credential';

const EMBED_TOKEN_REGEX = /^emb_[a-zA-Z0-9_-]{20,124}$/;
const AUTH_NONCE_REGEX = /^[a-zA-Z0-9_-]{16,96}$/;

export function isValidEmbedToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length >= 24 &&
    token.length <= 128 &&
    EMBED_TOKEN_REGEX.test(token)
  );
}

export function isValidAuthNonce(nonce: unknown): nonce is string {
  return typeof nonce === 'string' && AUTH_NONCE_REGEX.test(nonce);
}

function randomTokenString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let suffix = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      suffix += alphabet[bytes[i] % alphabet.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return suffix;
}

/**
 * Génère un jeton secret aléatoire non devinable pour un miroir d'embed Firestore.
 */
export function generateEmbedToken(): string {
  return `emb_${randomTokenString(28)}`;
}

/**
 * Génère un nonce aléatoire pour sécuriser le relais d'authentification postMessage.
 */
export function generateAuthNonce(): string {
  return randomTokenString(24);
}

/**
 * Parse les paramètres d'URL (`window.location.search`) pour détecter un mode embed actif.
 */
export function parseEmbedTargetFromSearch(search: string): EmbedTarget | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('embed')?.trim().toLowerCase();
  if (raw === 'exercices' || raw === 'biblimpro') {
    return 'exercices';
  }
  return null;
}

/**
 * Extrait un jeton de partage valide (`?token=emb_...`) depuis `window.location.search`.
 */
export function parseEmbedTokenFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('token')?.trim();
  return isValidEmbedToken(raw) ? raw : null;
}

export function isAuthPopupModeFromSearch(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('authPopup') === '1';
}

export function parseAuthPopupNonceFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('nonce')?.trim();
  return isValidAuthNonce(raw) ? raw : null;
}

export function buildAuthPopupUrl(currentHrefOrOriginPath: string, nonce: string): string {
  try {
    const url = new URL(currentHrefOrOriginPath);
    url.search = '';
    url.hash = '';
    url.searchParams.set('authPopup', '1');
    url.searchParams.set('nonce', nonce);
    return url.toString();
  } catch {
    const cleanBase = currentHrefOrOriginPath.split('?')[0]?.split('#')[0] || '/';
    return `${cleanBase}?authPopup=1&nonce=${encodeURIComponent(nonce)}`;
  }
}

/**
 * Construit l'URL d'intégration directe pour le tableau des Exercices (Biblimpro).
 */
export function buildExercicesEmbedUrl(
  currentHrefOrOriginPath: string,
  embedToken?: string | null
): string {
  const validToken = isValidEmbedToken(embedToken) ? embedToken : null;
  try {
    const url = new URL(currentHrefOrOriginPath);
    url.search = '';
    url.hash = '';
    url.searchParams.set('embed', 'exercices');
    if (validToken) {
      url.searchParams.set('token', validToken);
    }
    return url.toString();
  } catch {
    const cleanBase = currentHrefOrOriginPath.split('?')[0]?.split('#')[0] || '/';
    return validToken
      ? `${cleanBase}?embed=exercices&token=${encodeURIComponent(validToken)}`
      : `${cleanBase}?embed=exercices`;
  }
}

/**
 * Construit l'URL de l'application complète sans les paramètres embed/token.
 */
export function buildMainAppUrlFromEmbed(currentHref: string): string {
  try {
    const url = new URL(currentHref);
    url.searchParams.delete('embed');
    url.searchParams.delete('token');
    url.searchParams.delete('authPopup');
    url.searchParams.delete('nonce');
    url.hash = '';
    return url.toString();
  } catch {
    return currentHref.split('?')[0]?.split('#')[0] || '/';
  }
}

/**
 * Génère le code HTML <iframe> prêt à intégrer dans Notion ou une page externe.
 */
export function buildExercicesEmbedIframeCode(
  embedUrl: string,
  title = 'Exercices — Biblimpro'
): string {
  const safeUrl = embedUrl.replace(/"/g, '&quot;');
  const safeTitle = title.replace(/"/g, '&quot;');
  return `<iframe src="${safeUrl}" title="${safeTitle}" width="100%" height="640" style="border:0;border-radius:12px;" allow="clipboard-write; identity-credentials-get" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" loading="lazy"></iframe>`;
}

/**
 * Copie un texte dans le presse-papiers avec repli DOM si Clipboard API est bloquée en iframe.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Poursuit vers le repli textarea ci-dessous
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
