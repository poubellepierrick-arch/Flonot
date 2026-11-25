import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAudioTime, isDirectAudioFileUrl, isValidAudioUrl } from './audio.ts';

test('isValidAudioUrl accepte les URL http(s) et chemins locaux', () => {
  assert.equal(isValidAudioUrl('https://cdn.example.com/theme.mp3'), true);
  assert.equal(isValidAudioUrl('/assets/aistudio/son.mp3'), true);
  assert.equal(isValidAudioUrl('javascript:alert(1)'), false);
  assert.equal(isValidAudioUrl(''), false);
});

test('isDirectAudioFileUrl détecte uniquement les extensions audio directes', () => {
  assert.equal(isDirectAudioFileUrl('https://cdn.example.com/track.mp3?v=1'), true);
  assert.equal(isDirectAudioFileUrl('https://cdn.example.com/voice.m4a#t=10'), true);
  assert.equal(isDirectAudioFileUrl('https://cdn.example.com/audio.wav'), true);
  assert.equal(isDirectAudioFileUrl('https://cdn.example.com/podcast.ogg'), true);
  assert.equal(isDirectAudioFileUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), false);
  assert.equal(isDirectAudioFileUrl('https://example.com/page.html'), false);
});

test('formatAudioTime formate correctement en m:ss', () => {
  assert.equal(formatAudioTime(0), '0:00');
  assert.equal(formatAudioTime(NaN), '0:00');
  assert.equal(formatAudioTime(7), '0:07');
  assert.equal(formatAudioTime(125), '2:05');
});
