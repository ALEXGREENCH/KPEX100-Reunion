// SPDX-License-Identifier: GPL-2.0
// Reproduce Reunion's bridge changes from the exact upstream release JS.
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
// Emscripten replaces HEAPU8 when memory grows. The view is only for callers
// that own the underlying allocation and can refresh detached views.
const memoryViews =
  'Module["reunionWasmMemory"]=()=>wasmMemory;' +
  'const checkArrayRange=(pointer,length)=>{if(!Number.isSafeInteger(pointer)||!Number.isSafeInteger(length)||pointer<0||length<0||pointer+length>HEAPU8.length)throw new RangeError("WASM memory copy bounds")};' +
  'Module["viewArrayFromMemory"]=(pointer,length)=>{checkArrayRange(pointer,length);return HEAPU8.subarray(pointer,pointer+length)};' +
  'Module["readArrayFromMemory"]=(pointer,length)=>{checkArrayRange(pointer,length);return HEAPU8.slice(pointer,pointer+length)};';
const result =
  source.replace(anchor, anchor + memoryViews) + '\nglobalThis.MUnicornLegacy = MUnicorn;\n';
fs.writeFileSync(output, result, { flag: 'wx' });
console.log(createHash('sha256').update(result).digest('hex'));
