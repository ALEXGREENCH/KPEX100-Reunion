import { SgsFile } from './sgs.js';
import { VirtualFileSystem } from './vfs.js';

const dosFile = /^[A-Z0-9_-]{1,8}\.[A-Z0-9_-]{1,3}$/;

// One verified copy lives in the SGS. The cold-boot disk and export reuse it.
export async function cartridgeDiskFiles(metadata, sgs) {
  const [folder, name, extra] = metadata.path.split('/');
  if (
    !['NES', 'GB', 'GBC', 'GG'].includes(folder) ||
    !dosFile.test(name) ||
    extra !== undefined ||
    !dosFile.test(metadata.launcher) ||
    (metadata.sidecar && !dosFile.test(metadata.sidecar))
  )
    throw Error('Invalid cartridge path: ' + metadata.path);
  const files = new VirtualFileSystem(await SgsFile.open(sgs)).files;
  const data = files.get((metadata.sidecar || metadata.path).toLowerCase());
  if (!data) throw Error('Cartridge is missing from SGS: ' + metadata.path);
  return [{ folder, name, data }, ...(metadata.sidecar ? [{ name: metadata.sidecar, data }] : [])];
}

export function replaceCartridge(sgs, filename, cartridge) {
  const template = new SgsFile(sgs);
  if (
    template.version !== 4 ||
    template.wrapperBytes !== 0 ||
    !dosFile.test(filename) ||
    !new VirtualFileSystem(template).files.has(filename.toLowerCase())
  )
    throw Error('Не найден подходящий загрузчик картриджа.');
  const name = new TextEncoder().encode(filename + '\0');
  const tableSize = 12 + name.length;
  const base = template.declaredSize;
  const offset = base + 8 + tableSize;
  const result = new Uint8Array(offset + cartridge.length);
  result.set(template.body.subarray(0, base));
  const view = new DataView(result.buffer);
  view.setUint32(base, tableSize, true);
  view.setUint32(base + 4, 1, true);
  view.setUint32(base + 8, name.length, true);
  result.set(name, base + 12);
  view.setUint32(offset - 8, offset, true);
  view.setUint32(offset - 4, cartridge.length, true);
  result.set(cartridge, offset);
  if (template.xorMask) for (let i = 0; i < result.length; i++) result[i] ^= template.xorMask;
  return result;
}
