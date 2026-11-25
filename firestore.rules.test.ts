import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

test('firestore.rules contient le filet de sécurité global par défaut', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('firestore.rules couvre toutes les collections déclarées dans firebase-blueprint.json', () => {
  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.includes('/users/{userId}'));
  assert.ok(paths.includes('/sharedEmbeds/{embedToken}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/pages/{pageId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/pages/{pageId}/rows/{rowId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/exploreThreads/{threadId}'));
  assert.ok(paths.includes('/workspaces/{workspaceId}/viewSettings/{settingId}'));

  assert.match(rulesContent, /match \/users\/\{userId\}/);
  assert.match(rulesContent, /match \/sharedEmbeds\/\{embedToken\}/);
  assert.match(rulesContent, /match \/workspaces\/\{workspaceId\}/);
  assert.match(rulesContent, /match \/pages\/\{pageId\}/);
  assert.match(rulesContent, /match \/rows\/\{rowId\}/);
  assert.match(rulesContent, /match \/exploreThreads\/\{threadId\}/);
  assert.match(rulesContent, /match \/viewSettings\/\{settingId\}/);
});

test('firestore.rules vérifie email_verified, hasOnly, affectedKeys et request.time', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /request\.time/);
  assert.match(rulesContent, /allow list: if false;/);
});

test('firestore.rules et firebase-blueprint.json valident sortRules et columnWidths', () => {
  assert.match(rulesContent, /function isValidSortRule\(rule\)/);
  assert.match(rulesContent, /'sortRules'/);
  assert.match(rulesContent, /'columnWidths'/);
  const pageProps = blueprint.entities.WorkspacePage.properties;
  assert.ok('sortRules' in pageProps);
  assert.ok('columnWidths' in pageProps);
});

test('firestore.rules et firebase-blueprint.json valident ExploreThread', () => {
  assert.match(rulesContent, /function isValidExploreThread\(data, workspaceId, threadId\)/);
  assert.match(rulesContent, /'gemini-4-hydrogen'/);
  assert.match(rulesContent, /'gemini-3\.1-flash-lite'/);
  assert.match(rulesContent, /data\.messages\.size\(\) <= 60/);
  const threadProps = blueprint.entities.ExploreThread.properties;
  assert.ok('modelId' in threadProps);
  assert.ok('tier' in threadProps);
  assert.ok('messages' in threadProps);
});

test('firestore.rules autorise getDoc sur workspace/page/row/exploreThread inexistant pour son propriétaire vérifié', () => {
  assert.match(rulesContent, /resource == null && workspaceId == 'ws_' \+ request\.auth\.uid/);
  assert.match(rulesContent, /resource == null \|\| existing\(\)\.ownerId == request\.auth\.uid/);
});

test('firestore.rules autorise les blocs youtube et audio dans isValidBlockItem', () => {
  assert.match(rulesContent, /'bookmark', 'youtube', 'audio'/);
});

test('firestore.rules et firebase-blueprint.json valident blocks, comments et champs Notion sur DatabaseRow', () => {
  assert.match(rulesContent, /function isValidRowComment\(comment\)/);
  assert.match(rulesContent, /'linkedPageId', 'blocks', 'comments', 'notionPageId', 'notionSyncedAt', 'createdAt', 'updatedAt'/);
  assert.match(rulesContent, /'cells', 'order', 'linkedPageId', 'blocks', 'comments', 'notionPageId', 'notionSyncedAt', 'updatedAt'/);
  const rowProps = blueprint.entities.DatabaseRow.properties;
  assert.ok('blocks' in rowProps);
  assert.ok('comments' in rowProps);
  assert.ok('notionPageId' in rowProps);
  assert.ok('notionSyncedAt' in rowProps);
});

test('firestore.rules et firebase-blueprint.json valident ViewSetting', () => {
  assert.match(rulesContent, /function isValidViewSetting\(data, workspaceId, settingId\)/);
  assert.match(rulesContent, /'table_orders'/);
  assert.match(rulesContent, /data\.settings is map/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(\['settings', 'updatedAt'\]\)/);
  const viewProps = blueprint.entities.ViewSetting.properties;
  assert.ok('kind' in viewProps);
  assert.ok('settings' in viewProps);
});

test('firestore.rules et firebase-blueprint.json protègent SharedEmbed par jeton secret non listable', () => {
  assert.match(rulesContent, /function isValidEmbedToken\(token\)/);
  assert.match(rulesContent, /function isValidSharedEmbed\(data, embedToken\)/);
  assert.match(rulesContent, /existing\(\)\.active == true/);
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(\['active', 'pages', 'rowsByPage', 'tableOrders', 'updatedAt'\]\)/);
  const sharedProps = blueprint.entities.SharedEmbed.properties;
  assert.ok('target' in sharedProps);
  assert.ok('active' in sharedProps);
  assert.ok('rowsByPage' in sharedProps);
});

