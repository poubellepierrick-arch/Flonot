import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildYouTubeEmbedUrl,
  extractYouTubeStartSeconds,
  extractYouTubeVideoId,
  isYouTubeUrl,
} from './youtube.ts';

test('extractYouTubeVideoId reconnaît les principaux formats YouTube', () => {
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
});

test('extractYouTubeVideoId rejette les URL non YouTube ou invalides', () => {
  assert.equal(extractYouTubeVideoId(''), null);
  assert.equal(extractYouTubeVideoId('https://vimeo.com/123456'), null);
  assert.equal(extractYouTubeVideoId('https://youtube.com/watch?v=tropcourt'), null);
  assert.equal(extractYouTubeVideoId('javascript:alert(1)'), null);
  assert.equal(isYouTubeUrl('https://example.com'), false);
});

test('buildYouTubeEmbedUrl conserve le minutage de départ si présent', () => {
  assert.equal(extractYouTubeStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=1m30s'), 90);
  assert.equal(
    buildYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=75'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=75'
  );
  assert.equal(
    buildYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'
  );
});
