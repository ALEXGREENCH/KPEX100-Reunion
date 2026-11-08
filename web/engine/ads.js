/** Verified Samsung Anycall ADS builds hosted on the ARM/Thumb WASM core. */
import { sha256 } from '../local-assets.js';
import { createARM } from './cpu.js';
import { AdsAudio } from './ads-audio.js';

const HEADER_BYTES = 0x109;
const TEXT = 0xf4000000;
const BSS = 0xf5000000;
const BSS_BYTES = 0x80000;
const DISPLAY_OFFSET = 0x40000;
const DISPLAY = BSS + DISPLAY_OFFSET;
const TABLE = 0xf6000000;
const STUBS = TABLE + 0x1000;
const RETURN = TABLE + 0x3000;
const STACK = 0x08000000;
const STACK_BYTES = 0x10000;
const WIDTH = 120;
const DEFAULT_HEIGHT = 128;
const EVENT_BUDGET = 25000;
// The archived replays start from empty saves and use silent host services.
// Some releases expect the clock service to return zero without writing output.
const BASE_STUBS = [0x18, 0x24, 0x3c, 0x40, 0x48, 0x68];
const STANDARD_STUBS = [...BASE_STUBS, 0x2c, 0x30, 0x34, 0x5c, 0x9c];
const DRAWING_STUBS = [0x08, ...STANDARD_STUBS.filter((slot) => slot !== 0x48)];
const RANDOM_DRAWING_STUBS = DRAWING_STUBS.filter((slot) => slot !== 0x40);
const UDON_STUBS = [0x0c, ...RANDOM_DRAWING_STUBS];
const PROFILES = [
  {
    id: 'merry-christmas',
    title: 'Merry Christmas',
    bytes: 92462,
    sha256: '7114c2494d25d708a3ebda216e090c0039c25f6bcbe0f3a1d83108a1e340895a',
    timerArgument: 0,
    stubs: DRAWING_STUBS,
  },
  {
    id: 'mr-ramen',
    title: 'Mr. 라면왕',
    bytes: 129976,
    sha256: '6b13f774d53bbf641e778a069b013cfd31555d84ec4af45504596a748629f0af',
    timerArgument: 2,
    stubs: DRAWING_STUBS,
  },
  {
    id: 'udon-time',
    title: '우동타임',
    bytes: 102948,
    sha256: '0d589cca6fc22e01f8e90f5fe7e43150cc2ce09317d5d822c5c438e439407672',
    timerArgument: 2,
    stubs: UDON_STUBS,
  },
  {
    id: '119-rescue',
    title: '119 Rescue',
    bytes: 84580,
    sha256: '982b6f0d3b66c8c4d4d9f3b73b16a3233fe71afee4a7b58a8e4e43ba4acdda73',
    timerArgument: 1,
    stubs: DRAWING_STUBS,
  },
  {
    id: 'pocket-billiards',
    title: 'Pocket Billiards',
    bytes: 80592,
    sha256: 'ba8019b03d62389edb7c10137023e7a38d0c75fb0e8fa3415bd303e2f58655cc',
    timerArgument: 0,
    height: 144,
  },
  {
    id: 'jumping-baby',
    title: 'Jumping Baby',
    bytes: 59808,
    sha256: 'f92939b286d004deff20782d15827c0c4e31a4ce0859239b7594551d741501a7',
    timerArgument: 0,
    stubs: BASE_STUBS,
  },
  {
    id: 'hungry-hunter',
    title: 'Hungry Hunter',
    bytes: 94920,
    sha256: 'be7a23f99e205ab13674706ad750cebb01558e6dd65835cfbdc31546b8c5a8be',
    timerArgument: 0,
  },
  {
    id: 'love-love',
    title: 'Love Love Ppyong Hammer',
    bytes: 115037,
    sha256: 'd976b7800d9ba20ebd726212afcfaa387240eace6a7892de4560c4c82479ceba',
    timerArgument: 0,
  },
  {
    id: 'oh-my-head',
    title: 'Oh My Head',
    bytes: 97672,
    sha256: '53e0e20bc8e615eee973fae319b40ebbaccb6fdafc3d8a91d8e8c6228031e74f',
    timerArgument: 0,
    emptyMqDescriptor: true,
  },
  {
    id: 'mobile-gostop',
    title: 'Mobile GoStop',
    bytes: 89421,
    sha256: '108f8d823825c936d782e0f0a1d4e090e5812bab5713c92c765cc42fc2a8c197',
    timerArgument: 1,
    stubs: RANDOM_DRAWING_STUBS,
    sessionSave: { address: BSS + 0x1940, caller: TEXT + 0x554b },
    emptySplashDescriptor: { address: BSS + 0x132c, caller: TEXT + 0x5755 },
  },
  {
    id: 'cheombangjichuk-othello',
    title: 'Cheombangjichuk Othello',
    bytes: 130088,
    sha256: '30f98f626af9cdbeb2f57180c31040df60153a101f3388926b5a2086dee51bf2',
    timerArgument: 1,
    height: 144,
    stubs: STANDARD_STUBS.filter((slot) => slot !== 0x9c),
    emptyMqDescriptor: true,
  },
  {
    id: 'couple-bowling',
    title: 'Couple Bowling',
    bytes: 116817,
    sha256: '166f9c83d77e92b3bbd7ecaba470ebfb1fc1b679f7d89a8a6a7a53809bd96102',
    timerArgument: 1,
    height: 144,
    stubs: RANDOM_DRAWING_STUBS,
    sessionSave: { address: BSS + 0x5510, caller: TEXT + 0x644d },
    emptySplashDescriptor: { address: BSS + 0x0cec, caller: TEXT + 0x5a05 },
  },
  {
    id: 'bubble-monk-2',
    title: 'Bubble Monk 2',
    bytes: 131894,
    sha256: '3ae1e04708000af39f87482c7d34e4e6ce8717f2c72eff2da7b044827cd72407',
    timerArgument: 1,
    stubs: RANDOM_DRAWING_STUBS,
    eventBudget: 75000,
  },
];
const signed = (value) => (value << 16) >> 16;
const hex = (value) => '0x' + value.toString(16);
const palette = new Uint8Array(256 * 4);
for (let color = 0; color < 256; color++) {
  const offset = color * 4;
  palette[offset] = ((color >>> 5) * 255) / 7;
  palette[offset + 1] = (((color >>> 2) & 7) * 255) / 7;
  palette[offset + 2] = (color & 3) * 85;
  palette[offset + 3] = 255;
}

