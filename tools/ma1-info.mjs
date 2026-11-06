import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMa1 } from '../web/engine/ma1.js';
import { parseLegacy } from '../web/engine/legacy.js';

const [file, resource, ...rest] = process.argv.slice(2);
if (!file || rest.length || (resource !== undefined && !/^\d+$/.test(resource))) {
  console.error('Usage: node tools/ma1-info.mjs SOUND.bin | LEGACY.sgs RESOURCE_INDEX');
  process.exitCode = 1;
} else {
  try {
    if (fs.statSync(file).size > 16 * 1024 * 1024) throw Error('Inspection input exceeds 16 MiB');
    const source = fs.readFileSync(file);
    const data =
      resource === undefined ? source : parseLegacy(source).resources[Number(resource)]?.data;
    if (!data) throw Error('Legacy SGS resource does not exist');
    console.log(
      JSON.stringify(
        {
          sourceSha256: createHash('sha256').update(source).digest('hex'),
          resource: resource === undefined ? null : Number(resource),
          payloadSha256: createHash('sha256').update(data).digest('hex'),
          ...parseMa1(data),
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
