#!/usr/bin/env node
/** Read a GNEX/GVM container without executing guest bytecode. Node 22+. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SgsFile, detectVersion } from '../web/engine/sgs.js';
import { parseLegacy } from '../web/engine/legacy.js';

const args = process.argv.slice(2);
const usage = 'node tools/sgs-info.mjs GAME.sgs [--json] [--resource INDEX --out FILE]';
try {
  if (!args.length || args.includes('--help')) {
    console.log(usage);
  } else {
    const file = args.shift();
    let json = false,
      index = null,
      output = null;
    while (args.length) {
      const flag = args.shift();
      if (flag === '--json') json = true;
      else if (flag === '--resource') {
        const value = args.shift();
        if (!/^\d+$/.test(value || '')) throw Error('Resource index must be a nonnegative integer');
        index = Number(value);
      } else if (flag === '--out') output = args.shift();
      else throw Error('Unknown option: ' + flag);
    }
    if ((index !== null) !== Boolean(output))
      throw Error('--resource and --out must be used together');
    const raw = fs.readFileSync(file),
      version = detectVersion(raw);
    const parsed = version < 4 ? parseLegacy(raw) : new SgsFile(raw);
    const sha256 = (data) => createHash('sha256').update(data).digest('hex');
    const resourceTypes = {};
    for (const resource of parsed.resources)
      resourceTypes[resource.type] = (resourceTypes[resource.type] || 0) + 1;
    const report = {
      file: path.resolve(file),
      title: parsed.title,
      version: parsed.version,
      bytes: raw.length,
      sha256: sha256(raw),
      wrapperBytes: parsed.wrapperBytes,
      xorMask: parsed.xorMask,
      declaredSize: parsed.declaredSize,
      sections: {
        variables: parsed.a,
        initialValues: parsed.b,
        resources: parsed.c,
        payload: parsed.d,
      },
      entries: parsed.entries,
      variables: parsed.variables.length,
      resources: parsed.resources.length,
      resourceTypes,
    };
    if (output) {
      const resource = parsed.resource(index);
      // Exclusive creation avoids accidentally replacing an original SGS or another extraction.
      fs.writeFileSync(output, resource.data, { flag: 'wx' });
      report.extracted = {
        index,
        type: resource.type,
        bytes: resource.data.length,
        sha256: sha256(resource.data),
        file: path.resolve(output),
      };
    }
    console.log(
      json
        ? JSON.stringify(report, null, 2)
        : [
            `${report.title || '(untitled)'} · SGS ${version}`,
            `${report.bytes} bytes · SHA-256 ${report.sha256}`,
            `Wrapper: ${report.wrapperBytes} bytes · XOR: 0x${report.xorMask.toString(16)}`,
            `${report.variables} variables · ${report.resources} resources`,
            `Events: ${Object.entries(report.entries)
              .filter(([, offset]) => offset)
              .map(([name, offset]) => `${name}=0x${offset.toString(16)}`)
              .join(', ')}`,
            ...(report.extracted ? [`Extracted resource ${index}: ${report.extracted.file}`] : []),
          ].join('\n'),
    );
  }
} catch (error) {
  console.error(error.message + '\n' + usage);
  process.exitCode = 1;
}
