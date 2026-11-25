import assert from 'node:assert/strict';
import {
  buildAuthPopupUrl,
  buildExercicesEmbedIframeCode,
  buildExercicesEmbedUrl,
  buildMainAppUrlFromEmbed,
  generateAuthNonce,
  generateEmbedToken,
  isAuthPopupModeFromSearch,
  isValidAuthNonce,
  isValidEmbedToken,
  parseAuthPopupNonceFromSearch,
  parseEmbedTargetFromSearch,
  parseEmbedTokenFromSearch,
} from './embedMode';

// 1. Parsing du paramètre ?embed=...
assert.equal(parseEmbedTargetFromSearch(''), null);
assert.equal(parseEmbedTargetFromSearch('?foo=bar'), null);
assert.equal(parseEmbedTargetFromSearch('?embed=exercices'), 'exercices');
assert.equal(parseEmbedTargetFromSearch('?embed=EXERCICES&theme=dark'), 'exercices');
assert.equal(parseEmbedTargetFromSearch('?embed=biblimpro'), 'exercices');
assert.equal(parseEmbedTargetFromSearch('?embed=autre'), null);

// 2. Génération et validation des jetons d'embed
const generated = generateEmbedToken();
assert.ok(isValidEmbedToken(generated));
assert.equal(isValidEmbedToken('emb_short'), false);
assert.equal(isValidEmbedToken('not_emb_prefix_1234567890123456'), false);
assert.equal(parseEmbedTokenFromSearch(`?embed=exercices&token=${generated}`), generated);
assert.equal(parseEmbedTokenFromSearch('?embed=exercices&token=bad'), null);

// 3. Construction propre de l'URL embed avec et sans jeton
assert.equal(
  buildExercicesEmbedUrl('https://flownote.example.app/workspace?page=foo#section'),
  'https://flownote.example.app/workspace?embed=exercices'
);
assert.equal(
  buildExercicesEmbedUrl('https://flownote.example.app/workspace?page=foo#section', generated),
  `https://flownote.example.app/workspace?embed=exercices&token=${generated}`
);
assert.equal(
  buildExercicesEmbedUrl('/?old=1#hash'),
  '/?embed=exercices'
);
assert.equal(
  buildMainAppUrlFromEmbed(`https://flownote.example.app/?embed=exercices&token=${generated}#top`),
  'https://flownote.example.app/'
);

// 4. Génération du snippet iframe échappé
const iframeHtml = buildExercicesEmbedIframeCode(
  'https://flownote.example.app/?embed=exercices',
  'Catalogue "Biblimpro"'
);
assert.ok(iframeHtml.includes('src="https://flownote.example.app/?embed=exercices"'));
assert.ok(iframeHtml.includes('title="Catalogue &quot;Biblimpro&quot;"'));
assert.ok(iframeHtml.includes('allow="clipboard-write; identity-credentials-get"'));
assert.ok(iframeHtml.includes('allow-popups-to-escape-sandbox'));
assert.ok(iframeHtml.startsWith('<iframe '));
assert.ok(iframeHtml.endsWith('</iframe>'));

// 5. Helpers relais d'authentification popup
const nonce = generateAuthNonce();
assert.ok(isValidAuthNonce(nonce));
assert.equal(isValidAuthNonce('short'), false);
const authUrl = buildAuthPopupUrl(`https://flownote.example.app/?embed=exercices&token=${generated}`, nonce);
assert.equal(authUrl, `https://flownote.example.app/?authPopup=1&nonce=${nonce}`);
assert.equal(isAuthPopupModeFromSearch(`?authPopup=1&nonce=${nonce}`), true);
assert.equal(isAuthPopupModeFromSearch('?embed=exercices'), false);
assert.equal(parseAuthPopupNonceFromSearch(`?authPopup=1&nonce=${nonce}`), nonce);
assert.equal(parseAuthPopupNonceFromSearch('?authPopup=1&nonce=bad'), null);

console.log('embedMode tests passed');
