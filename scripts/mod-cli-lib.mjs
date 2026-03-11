import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findManifestFile } from '../../dev-tools/lib/index.mjs';

export {
  buildConfig,
  buildMod,
  doctorMod,
  findManifestFile,
  packMod,
  parseManifest,
} from '../../dev-tools/lib/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const modsRoot = path.resolve(__dirname, '..');

export function resolveModDir(cwd, explicitMod) {
  const normalizedExplicit = String(explicitMod || '').trim();
  if (normalizedExplicit) {
    return path.resolve(modsRoot, normalizedExplicit);
  }
  if (findManifestFile(cwd)) {
    return cwd;
  }
  throw new Error('Current working directory is not a mod root. Run from a mod directory or pass --mod <name>.');
}
