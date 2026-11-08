const MMMD = 0x4d4d4d44;
const CNTI = 0x434e5449;

export class AdsAudio {
  #body;
  #audio;
  #pending;
  #current;

  constructor(body, audio) {
    this.#body = body;
    this.#audio = audio;
  }

  request(command, offset) {
    // The guest writes the opcode and the music flag as separate halfwords.
    if ((command & 0xffff) === 0) {
      this.#pending = { stop: true };
      return;
    }
    if (command !== 1 && command !== 0x10001) return;
    const body = this.#body;
    if (offset < 0 || offset + 12 > body.byteLength || body.getUint32(offset) !== MMMD) return;
    const length = body.getUint32(offset + 4) + 8;
    if (length < 12 || offset + length > body.byteLength || body.getUint32(offset + 8) !== CNTI)
      return;
    this.#pending = { offset, length, loop: command === 0x10001 };
  }

  flush(event, timer) {
    const request = this.#pending;
    this.#pending = undefined;
    if (!request) return;
    if (request.stop) {
      if (this.#current) this.#audio.stop();
      this.#current = undefined;
      return;
    }
    const { offset, length, loop } = request;
    const previous = this.#current;
    this.#current = { offset, loop, event };
    // Some timer routines stop and immediately request the same sound on
    // every tick. Keep the clip running while those requests remain adjacent.
    if (previous?.offset === offset && previous.loop === loop) {
      if (loop || (timer && previous.event + 1 === event)) return;
    }
    const bytes = new Uint8Array(this.#body.buffer, this.#body.byteOffset + offset, length);
    this.#audio.play(bytes, 'audio/x-smaf', loop);
  }
}
