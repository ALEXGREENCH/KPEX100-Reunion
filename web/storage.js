// Browser-local game saves. Never uploaded to hosting or sent to other users.
const memory = new Map();
const assetMemory = new Map();
let databasePromise;
export let storageStatus = 'indexeddb';
function database() {
  if (!databasePromise)
    databasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open('kpex-reunion', 2);
      let blocked = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of ['saves', 'assets'])
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other Reunion tabs to upgrade local storage'));
      };
      request.onerror = () => reject(request.error);
    }).catch(() => {
      storageStatus = 'memory';
      return null;
    });
  return databasePromise;
}
export async function loadSave(gameId) {
  const db = await database();
  if (!db) return memory.get(gameId) ?? null;
  return new Promise((resolve) => {
    const request = db.transaction('saves').objectStore('saves').get(String(gameId));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(memory.get(gameId) ?? null);
  });
}
export async function saveGame(gameId, data) {
  memory.set(gameId, data);
  const db = await database();
  if (!db) return false;
  return new Promise((resolve) => {
    const transaction = db.transaction('saves', 'readwrite');
    transaction.objectStore('saves').put(data, String(gameId));
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = transaction.onabort = () => {
      storageStatus = 'memory';
      resolve(false);
    };
  });
}

// Blob records avoid copying every ROM into JavaScript memory when listing the library.
export async function listAssets() {
  const db = await database();
  if (!db) return [...assetMemory.values()];
  return new Promise((resolve) => {
    try {
      const request = db.transaction('assets').objectStore('assets').getAll();
      request.onsuccess = () => {
        const records = new Map(request.result.map((record) => [record.sha256, record]));
        for (const [hash, record] of assetMemory) records.set(hash, record);
        resolve([...records.values()]);
      };
      request.onerror = () => resolve([...assetMemory.values()]);
    } catch {
      resolve([...assetMemory.values()]);
    }
  });
}
export async function storeAsset(record) {
  assetMemory.set(record.sha256, record);
  const db = await database();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction('assets', 'readwrite');
      transaction.objectStore('assets').put(record, record.sha256);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