function displayFrame(indices, height) {
  let data;
  return {
    width: WIDTH,
    height,
    get data() {
      if (!data) {
        data = new Uint8ClampedArray(indices.length * 4);
        for (let i = 0, dst = 0; i < indices.length; i++) {
          const src = indices[i] * 4;
          data[dst++] = palette[src];
          data[dst++] = palette[src + 1];
          data[dst++] = palette[src + 2];
          data[dst++] = 255;
        }
      }
      return data;
    },
    takePixels() {
      // The indexed snapshot stays available for a later forced repaint.
      const pixels = this.data;
      data = undefined;
      return pixels;
    },
  };
}

function decodeMq(body, offset, count, transparent) {
  if (offset < 0 || offset + 6 > body.byteLength) throw Error('Некорректный адрес ресурса ADS.');
  const magic = body.getUint16(offset, true);
  const pixels = body.getUint16(offset + 2, true);
  const size = body.getUint16(offset + 4, true);
  const end = offset + size;
  if (magic !== 0x514d || !count || pixels !== count || size <= 6 || end > body.byteLength)
    throw Error('Некорректный заголовок ресурса MQ.');

  const output = new Uint8Array(count);
  const history = new Uint8Array(4096).fill(transparent);
  let cursor = offset + 6;
  let written = 0;
  const byte = () => {
    if (cursor >= end) throw Error('Неполный ресурс MQ.');
    return body.getUint8(cursor++);
  };
  const push = (value) => {
    history[written & 4095] = value;
    output[written++] = value;
  };
  while (written < count) {
    const flags = byte();
    for (let bit = 128; bit && written < count; bit >>= 1) {
      if (flags & bit) push(byte());
      else {
        const token = (byte() << 8) | byte();
        const start = token >>> 4;
        const length = (token & 15) + 3;
        for (let i = 0; i < length && written < count; i++) push(history[(start + i) & 4095]);
      }
    }
  }
  return output;
}

