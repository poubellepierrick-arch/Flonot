export interface EmojiEntry {
  emoji: string;
  label: string;
  keywords: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  items: EmojiEntry[];
}

export const RECENT_EMOJIS_STORAGE_KEY = 'flownote_recent_emojis_v1';

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'impro',
    label: 'Impro & Scène',
    icon: '🎭',
    items: [
      { emoji: '🎭', label: 'Théâtre', keywords: 'theatre impro scene masque comedie' },
      { emoji: '🎪', label: 'Chapiteau', keywords: 'spectacle scene cirque scene' },
      { emoji: '🎬', label: 'Clap', keywords: 'action scene tournage video cinema' },
      { emoji: '🎤', label: 'Micro', keywords: 'voix scene micro parole' },
      { emoji: '🎙️', label: 'Studio', keywords: 'podcast micro enregistrement' },
      { emoji: '🗣️', label: 'Parole', keywords: 'parler dialogue voix' },
      { emoji: '👏', label: 'Applaudissements', keywords: 'bravo applaudir public' },
      { emoji: '🙌', label: 'Mains levées', keywords: 'joie equipe energie' },
      { emoji: '🤝', label: 'Poignée de main', keywords: 'groupe duo ecoute accord' },
      { emoji: '🎲', label: 'Dé', keywords: 'hasard tirage jeu impro' },
      { emoji: '🃏', label: 'Joker', keywords: 'carte contrainte jeu' },
      { emoji: '⏱️', label: 'Chrono', keywords: 'temps minuteur duree chrono' },
      { emoji: '⏳', label: 'Sablier', keywords: 'temps attente duree' },
      { emoji: '🔔', label: 'Cloche', keywords: 'signal debut fin gong' },
      { emoji: '📣', label: 'Mégaphone', keywords: 'annonce consigne coaching' },
      { emoji: '🎯', label: 'Cible', keywords: 'objectif but focus precision' },
      { emoji: '🏆', label: 'Trophée', keywords: 'match coupe victoire' },
      { emoji: '🥇', label: 'Médaille', keywords: 'premier reussite' },
      { emoji: '🎟️', label: 'Ticket', keywords: 'spectacle entree billet' },
      { emoji: '✨', label: 'Étincelles', keywords: 'magie idee brillant top' },
      { emoji: '🌟', label: 'Étoile brillante', keywords: 'favori star' },
      { emoji: '🔥', label: 'Feu', keywords: 'energie chaud super top' },
      { emoji: '⚡', label: 'Éclair', keywords: 'rapide energie flash' },
      { emoji: '💥', label: 'Explosion', keywords: 'impact choc dynamique' },
    ],
  },
  {
    id: 'faces',
    label: 'Émotions',
    icon: '😀',
    items: [
      { emoji: '😀', label: 'Sourire', keywords: 'content joie heureux smile' },
      { emoji: '😃', label: 'Grand sourire', keywords: 'joie ravi heureux' },
      { emoji: '😄', label: 'Sourire rieur', keywords: 'joie rire' },
      { emoji: '😁', label: 'Souriant', keywords: 'dents content' },
      { emoji: '😆', label: 'Mort de rire', keywords: 'rire lol mdr' },
      { emoji: '😅', label: 'Rire gêné', keywords: 'ouf sueur soulage' },
      { emoji: '🤣', label: 'Plié de rire', keywords: 'mdr lol drole' },
      { emoji: '😂', label: 'Larmes de joie', keywords: 'rire drole pleurer' },
      { emoji: '🙂', label: 'Petit sourire', keywords: 'calme sympa ok' },
      { emoji: '😉', label: 'Clin d’œil', keywords: 'complice clin oeil' },
      { emoji: '😊', label: 'Sourire doux', keywords: 'content gentil' },
      { emoji: '😇', label: 'Ange', keywords: 'innocent sage' },
      { emoji: '🥰', label: 'Cœurs', keywords: 'amour adore sympa' },
      { emoji: '😍', label: 'Yeux cœurs', keywords: 'amour fan coup de coeur' },
      { emoji: '🤩', label: 'Émerveillé', keywords: 'wahou fan etoiles' },
      { emoji: '🥳', label: 'Fête', keywords: 'anniversaire bravo celebration' },
      { emoji: '😎', label: 'Cool', keywords: 'lunettes classe detendu' },
      { emoji: '🤓', label: 'Intello', keywords: 'lunettes etude notes' },
      { emoji: '🧐', label: 'Monocle', keywords: 'analyse observation detail' },
      { emoji: '🤔', label: 'Réflexion', keywords: 'penser question doute' },
      { emoji: '🤨', label: 'Sourcil levé', keywords: 'sceptique curieux' },
      { emoji: '😮', label: 'Surpris', keywords: 'oh bouche ouverte' },
      { emoji: '😲', label: 'Étonné', keywords: 'choc surprise' },
      { emoji: '🤯', label: 'Esprit soufflé', keywords: 'incroyable idee folle' },
      { emoji: '😳', label: 'Rougit', keywords: 'timide surpris' },
      { emoji: '🥺', label: 'Attendri', keywords: 'svp mignon' },
      { emoji: '😢', label: 'Triste', keywords: 'larme peine' },
      { emoji: '😭', label: 'Pleurs', keywords: 'drame tristesse' },
      { emoji: '😤', label: 'Déterminé', keywords: 'souffle motive' },
      { emoji: '😡', label: 'Colère', keywords: 'enerve furieux' },
      { emoji: '😱', label: 'Effrayé', keywords: 'peur panique' },
      { emoji: '😴', label: 'Endormi', keywords: 'dodo fatigue calme' },
      { emoji: '🤫', label: 'Chut', keywords: 'silence secret calme' },
      { emoji: '🤭', label: 'Main bouche', keywords: 'oups rigole secret' },
      { emoji: '🫣', label: 'Caché', keywords: 'timide regarde' },
      { emoji: '🫠', label: 'Fondant', keywords: 'chaud fatigue' },
      { emoji: '🫡', label: 'Salut', keywords: 'respect chef oui' },
      { emoji: '🤪', label: 'Fou', keywords: 'delire foufou' },
      { emoji: '😜', label: 'Tire la langue', keywords: 'blague farce' },
      { emoji: '🤗', label: 'Câlin', keywords: 'bienveillance accueil' },
    ],
  },
  {
    id: 'gestures',
    label: 'Gestes & Équipe',
    icon: '🙌',
    items: [
      { emoji: '👍', label: 'Pouce haut', keywords: 'ok bien valide oui' },
      { emoji: '👎', label: 'Pouce bas', keywords: 'non mauvais' },
      { emoji: '👌', label: 'Parfait', keywords: 'ok top nickel' },
      { emoji: '🤌', label: 'Pincé', keywords: 'precision italien chef' },
      { emoji: '✌️', label: 'Victoire', keywords: 'paix deux cool' },
      { emoji: '🤞', label: 'Doigts croisés', keywords: 'chance espoir' },
      { emoji: '🤟', label: 'Je t’aime', keywords: 'rock signe' },
      { emoji: '🤘', label: 'Rock', keywords: 'musique energie' },
      { emoji: '🤙', label: 'Shaka', keywords: 'cool appel detente' },
      { emoji: '👋', label: 'Coucou', keywords: 'bonjour salut bienvenue' },
      { emoji: '✋', label: 'Main levée', keywords: 'stop pause question' },
      { emoji: '🙏', label: 'Merci', keywords: 'merci svp gratitude' },
      { emoji: '💪', label: 'Force', keywords: 'muscle courage energie' },
      { emoji: '✍️', label: 'Écriture', keywords: 'ecrire notes stylo' },
      { emoji: '👀', label: 'Yeux', keywords: 'regarder ecoute observation' },
      { emoji: '🧠', label: 'Cerveau', keywords: 'memoire idee reflexion' },
      { emoji: '🫶', label: 'Mains cœur', keywords: 'amour equipe soutien' },
      { emoji: '👤', label: 'Personne', keywords: 'solo participant membre' },
      { emoji: '👥', label: 'Groupe', keywords: 'equipe participants collectif' },
      { emoji: '🫂', label: 'Étreinte', keywords: 'soutien groupe cohesion' },
      { emoji: '🧑‍🎨', label: 'Artiste', keywords: 'creatif atelier peinture' },
      { emoji: '🧑‍🏫', label: 'Coach', keywords: 'prof animateur formateur' },
      { emoji: '🧙', label: 'Mage', keywords: 'magie personnage conte' },
      { emoji: '🦸', label: 'Héros', keywords: 'personnage super pouvoir' },
    ],
  },
  {
    id: 'notes',
    label: 'Notes & Bureau',
    icon: '📝',
    items: [
      { emoji: '📄', label: 'Page', keywords: 'document feuille fichier' },
      { emoji: '📝', label: 'Mémo', keywords: 'note ecrire brouillon' },
      { emoji: '🗒️', label: 'Bloc-notes', keywords: 'carnet pense-bete' },
      { emoji: '📓', label: 'Cahier noir', keywords: 'carnet journal' },
      { emoji: '📔', label: 'Carnet', keywords: 'cahier notes' },
      { emoji: '📒', label: 'Registre', keywords: 'liste carnet jaune' },
      { emoji: '📕', label: 'Livre rouge', keywords: 'manuel guide' },
      { emoji: '📗', label: 'Livre vert', keywords: 'manuel guide' },
      { emoji: '📘', label: 'Livre bleu', keywords: 'manuel guide' },
      { emoji: '📚', label: 'Livres', keywords: 'bibliotheque biblimpro ressources' },
      { emoji: '📖', label: 'Livre ouvert', keywords: 'lecture histoire conte' },
      { emoji: '🗂️', label: 'Classeur', keywords: 'base donnees dossier onglets' },
      { emoji: '📁', label: 'Dossier', keywords: 'repertoire rangement' },
      { emoji: '📂', label: 'Dossier ouvert', keywords: 'repertoire ouvert' },
      { emoji: '🗃️', label: 'Boîte archives', keywords: 'base fichier stockage' },
      { emoji: '📊', label: 'Graphique', keywords: 'stats statistiques donnees' },
      { emoji: '📈', label: 'Courbe hausse', keywords: 'progres evolution stats' },
      { emoji: '📋', label: 'Presse-papiers', keywords: 'programme plan deroule' },
      { emoji: '📌', label: 'Punaise', keywords: 'important epingle' },
      { emoji: '📍', label: 'Repère', keywords: 'lieu point carte' },
      { emoji: '📎', label: 'Trombone', keywords: 'piece jointe lien' },
      { emoji: '📅', label: 'Calendrier', keywords: 'date seance agenda' },
      { emoji: '🗓️', label: 'Agenda', keywords: 'planning date mois' },
      { emoji: '⏰', label: 'Réveil', keywords: 'heure alarme timing' },
      { emoji: '🔖', label: 'Marque-page', keywords: 'signet favori' },
      { emoji: '🏷️', label: 'Étiquette', keywords: 'tag categorie label' },
      { emoji: '🔍', label: 'Loupe', keywords: 'recherche trouver' },
      { emoji: '🔑', label: 'Clé', keywords: 'acces astuce solution' },
      { emoji: '🔒', label: 'Cadenas', keywords: 'prive securite' },
      { emoji: '💡', label: 'Ampoule', keywords: 'idee astuce conseil' },
    ],
  },
  {
    id: 'symbols',
    label: 'Symboles',
    icon: '💡',
    items: [
      { emoji: '✅', label: 'Validé', keywords: 'fait ok coche vert' },
      { emoji: '☑️', label: 'Case cochée', keywords: 'tache fait' },
      { emoji: '❌', label: 'Croix', keywords: 'non erreur annuler' },
      { emoji: '⚠️', label: 'Attention', keywords: 'alerte warning prudence' },
      { emoji: '❓', label: 'Question', keywords: 'aide pourquoi interrogation' },
      { emoji: '❗', label: 'Exclamation', keywords: 'important urgent alerte' },
      { emoji: '💯', label: '100', keywords: 'parfait score maximum' },
      { emoji: '❤️', label: 'Cœur rouge', keywords: 'amour favori aime' },
      { emoji: '🧡', label: 'Cœur orange', keywords: 'chaleur coeur' },
      { emoji: '💛', label: 'Cœur jaune', keywords: 'amitie coeur' },
      { emoji: '💚', label: 'Cœur vert', keywords: 'nature coeur' },
      { emoji: '💙', label: 'Cœur bleu', keywords: 'confiance coeur' },
      { emoji: '💜', label: 'Cœur violet', keywords: 'creatif coeur' },
      { emoji: '⭐', label: 'Étoile', keywords: 'favori important' },
      { emoji: '🚩', label: 'Drapeau', keywords: 'repere etape jalon' },
      { emoji: '🏁', label: 'Arrivée', keywords: 'fin conclusion bilan' },
      { emoji: '🔄', label: 'Boucle', keywords: 'cycle synchro echange' },
      { emoji: '➕', label: 'Plus', keywords: 'ajouter nouveau' },
      { emoji: '➡️', label: 'Flèche', keywords: 'suivant direction' },
      { emoji: '🔴', label: 'Rouge', keywords: 'point cercle couleur' },
      { emoji: '🟠', label: 'Orange', keywords: 'point cercle couleur' },
      { emoji: '🟡', label: 'Jaune', keywords: 'point cercle couleur' },
      { emoji: '🟢', label: 'Vert', keywords: 'point cercle couleur' },
      { emoji: '🔵', label: 'Bleu', keywords: 'point cercle couleur' },
      { emoji: '🟣', label: 'Violet', keywords: 'point cercle couleur' },
      { emoji: '◆', label: 'Losange', keywords: 'symbole minimal' },
      { emoji: '◈', label: 'Diamant', keywords: 'symbole minimal' },
      { emoji: '⊞', label: 'Grille', keywords: 'tableau base minimal' },
    ],
  },
  {
    id: 'world',
    label: 'Nature & Loisirs',
    icon: '🌿',
    items: [
      { emoji: '🌱', label: 'Pousse', keywords: 'debut croissance nouveau' },
      { emoji: '🌿', label: 'Feuille', keywords: 'nature calme zen' },
      { emoji: '🍀', label: 'Trèfle', keywords: 'chance quatre feuilles' },
      { emoji: '🌸', label: 'Fleur', keywords: 'printemps doux' },
      { emoji: '🌻', label: 'Tournesol', keywords: 'soleil joie' },
      { emoji: '🌳', label: 'Arbre', keywords: 'foret nature racines' },
      { emoji: '🌊', label: 'Vague', keywords: 'mer flux rythme' },
      { emoji: '🌈', label: 'Arc-en-ciel', keywords: 'couleurs diversite joie' },
      { emoji: '☀️', label: 'Soleil', keywords: 'ete jour chaleur' },
      { emoji: '🌙', label: 'Lune', keywords: 'nuit soir calme' },
      { emoji: '🌍', label: 'Terre', keywords: 'monde globe voyage' },
      { emoji: '🚀', label: 'Fusée', keywords: 'lancement projet rapide' },
      { emoji: '🧭', label: 'Boussole', keywords: 'direction cap orientation' },
      { emoji: '☕', label: 'Café', keywords: 'pause boisson matin' },
      { emoji: '🍵', label: 'Thé', keywords: 'pause detente' },
      { emoji: '🍕', label: 'Pizza', keywords: 'repas soiree convivial' },
      { emoji: '🎉', label: 'Cotillons', keywords: 'fete bravo lancement' },
      { emoji: '🎊', label: 'Confettis', keywords: 'celebration joie' },
      { emoji: '🎈', label: 'Ballon', keywords: 'fete leger' },
      { emoji: '🎁', label: 'Cadeau', keywords: 'surprise bonus' },
      { emoji: '🧩', label: 'Puzzle', keywords: 'lien logique assemblage' },
      { emoji: '♟️', label: 'Échecs', keywords: 'strategie jeu reflexion' },
      { emoji: '🎨', label: 'Palette', keywords: 'art creation couleur' },
      { emoji: '🎵', label: 'Note', keywords: 'musique rythme chant' },
      { emoji: '🎶', label: 'Mélodie', keywords: 'musique rythme' },
      { emoji: '🎸', label: 'Guitare', keywords: 'musique groupe' },
      { emoji: '📷', label: 'Appareil photo', keywords: 'souvenir image photo' },
      { emoji: '💻', label: 'Ordinateur', keywords: 'code travail ecran' },
      { emoji: '⚙️', label: 'Engrenage', keywords: 'reglage parametre systeme' },
      { emoji: '🛠️', label: 'Outils', keywords: 'atelier bricolage technique' },
    ],
  },
];

export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((cat) => cat.items);

export function loadRecentEmojis(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_EMOJIS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 16);
  } catch {
    return [];
  }
}

export function pushRecentEmoji(
  emoji: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined
): string[] {
  const clean = emoji.trim();
  if (!clean) return loadRecentEmojis(storage);
  const existing = loadRecentEmojis(storage);
  const next = [clean, ...existing.filter((e) => e !== clean)].slice(0, 16);
  if (storage) {
    try {
      storage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }
  return next;
}
