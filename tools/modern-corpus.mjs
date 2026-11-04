import fs from 'node:fs';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { GnexRuntime, sha256 } from '../web/engine/gnex.js';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const root = 'web/',
  outdir = 'validation/corpus/',
  catalog = JSON.parse(fs.readFileSync(root + 'data/catalog.json'));
fs.mkdirSync(outdir, { recursive: true });
function png(w, h, rgba) {
  const table = Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t, b) => {
    const data = Buffer.concat([Buffer.from(t), b]),
      o = Buffer.alloc(b.length + 12);
    o.writeUInt32BE(b.length);
    data.copy(o, 4);
    o.writeUInt32BE(crc(data), o.length - 4);
    return o;
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 6;
  const scan = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(scan, y * (w * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(scan)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
if (process.argv[2] && !process.argv[2].startsWith('--')) {
  const play = process.env.REUNION_PLAY === '1';
  const a = catalog.games.find((x) => x.id === process.argv[2]),
    profiles = JSON.parse(fs.readFileSync('validation/phone-profiles.json')).profiles;
  let g,
    t = 0;
  const stages = [];
  const result = { id: a.id, title: a.title, sha256: a.sha256 };
  fs.writeFileSync(outdir + a.id + '.json', JSON.stringify({ ...result, status: 'running' }));
  try {
    g = await GnexRuntime.create(
      fs.readFileSync(root + 'data/firmware/Kingston-2.12.rom'),
      fs.readFileSync(root + a.url),
      {
        ...a.runtime,
        ...profiles[a.id],
        ...(a.format === 36
          ? { swerve: { binary: fs.readFileSync(root + 'engine/vendor/swerve/swv21brew.mod') } }
          : {}),
        clock: () => new Date(2026, 0, 1, 12, 0, 0),
        nowMs: () => t,
      },
    );
    const capture = async (stage) => {
      const hash = await sha256(g.framebufferRGBA);
      stages.push({
        stage,
        hash,
        status: g.status,
        events: g.eventCount,
        timer: g.timerMs,
        bytecode: g.diagnostics.bytecode_pc,
      });
      fs.writeFileSync(
        outdir + a.id + '-' + stage + '.png',
        png(g.width, g.height, g.framebufferRGBA),
      );
    };
    const deadlines = new Map();
    const ticks = (count) => {
      for (let i = 0; i < count && g.status === 'idle'; i++) {
        for (const timer of g.timerStates) {
          const old = deadlines.get(timer.channel);
          if (!timer.delay) deadlines.delete(timer.channel);
          else if (!old || old.revision !== timer.revision)
            deadlines.set(timer.channel, { ...timer, due: t + timer.delay });
        }
        if (!deadlines.size) break;
        const timer = [...deadlines.values()].sort(
          (a, b) => a.due - b.due || a.channel - b.channel,
        )[0];
        t = timer.due;
        g.event('TIMEOUT', timer.channel, 20_000_000);
        if (timer.repeat) timer.due = t + timer.delay;
        else deadlines.delete(timer.channel);
      }
    };
    g.event('START', 0, 20_000_000);
    await capture('start');
    ticks(play ? 300 : 120);
    await capture('intro');
    for (const code of play
      ? [0x0c, 0x14, 0x14, 0x14, 1, 0x14, 5, 0x12, 5, 0x11, 5, 0x13, 5, 0x10, 5]
      : [0x14, 0x15, 0x05]) {
      if (g.status !== 'idle') break;
      g.setKey(code, true);
      if (play) ticks(5);
      g.setKey(code, false);
      ticks(play ? 25 : 20);
      await capture('key' + code);
    }
    Object.assign(result, {
      version: g.sgs.version,
      status: g.status,
      error: g.error,
      events: g.eventCount,
      stages,
      diagnostics: g.diagnostics,
    });
  } catch (e) {
    Object.assign(result, { status: 'unsupported', error: String(e.stack || e) });
  } finally {
    g?.close();
  }
  fs.writeFileSync(outdir + a.id + '.json', JSON.stringify(result, null, 2));
  console.log(a.id, result.status, result.error || '');
} else {
  const results = [];
  if (process.argv.includes('--play')) process.env.REUNION_PLAY = '1';
  for (const a of catalog.games.filter((a) => [4, 36].includes(a.format))) {
    const p = spawnSync(process.execPath, [import.meta.filename, a.id], {
      timeout: 90_000,
      encoding: 'utf8',
    });
    console.log(p.stdout.trim() || a.id + ':' + (p.error || p.stderr));
    try {
      if (p.error || p.status !== 0) throw p.error || Error(p.stderr);
      results.push(JSON.parse(fs.readFileSync(outdir + a.id + '.json')));
    } catch {
      results.push({ id: a.id, status: 'runner-error', error: String(p.error || p.stderr) });
    }
  }
  fs.writeFileSync(
    outdir + 'results.json',
    JSON.stringify(
      {
        scope:
          'Deterministic original ARM START plus scheduled timers and held keys; 20M ARM/event and 90s/game; smoke coverage, not completion proof',
        results,
      },
      null,
      2,
    ),
  );
}
