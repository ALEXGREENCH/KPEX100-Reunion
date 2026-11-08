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
