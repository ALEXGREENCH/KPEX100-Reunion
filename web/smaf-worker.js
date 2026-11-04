import { renderSmaf } from './engine/smaf.js';

let queue = Promise.resolve(),
  cacheBytes = 0,
  completed = 0;
const cancelled = new Set(),
  cache = new Map();
const cacheLimit = 32 * 1024 * 1024;
async function decode({ id, bytes }) {
  try {
    if (cancelled.has(id)) return;
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('');
    let result = cache.get(hash);
    if (result) {
      cache.delete(hash);
      cache.set(hash, result);
    } else {
      result = await renderSmaf(bytes, { cancelled: () => cancelled.has(id) });
      if (result.wave.length <= cacheLimit) {
        while (cacheBytes + result.wave.length > cacheLimit) {
          const oldest = cache.keys().next().value;
          cacheBytes -= cache.get(oldest).wave.length;
          cache.delete(oldest);
        }
        cache.set(hash, result);
        cacheBytes += result.wave.length;
      }
    }
    if (!cancelled.has(id)) {
      const wave = result.wave.slice();
      postMessage({ id, wave, truncated: result.truncated, frames: result.frames }, [wave.buffer]);
    }
  } catch (error) {
    if (!cancelled.has(id)) postMessage({ id, error: String(error.message || error) });
  } finally {
    cancelled.delete(id);
    completed = Math.max(completed, id);
  }
}
onmessage = ({ data }) => {
  if (data.cancel) {
    if (data.id > completed) cancelled.add(data.id);
  } else queue = queue.then(() => decode(data));
};
