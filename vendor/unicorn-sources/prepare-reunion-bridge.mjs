// SPDX-License-Identifier: GPL-2.0
// Reproduce Reunion's two bridge changes from the exact upstream release JS.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length)
  throw Error('Usage: node prepare-reunion-bridge.mjs upstream-unicorn_arm.js NEW-output.js');
const original = fs.readFileSync(input);
if (
  createHash('sha256').update(original).digest('hex') !==
  '2807daf6b7d28e7ee468f234b2d068761e2efa35194164f0b963db0b0d943be3'
)
  throw Error('Expected unmodified Unicorn.js ARM 1.0.3 release bridge');
const anchor = 'Module["writeArrayToMemory"]=writeArrayToMemory;';
const source = original.toString('utf8');
if (source.split(anchor).length !== 2) throw Error('Ambiguous bridge export');
// Resolve HEAPU8 at each call: Emscripten replaces it when WASM memory grows.
// slice returns owned bytes; no host view can alias the reusable transfer buffer.
const helper =
  'Module["readArrayFromMemory"]=(pointer,length)=>{if(!Number.isSafeInteger(pointer)||!Number.isSafeInteger(length)||pointer<0||length<0||pointer+length>HEAPU8.length)throw new RangeError("WASM memory copy bounds");return HEAPU8.slice(pointer,pointer+length)};';
const result =
  source.replace(anchor, anchor + helper) + '\nglobalThis.MUnicornLegacy = MUnicorn;\n';
fs.writeFileSync(output, result, { flag: 'wx' });
console.log(createHash('sha256').update(result).digest('hex'));
