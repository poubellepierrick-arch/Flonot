# Spécification de sécurité Firestore (Phase 0 — Payload-First TDD)

## 1. Invariants de données
1. Un profil `/users/{userId}` ne peut être lu, créé ou modifié que par le propriétaire authentifié (`request.auth.uid == userId`) avec email vérifié. Aucune lecture globale `list` n'est autorisée (isolation PII).
2. Un espace `/workspaces/{workspaceId}` appartient à un seul `ownerId == request.auth.uid`. `ownerId` et `createdAt` sont immuables après création.
3. Une page `/workspaces/{workspaceId}/pages/{pageId}` ne peut exister que si le workspace parent existe et appartient à `request.auth.uid` (Master Gate `get()`). `workspaceId`, `ownerId` et `createdAt` sont immuables.
4. Une ligne `/workspaces/{workspaceId}/pages/{pageId}/rows/{rowId}` ne peut exister que si la page parente existe et appartient à `request.auth.uid`. `pageId`, `workspaceId`, `ownerId` et `createdAt` sont immuables.
5. Un fil Explore `/workspaces/{workspaceId}/exploreThreads/{threadId}` ne peut exister que si le workspace parent existe et appartient à `request.auth.uid` (Master Gate `get()`). `workspaceId`, `ownerId` et `createdAt` sont immuables, `modelId` et `tier` sont contraints par énumération, et `messages` est borné à 60 éléments.
6. Un document de réglages `/workspaces/{workspaceId}/viewSettings/{settingId}` ne peut exister que si le workspace parent existe et appartient à `request.auth.uid` (Master Gate `get()`). `workspaceId`, `ownerId`, `kind` et `createdAt` sont immuables, `kind` est contraint par énumération, et `settings` est une map bornée à 40 clés.
7. Tous les horodatages (`createdAt`, `updatedAt`) doivent correspondre exactement à `request.time`.
8. Toutes les listes (`blocks`, `columns`, `messages`) sont strictement bornées en taille et validées en type.
9. Toute requête `list` valide directement `resource.data.ownerId == request.auth.uid` sans appel `get()`.
10. Un instantané `/sharedEmbeds/{embedToken}` possède un jeton `emb_...` d'au moins 24 caractères, sans PII, non listable publiquement (`allow list` réservé au propriétaire vérifié), lisible uniquement par `get` exact sur un document `active == true`, et modifiable/supprimable exclusivement par le propriétaire vérifié du `workspaceId` source.

## 2. Les 12 charges malveillantes ("Dirty Dozen")
1. **Usurpation d'identité (Create User)** : `uid: "other-uid"` sous `/users/attacker` -> `PERMISSION_DENIED`.
2. **Fuite PII (Read User)** : Lecture de `/users/victim` par `attacker` -> `PERMISSION_DENIED`.
3. **Listage global utilisateurs** : `list /users` par un utilisateur connecté -> `PERMISSION_DENIED`.
4. **Champ fantôme (Shadow Field)** : Création de page ou de fil Explore avec `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
5. **Poisoning d'ID** : ID de page, de fil Explore ou de jeton `sharedEmbeds` invalide (`short` ou `../hack`) -> `PERMISSION_DENIED`.
6. **Horodatage falsifié** : Création avec `createdAt: "2020-01-01"` au lieu de `request.time` -> `PERMISSION_DENIED`.
7. **Orphelinat de page / fil Explore / sharedEmbed** : Création sous `/workspaces/nonexistent/exploreThreads/t1` ou `/sharedEmbeds/emb_...` vers un workspace inexistant -> `PERMISSION_DENIED`.
8. **Transfert de propriété (Update)** : Mise à jour de `ownerId` sur une page, un fil Explore ou un `sharedEmbed` existant -> `PERMISSION_DENIED`.
9. **Explosion de tableau** : Création d'une page avec `blocks` de taille 401 ou d'un fil Explore avec `messages` de taille 61 -> `PERMISSION_DENIED`.
10. **Type ou enum invalide** : Mise à jour de `title` avec un nombre `12345` ou `modelId: "deprecated-model"` -> `PERMISSION_DENIED`.
11. **Requête non filtrée (List)** : `list` sur `/workspaces/w1/pages`, `/workspaces/w1/exploreThreads` ou `/sharedEmbeds` sans contrainte `ownerId == auth.uid` -> `PERMISSION_DENIED`.
12. **Email non vérifié** : Écriture authentifiée avec `email_verified: false` -> `PERMISSION_DENIED`.
