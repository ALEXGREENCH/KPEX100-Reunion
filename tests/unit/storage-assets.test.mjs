import test from 'node:test';
import assert from 'node:assert/strict';

test('memory fallback retains independent saves and imported Blob records', async () => {
  const storage = await import('../../web/storage.js?memory-test');
  const save = { variables: [12, 34] };
  const asset = { sha256: 'test', name: 'local.sgs', blob: new Blob(['original bytes']) };
  assert.equal(await storage.saveGame('test', save), false);
  assert.equal(await storage.storeAsset(asset), false);
  assert.deepEqual(await storage.loadSave('test'), save);
  const [restored] = await storage.listAssets();
  assert.equal(restored.name, 'local.sgs');
  assert.equal(await restored.blob.text(), 'original bytes');
  assert.equal(storage.storageStatus, 'memory');
  await storage.storeAsset({ ...asset, name: 'renamed.sgs' });
  assert.equal((await storage.listAssets()).length, 1);
});

// The browser success path must run the request callbacks, not just the no-IDB fallback.
function mockIndexedDB({ saves = [], assets = null } = {}) {
  const stores = new Map([['saves', new Map(saves)]]);
  if (assets) stores.set('assets', new Map(assets));
  const state = {
    writesFail: false,
    readsFail: false,
    closed: false,
    openedVersion: null,
    created: [],
  };
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name) {
      state.created.push(name);
      stores.set(name, new Map());
    },
    close() {
      state.closed = true;
    },
    transaction(name) {
      if (state.closed) throw Error('InvalidStateError');
      const store = stores.get(name);
      if (!store) throw Error('NotFoundError');
      const transaction = {
        objectStore() {
          const read = (result) => {
            const request = { result };
            queueMicrotask(() => (state.readsFail ? request.onerror?.() : request.onsuccess?.()));
            return request;
          };
          return {
            get: (key) => read(store.get(key)),
            getAll: () => read([...store.values()]),
            put(value, key) {
              queueMicrotask(() => {
                if (state.writesFail) transaction.onabort?.();
                else {
                  store.set(key, value);
                  transaction.oncomplete?.();
                }
              });
            },
          };
        },
      };
      return transaction;
    },
  };
  return {
    state,
    stores,
    database,
    api: {
      open(name, version) {
        assert.equal(name, 'kpex-reunion');
        state.openedVersion = version;
        const request = { result: database };
        queueMicrotask(() => {
          if (!stores.has('assets')) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

function useIndexedDB(t, value) {
  const before = globalThis.indexedDB;
  globalThis.indexedDB = value;
  t.after(() => {
    if (before === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = before;
  });
}

test(
  'IndexedDB success restores Blob assets and migrates v1 without deleting game saves',
  { timeout: 2000 },
  async (t) => {
    const oldSave = { variables: [8, 9] };
    const mock = mockIndexedDB({ saves: [['hellfire', oldSave]] });
    useIndexedDB(t, mock.api);
    const storage = await import('../../web/storage.js?idb-success');
    assert.deepEqual(await storage.listAssets(), []);
    assert.equal(mock.state.openedVersion, 2);
    assert.deepEqual(mock.state.created, ['assets']);
    assert.deepEqual(await storage.loadSave('hellfire'), oldSave);
    const record = { sha256: 'asset-a', name: 'a.sgs', blob: new Blob(['bytes']) };
    assert.equal(await storage.storeAsset(record), true);
    assert.equal(await storage.saveGame('hellfire', { variables: [10] }), true);
    // A fresh module has no memory fallback data: this verifies the persisted read path.
    const reloaded = await import('../../web/storage.js?idb-reloaded');
    const [restored] = await reloaded.listAssets();
    assert.equal(restored.sha256, record.sha256);
    assert.equal(await restored.blob.text(), 'bytes');
    assert.deepEqual(await reloaded.loadSave('hellfire'), { variables: [10] });
  },
);

test(
  'quota, read errors, and closed databases keep imported assets usable for this session',
  { timeout: 2000 },
  async (t) => {
    const old = { sha256: 'same', name: 'old.sgs', blob: new Blob(['old']) };
    const mock = mockIndexedDB({ assets: [['same', old]] });
    useIndexedDB(t, mock.api);
    const storage = await import('../../web/storage.js?idb-errors');
    assert.equal((await storage.listAssets())[0].name, 'old.sgs');
    mock.state.writesFail = true;
    const latest = { ...old, name: 'latest.sgs' };
    assert.equal(await storage.storeAsset(latest), false);
    assert.equal((await storage.listAssets())[0].name, 'latest.sgs');
    assert.equal(mock.stores.get('assets').get('same').name, 'old.sgs');
    mock.state.readsFail = true;
    assert.equal((await storage.listAssets())[0].name, 'latest.sgs');
    mock.database.onversionchange();
    assert.equal(mock.state.closed, true);
    const next = { ...latest, sha256: 'new' };
    assert.equal(await storage.storeAsset(next), false);
    assert.equal((await storage.listAssets()).length, 2);
  },
);

test(
  'a blocked database upgrade falls back immediately and closes a late connection',
  { timeout: 2000 },
  async (t) => {
    let request,
      closed = false;
    useIndexedDB(t, {
      open() {
        request = {
          result: {
            close() {
              closed = true;
            },
          },
        };
        queueMicrotask(() => request.onblocked());
        return request;
      },
    });
    const storage = await import('../../web/storage.js?idb-blocked');
    assert.deepEqual(await storage.listAssets(), []);
    assert.equal(storage.storageStatus, 'memory');
    request.onsuccess();
    assert.equal(closed, true);
  },
);
