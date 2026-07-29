import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(rootDir, 'package.json');
const versionTsPath = resolve(rootDir, 'src', 'version.ts');

try {
  const pkgContent = readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgContent);
  const pkgVersion = pkg.version;

  const versionTsContent = readFileSync(versionTsPath, 'utf-8');
  const match = versionTsContent.match(/export const VERSION = ['"]([^'"]+)['"];/);
  const tsVersion = match ? match[1] : null;

  if (tsVersion && pkgVersion !== tsVersion) {
    const pkgStat = statSync(pkgPath);
    const tsStat = statSync(versionTsPath);

    if (tsStat.mtimeMs > pkgStat.mtimeMs) {
      // src/version.ts was edited more recently -> update package.json
      const updatedPkgContent = pkgContent.replace(
        /"version":\s*["'].*?["']/,
        `"version": "${tsVersion}"`
      );
      writeFileSync(pkgPath, updatedPkgContent, 'utf-8');
      console.log(`[version-sync] Synced package.json -> ${tsVersion}`);
    } else {
      // package.json was edited more recently -> update src/version.ts
      const updatedTsContent = versionTsContent.replace(
        /export const VERSION = ['"].*?['"];/,
        `export const VERSION = '${pkgVersion}';`
      );
      writeFileSync(versionTsPath, updatedTsContent, 'utf-8');
      console.log(`[version-sync] Synced src/version.ts -> ${pkgVersion}`);
    }
  }
} catch (e) {
  console.error('[version-sync] Failed to sync version:', e);
}
