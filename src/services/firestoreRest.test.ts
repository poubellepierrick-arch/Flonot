import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirestoreDocumentName,
  buildRestDeleteWrite,
  buildRestSetWrite,
  buildRestUpdateWrite,
  decodeFirestoreRestFields,
  decodeFirestoreRestValue,
  encodeFirestoreRestFields,
  encodeFirestoreRestValue,
  FirestoreRestError,
  isWebChannelTransportError,
} from './firestoreRest';

describe('firestoreRest serialization & transport helpers', () => {
  it('encodes and decodes primitive, array, and nested map values accurately', () => {
    const input = {
      title: 'Zapping',
      order: 12,
      score: 3.5,
      active: true,
      parentId: null,
      ignored: undefined,
      tags: ['Énergie', 'Écoute'],
      emptyList: [],
      emptyMap: {},
      cells: {
        col_nom: 'Zapping',
        col_duree: 15,
        col_checked: false,
      },
    };

    const encoded = encodeFirestoreRestFields(input);
    assert.equal('ignored' in encoded, false);
    assert.deepEqual(encoded.order, { integerValue: '12' });
    assert.deepEqual(encoded.score, { doubleValue: 3.5 });
    assert.deepEqual(encoded.parentId, { nullValue: null });
    assert.deepEqual(encoded.emptyList, { arrayValue: {} });
    assert.deepEqual(encoded.emptyMap, { mapValue: {} });

    const decoded = decodeFirestoreRestFields(encoded);
    assert.deepEqual(decoded, {
      title: 'Zapping',
      order: 12,
      score: 3.5,
      active: true,
      parentId: null,
      tags: ['Énergie', 'Écoute'],
      emptyList: [],
      emptyMap: {},
      cells: {
        col_nom: 'Zapping',
        col_duree: 15,
        col_checked: false,
      },
    });
  });

  it('decodes timestampValue and integerValue strings from REST responses', () => {
    assert.equal(
      decodeFirestoreRestValue({ timestampValue: '2026-11-25T10:00:00Z' }),
      '2026-11-25T10:00:00Z'
    );
    assert.equal(decodeFirestoreRestValue({ integerValue: '42' }), 42);
    assert.deepEqual(encodeFirestoreRestValue(NaN), { integerValue: '0' });
  });

  it('builds set, update, and delete writes with server timestamps in updateTransforms only', () => {
    const setOp = buildRestSetWrite(
      'users/uid_1',
      { uid: 'uid_1', theme: 'dark', optional: undefined },
      ['updatedAt'],
      false
    );
    assert.ok('update' in setOp);
    assert.equal(
      setOp.update.name,
      buildFirestoreDocumentName('users/uid_1')
    );
    assert.deepEqual(setOp.updateTransforms, [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ]);
    assert.deepEqual(setOp.currentDocument, { exists: false });
    assert.equal('updatedAt' in setOp.update.fields, false);

    const updateOp = buildRestUpdateWrite(
      'workspaces/ws_1/pages/page_1',
      { title: 'Nouveau titre', isFavorite: true },
      ['updatedAt']
    );
    assert.ok('update' in updateOp);
    assert.deepEqual(updateOp.updateMask, { fieldPaths: ['title', 'isFavorite'] });
    assert.deepEqual(updateOp.updateTransforms, [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
    ]);
    assert.deepEqual(updateOp.currentDocument, { exists: true });

    const delOp = buildRestDeleteWrite('workspaces/ws_1/pages/page_1/rows/row_1');
    assert.deepEqual(delOp, {
      delete: buildFirestoreDocumentName('workspaces/ws_1/pages/page_1/rows/row_1'),
    });
  });

  it('distinguishes WebChannel transport errors from permission errors', () => {
    assert.equal(
      isWebChannelTransportError(new Error('Failed to get document because the client is offline.')),
      true
    );
    assert.equal(
      isWebChannelTransportError(new Error('Target ID already exists: 1004')),
      true
    );
    assert.equal(
      isWebChannelTransportError(
        new FirestoreRestError(403, 'PERMISSION_DENIED', 'Missing or insufficient permissions.')
      ),
      false
    );
    assert.equal(
      isWebChannelTransportError({ code: 'permission-denied', message: 'Denied' }),
      false
    );
  });
});
