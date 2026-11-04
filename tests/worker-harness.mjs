import { parentPort, workerData } from 'node:worker_threads';
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => originalFetch(new URL(url, workerData.origin), options);
globalThis.postMessage = (message, transfers = []) => parentPort.postMessage(message, transfers);
globalThis.onmessage = null;
parentPort.on('message', (data) => globalThis.onmessage?.({ data }));
await import('../web/worker.js');
