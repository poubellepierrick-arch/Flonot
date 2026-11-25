import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExerciseContentBlocks,
  summarizeExerciseContentBlocks,
} from './exerciseContentTemplate.ts';

test('createExerciseContentBlocks génère le modèle structuré ou une page vierge', () => {
  const templateBlocks = createExerciseContentBlocks('template');
  assert.ok(templateBlocks.length >= 6);
  assert.ok(templateBlocks.some((b) => b.type === 'callout'));
  assert.ok(templateBlocks.some((b) => b.type === 'todo'));
  assert.ok(templateBlocks.some((b) => b.type === 'youtube'));
  assert.ok(templateBlocks.some((b) => b.type === 'toggle'));

  const blankBlocks = createExerciseContentBlocks('blank');
  assert.equal(blankBlocks.length, 1);
  assert.equal(blankBlocks[0].type, 'paragraph');
  assert.equal(blankBlocks[0].content, '');
});

test('summarizeExerciseContentBlocks compte vidéos, cases cochées et contenu significatif', () => {
  const emptySummary = summarizeExerciseContentBlocks(createExerciseContentBlocks('blank'));
  assert.equal(emptySummary.blockCount, 1);
  assert.equal(emptySummary.videoCount, 0);
  assert.equal(emptySummary.audioCount, 0);
  assert.equal(emptySummary.todoTotal, 0);
  assert.equal(emptySummary.hasMeaningfulContent, false);

  const populatedSummary = summarizeExerciseContentBlocks([
    { id: 'b1', type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', content: 'Démo' },
    { id: 'b2', type: 'audio', url: 'https://cdn.example.com/music.mp3', content: 'Ambiance' },
    { id: 'b3', type: 'todo', checked: true, content: 'Étape 1' },
    { id: 'b4', type: 'todo', checked: false, content: 'Étape 2' },
    { id: 'b5', type: 'callout', icon: '💡', content: 'Astuce' },
  ]);

  assert.equal(populatedSummary.blockCount, 5);
  assert.equal(populatedSummary.videoCount, 1);
  assert.equal(populatedSummary.audioCount, 1);
  assert.equal(populatedSummary.todoTotal, 2);
  assert.equal(populatedSummary.todoDone, 1);
  assert.equal(populatedSummary.hasMeaningfulContent, true);
});
