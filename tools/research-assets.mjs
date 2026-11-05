import fs from 'node:fs';
import path from 'node:path';
import { verifyAsset } from './catalog-assets.mjs';

/** Research downloads live in Git; Pages links to their exact preserved bytes. */
export function verifyResearchAssets(root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'web/research/catalog.json')));
  if (
    catalog.schema !== 1 ||
    !Array.isArray(catalog.artifacts) ||
    (catalog.reports !== undefined && !Array.isArray(catalog.reports))
  )
    throw Error('Invalid research catalogue schema');
  if (!/^[\w.-]+\/[\w.-]+$/.test(catalog.repository) || !/^[\w.-]+$/.test(catalog.revision))
    throw Error('Invalid research repository reference');
  const paths = new Set();
  for (const entry of catalog.artifacts) {
    if (
      !/^research\/archives\/[A-Za-z0-9_.-]+\.zip$/.test(entry.repositoryPath) ||
      paths.has(entry.repositoryPath) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw Error('Invalid research archive metadata');
    paths.add(entry.repositoryPath);
    for (const source of entry.sources)
      if (new URL(source.url).protocol !== 'https:')
        throw Error('Research source URL must use HTTPS');
    verifyAsset(root, { ...entry, url: entry.repositoryPath });
  }
  for (const report of catalog.reports || []) {
    if (!/^doc\/[A-Za-z0-9_.-]+\.md$/.test(report.repositoryPath))
      throw Error('Invalid research report path');
    const file = path.join(root, report.repositoryPath);
    if (!fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
      throw Error('Missing or linked research report');
  }
  return catalog.artifacts;
}
