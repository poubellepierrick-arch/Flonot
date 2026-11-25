import type { BlockItem } from '../types/workspace';
import { isValidAudioUrl } from './audio';
import { generateId } from './id';
import { isYouTubeUrl } from './youtube';

export type ExercisePageTemplateMode = 'template' | 'blank';

export function createExerciseContentBlocks(
  mode: ExercisePageTemplateMode = 'template'
): BlockItem[] {
  if (mode === 'blank') {
    return [{ id: generateId('blk'), type: 'paragraph', content: '' }];
  }

  return [
    {
      id: generateId('blk'),
      type: 'callout',
      icon: '🎯',
      content: 'Intention pédagogique et points clés de réussite pour cet exercice.',
    },
    {
      id: generateId('blk'),
      type: 'heading2',
      content: 'Préparation & liste à cocher',
    },
    {
      id: generateId('blk'),
      type: 'todo',
      checked: false,
      content: 'Installer l’espace de jeu et vérifier la dynamique du groupe',
    },
    {
      id: generateId('blk'),
      type: 'todo',
      checked: false,
      content: 'Donner un exemple rapide avant de lancer le premier passage',
    },
    {
      id: generateId('blk'),
      type: 'heading2',
      content: 'Vidéo de référence',
    },
    {
      id: generateId('blk'),
      type: 'youtube',
      url: '',
      content: 'Exemple vidéo YouTube (collez un lien ci-dessus)',
    },
    {
      id: generateId('blk'),
      type: 'heading2',
      content: 'Variantes & rebonds',
    },
    {
      id: generateId('blk'),
      type: 'toggle',
      isOpen: true,
      content: 'Variante pour relancer le rythme',
      details: 'Ajoutez ici vos contraintes, niveaux de difficulté ou idées de débrief.',
    },
  ];
}

export interface PageContentSummary {
  blockCount: number;
  videoCount: number;
  audioCount: number;
  todoTotal: number;
  todoDone: number;
  hasMeaningfulContent: boolean;
}

export function summarizeExerciseContentBlocks(blocks: BlockItem[]): PageContentSummary {
  let videoCount = 0;
  let audioCount = 0;
  let todoTotal = 0;
  let todoDone = 0;
  let meaningful = false;

  for (const b of blocks) {
    if (b.type === 'youtube') {
      if (b.url && isYouTubeUrl(b.url)) {
        videoCount += 1;
        meaningful = true;
      } else if (b.content.trim()) {
        meaningful = true;
      }
    } else if (b.type === 'audio') {
      if (b.url && isValidAudioUrl(b.url)) {
        audioCount += 1;
        meaningful = true;
      } else if (b.content.trim()) {
        meaningful = true;
      }
    } else if (b.type === 'todo') {
      todoTotal += 1;
      if (b.checked) todoDone += 1;
      if (b.content.trim()) meaningful = true;
    } else if (b.type === 'table') {
      if (b.tableRows && b.tableRows.length > 0) meaningful = true;
    } else if (b.type === 'bookmark') {
      if (b.url && /^https?:\/\//i.test(b.url)) meaningful = true;
    } else if (b.content.trim() || (b.details && b.details.trim())) {
      meaningful = true;
    }
  }

  return {
    blockCount: blocks.length,
    videoCount,
    audioCount,
    todoTotal,
    todoDone,
    hasMeaningfulContent: meaningful,
  };
}