export class AdsRuntime {
  #cpu;
  #audio;
  #profile;
  #body;
  #displayPointer;
  #displayView;
  #stubs;
  #sprites = new Map();
  #pressed = new Set();
  #indices;
  #color = 0;
  #random = 0x12345678;
  #fault = null;
  #closed = false;

  static async create(input, { id, audio } = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!PROFILES.some((candidate) => candidate.bytes === bytes.byteLength))
      throw Error('Этот вариант MBIN пока не поддерживается.');
    // Hold one owned copy from verification through execution.
    const original = Uint8Array.from(bytes);
    const digest = await sha256(original);
    const profile = PROFILES.find(
      (candidate) => candidate.sha256 === digest && candidate.bytes === original.byteLength,
    );
    if (!profile) throw Error('Контрольная сумма оригинала MBIN не совпадает.');
    if (id && id !== profile.id) throw Error('Файл MBIN не соответствует выбранной игре.');
    const cpu = await createARM();
    try {
      return new AdsRuntime(cpu, profile, original.subarray(HEADER_BYTES), audio);
    } catch (error) {
      cpu.close();
      throw error;
    }
  }

  constructor(cpu, profile, body, audio) {
    this.#cpu = cpu;
    this.#profile = profile;
    this.#body = new DataView(body.buffer, body.byteOffset, body.byteLength);
    if (audio) this.#audio = new AdsAudio(this.#body, audio);
    this.#stubs = new Set(profile.stubs ?? STANDARD_STUBS);
    this.width = WIDTH;
    this.height = profile.height ?? DEFAULT_HEIGHT;
    this.#indices = new Uint8Array(WIDTH * this.height);
    this.title = profile.title;
    this.status = 'idle';
    this.eventCount = 0;
    this.presentations = 0;
    this.framebuffer = displayFrame(this.#indices, this.height);

    cpu.map(TEXT, (body.byteLength + 4095) & ~4095);
    cpu.write(TEXT, body);
    // The guest and host use the same display memory. Host drawing can write
    // rows directly without calling back into Unicorn for every span.
    this.#displayPointer = cpu.mapAlias([BSS], BSS_BYTES, 3) + DISPLAY_OFFSET;
    cpu.map(TABLE, 0x4000);
    cpu.map(STACK, STACK_BYTES, 3);
    const entries = new Uint8Array(512);
    const table = new DataView(entries.buffer);
    const stubs = new Uint8Array(512);
    for (let i = 0; i < entries.length; i += 4) {
      table.setUint32(i, STUBS + i + 1, true);
      stubs.set([0x70, 0x47, 0x00, 0xbf], i);
    }
    cpu.write(TABLE, entries);
    cpu.write(STUBS, stubs);
    cpu.onCode(
      (address) => {
        try {
          this.#service(address - STUBS);
        } catch (error) {
          this.#fault = error;
          cpu.stop();
        }
      },
      { begin: STUBS, end: STUBS + stubs.length - 1 },
    );
    this.#dispatch(0, TABLE);
  }

  tick() {
    this.#dispatch(5, this.#profile.timerArgument);
  }

  setKey(code, pressed, repeat = false) {
    if (this.#closed || this.status === 'error') return;
    if (!Number.isInteger(code) || code < 0 || code > 0x1f) return;
    if (!pressed) {
      this.#pressed.delete(code);
      return;
    }
    if (this.#pressed.has(code) && !repeat) return;
    this.#pressed.add(code);
    this.#dispatch(4, code);
  }

  releaseKeys() {
    this.#pressed.clear();
  }

  readIndexedFrame() {
    if (this.#closed) return this.#indices.slice();
    return this.#display().slice();
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.status = 'closed';
    this.releaseKeys();
    this.#sprites.clear();
    this.#displayView = undefined;
    this.#cpu.close();
  }

  #dispatch(event, argument) {
    if (this.#closed || this.status === 'error') return;
    const cpu = this.#cpu;
    const presentations = this.presentations;
    cpu.regWrite('r0', event);
    cpu.regWrite('r1', argument);
    cpu.regWrite('r2', 0);
    cpu.regWrite('r3', 0);
    cpu.regWrite('sp', STACK + 0xff00);
    cpu.regWrite('lr', RETURN + 1);
    try {
      // The shared block watchdog bounds Thumb execution without a JS hook
      // on every guest instruction.
      cpu.runGuarded(TEXT + 1, RETURN, this.#profile.eventBudget ?? EVENT_BUDGET);
      if (this.#fault) throw this.#fault;
      if (cpu.regRead('pc') !== RETURN) throw Error('Событие ADS превысило лимит инструкций.');
      this.eventCount++;
      if (this.presentations !== presentations) this.#captureDisplay();
      this.#audio?.flush(this.eventCount, event === 5);
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  #display() {
    // This view belongs to the mapped LCD allocation. Reacquire it after WASM
    // growth detaches the old heap, and keep presented snapshots independent.
    if (!this.#displayView?.byteLength) {
      this.#displayView = this.#cpu.uc.viewArrayFromMemory(
        this.#displayPointer,
        this.#indices.length,
      );
    }
    return this.#displayView;
  }

  #captureDisplay() {
    const indices = this.#display();
    const words = indices.length / 4;
    const before = new Uint32Array(this.#indices.buffer, this.#indices.byteOffset, words);
    const after = new Uint32Array(indices.buffer, indices.byteOffset, words);
    for (let i = 0; i < after.length; i++) {
      if (before[i] === after[i]) continue;
      this.#indices = indices.slice();
      this.framebuffer = displayFrame(this.#indices, this.height);
      return;
    }
  }

  #writeOutput(address, value, bytes = 4) {
    if (address < BSS || address + bytes > BSS + BSS_BYTES)
      throw Error('Некорректный адрес результата ADS.');
    this.#cpu.writeSized(address, value, bytes);
  }

  #outputAddress() {
    const sp = this.#cpu.regRead('sp');
    if (sp < STACK || sp + 4 > STACK + STACK_BYTES) throw Error('Некорректный адрес стека ADS.');
    return this.#cpu.read32(sp);
  }

  #service(slot) {
    const cpu = this.#cpu;
    if (slot === 0x18 && this.#audio) {
      this.#audio.request(cpu.regRead('r0'), cpu.regRead('r1') - TEXT);
      cpu.regWrite('r0', 0);
      return;
    }
    if (this.#stubs.has(slot)) {
      cpu.regWrite('r0', 0);
      return;
    }
    const a = cpu.regRead('r0');
    if (slot === 0x04) {
      this.#writeOutput(a, DISPLAY);
    } else if (slot === 0x0c && this.#profile.sessionSave) {
      // Acknowledge the save request for state the guest keeps in this session.
      const { address, caller } = this.#profile.sessionSave;
      if (a !== address || cpu.regRead('lr') !== caller)
        throw Error(`Неподдерживаемый вызов ADS ${hex(slot)}.`);
    } else if (slot === 0x40) {
      const low = a & 65535;
      const high = a >>> 16;
      if (low > high) throw Error('Некорректный диапазон генератора ADS.');
      this.#random = (Math.imul(1664525, this.#random) + 1013904223) >>> 0;
      this.#writeOutput(this.#outputAddress(), low + ((this.#random >>> 16) % (high - low + 1)), 2);
    } else if (slot === 0x48) {
      // The archived replay advances this synthetic clock by presentations.
      this.#writeOutput(this.#outputAddress() + 12, this.presentations);
    } else if (slot === 0x9c && this.#profile.id === 'cheombangjichuk-othello') {
      // The board redraw leaves its white background to this call.
      if (a !== 0xff || cpu.regRead('lr') !== TEXT + 0x42eb)
        throw Error(`Неподдерживаемый вызов ADS ${hex(slot)}.`);
      this.#display().fill(a);
    } else if (slot === 0xa0) {
      this.presentations++;
    } else if (slot === 0xc4 && this.#profile.emptySplashDescriptor) {
      // Only these observed splash calls with empty descriptors can be skipped.
      const { address, caller } = this.#profile.emptySplashDescriptor;
      if (
        cpu.regRead('lr') !== caller ||
        cpu.regRead('r1') !== address ||
        cpu.read(address, 12).some((byte) => byte !== 0)
      )
        throw Error(`Неподдерживаемый вызов ADS ${hex(slot)}.`);
    } else {
      this.#draw(slot, a);
      return;
    }
    cpu.regWrite('r0', 0);
  }

  #draw(slot, a) {
    const cpu = this.#cpu;
    if (slot === 0x7c) {
      this.#color = a & 255;
      return;
    }
    const b = cpu.regRead('r1');
    const x = signed(a);
    const y = a >> 16;
    switch (slot) {
      case 0x70:
        this.#blit(x, y, b);
        break;
      case 0x74:
        if (cpu.regRead('r3') !== DISPLAY) throw Error('Неизвестный видеобуфер ADS.');
        if (x < (b & 65535) && y < b >>> 16) this.#plot(x, y, cpu.regRead('r2') & 255);
        break;
      case 0x8c:
        this.#line(x, y, signed(b), b >> 16);
        break;
      case 0x90:
      case 0x94: {
        if (this.#profile.id !== 'couple-bowling')
          throw Error(`Неподдерживаемый вызов ADS ${hex(slot)}.`);
        const end = signed(b);
        if (slot === 0x90) this.#line(x, y, x, end);
        else this.#line(x, y, end, y);
        break;
      }
      case 0x98:
        this.#fill(x, y, b & 65535, b >>> 16);
        break;
      case 0xb0: {
        const address = cpu.regRead('r2');
        const transparency = cpu.regRead('r3');
        // These builds use an empty descriptor while loading their resources.
        if (
          this.#profile.emptyMqDescriptor &&
          a === 0 &&
          b === 0 &&
          address === 0 &&
          transparency === 0
        )
          break;
        const width = b & 255;
        const height = (b >>> 8) & 255;
        const key = transparency & 255;
        const pixels = decodeMq(this.#body, address - TEXT, width * height, key);
        this.#sprites.set(a, { width, height, key, pixels });
        break;
      }
      default:
        throw Error(`Неподдерживаемый вызов ADS ${hex(slot)}.`);
    }
  }

  #blit(x, y, descriptor) {
    const sprite = this.#sprites.get(descriptor);
    if (!sprite) throw Error('Вызов отрисовки неизвестного спрайта ADS.');
    const { width, height, key, pixels } = sprite;
    const left = Math.max(0, -x);
    const right = Math.min(width, WIDTH - x);
    if (left >= right) return;
    const display = this.#display();
    for (let row = Math.max(0, -y); row < Math.min(height, this.height - y); row++) {
      const start = row * width + left;
      const source = pixels.subarray(start, start + right - left);
      const destination = (y + row) * WIDTH + x + left;
      if (source.includes(key)) {
        for (let i = 0; i < source.length; i++) {
          if (source[i] !== key) display[destination + i] = source[i];
        }
      } else {
        display.set(source, destination);
      }
    }
  }

  #plot(x, y, color) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < this.height) this.#display()[y * WIDTH + x] = color;
  }

  #fill(x, y, width, height) {
    const left = Math.max(0, x);
    const right = Math.min(WIDTH, x + width);
    if (left >= right) return;
    const display = this.#display();
    for (let line = Math.max(0, y); line < Math.min(this.height, y + height); line++)
      display.fill(this.#color, line * WIDTH + left, line * WIDTH + right);
  }

  #line(x, y, endX, endY) {
    if (y === endY) {
      this.#fill(Math.min(x, endX), y, Math.abs(endX - x) + 1, 1);
      return;
    }
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.#plot(x, y, this.#color);
      if (x === endX && y === endY) return;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x += stepX;
      }
      if (twice <= dx) {
        error += dx;
        y += stepY;
      }
    }
  }
}
