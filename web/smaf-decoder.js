/** Separate audio worker keeps synthesis off both the UI and guest CPU threads. */
export class SmafDecoder {
  constructor() {
    this.worker = null;
    this.sequence = 0;
    this.pending = new Map();
  }
  decode(bytes) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./smaf-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const job = this.pending.get(data.id);
        if (!job) return;
        this.pending.delete(data.id);
        data.error ? job.reject(Error(data.error)) : job.resolve(data);
      };
      this.worker.onerror = (event) => {
        for (const job of this.pending.values())
          job.reject(Error(event.message || 'SMAF worker failed'));
        this.pending.clear();
        this.worker.terminate();
        this.worker = null;
      };
    }
    const id = ++this.sequence,
      copy = new Uint8Array(bytes).slice();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, bytes: copy }, [copy.buffer]);
    });
  }
  cancel() {
    for (const [id, job] of this.pending) {
      this.worker?.postMessage({ id, cancel: true });
      job.reject(new DOMException('Audio request superseded', 'AbortError'));
    }
    this.pending.clear();
  }
}
