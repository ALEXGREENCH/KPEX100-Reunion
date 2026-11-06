import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLegacy } from '../web/engine/legacy.js';
import { renderMa1 } from '../web/engine/ma1-render.js';

const args = process.argv.slice(2);
if (![2, 3].includes(args.length) || (args.length === 3 && !/^\d+$/.test(args[1]))) {
  console.error(
    'Usage: node tools/render-ma1.mjs SOUND.bin OUTPUT.wav | LEGACY.sgs RESOURCE_INDEX OUTPUT.wav',
  );
  process.exitCode = 1;
} else {
  try {
    const [file] = args,
      output = args.at(-1);
    if (fs.existsSync(output)) throw Error('Output must be a new file');
    if (fs.statSync(file).size > 16 * 1024 * 1024) throw Error('Inspection input exceeds 16 MiB');
    const source = fs.readFileSync(file);
    const data = args.length === 2 ? source : parseLegacy(source).resources[Number(args[1])]?.data;
    if (!data) throw Error('Legacy SGS resource does not exist');
    const started = performance.now();
    const result = await renderMa1(data);
    fs.writeFileSync(output, result.wave, { flag: 'wx' });
    const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
    console.log(
      JSON.stringify(
        {
          sourceSha256: hash(source),
          payloadSha256: hash(data),
          outputSha256: hash(result.wave),
          outputBytes: result.wave.length,
          frames: result.frames,
          rate: result.rate,
          durationSeconds: result.frames / result.rate,
          peak: result.peak,
          truncated: result.truncated,
          wallMs: performance.now() - started,
          scope:
            'Nominal four-part MA1 synthesis with the resource patches. FM arithmetic and speaker response are approximate.',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
