import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Regression guard for the Android permission surface.
 *
 * Daymark declares ACCESS_COARSE_LOCATION and deliberately does NOT declare
 * ACCESS_FINE_LOCATION: the operating system therefore supplies an
 * approximate fix, which is the strongest location guarantee the app can
 * offer on Android. No automated check covered that promise, so a re-added
 * ACCESS_FINE_LOCATION would have merged green.
 *
 * The test reads the *source* manifest. The merged manifest is a Gradle
 * build artefact (android/app/build/, not committed) and additionally carries
 * permissions injected by AndroidX libraries
 * (…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION), which are not Daymark's
 * decision. Library modules are checked separately so that nothing can
 * smuggle a permission into the merged manifest.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const androidRoot = path.join(projectRoot, 'android');
const appManifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');

/** Every permission Daymark is allowed to request. */
const APPROVED_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.INTERNET',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.RECORD_AUDIO',
];

/**
 * Permission names declared by the manifest, in document order.
 *
 * Comments are deliberately NOT stripped: a commented-out permission is
 * still counted, so a precise permission that someone disables rather
 * than deletes fails this test instead of passing unnoticed.
 */
function declaredPermissions(manifest: string): string[] {
  const tags = manifest.match(/<uses-permission(?:-sdk-\d+)?\b[^>]*>/g) ?? [];
  return tags.map((tag) => {
    const name = tag.match(/android:name=["']([^"']+)["']/);
    if (!name) throw new Error(`uses-permission without an android:name: ${tag}`);
    return name[1];
  });
}

/** Manifests of the Gradle modules that are merged into the app manifest. */
function libraryModuleManifests(): string[] {
  return readdirSync(androidRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'app')
    .map((entry) => path.join(androidRoot, entry.name, 'src', 'main', 'AndroidManifest.xml'))
    .filter((file) => {
      try {
        readFileSync(file, 'utf8');
        return true;
      } catch {
        return false;
      }
    });
}

describe('android manifest permission surface', () => {
  it('requests exactly the approved permissions and nothing else', () => {
    const manifest = readFileSync(appManifestPath, 'utf8');
    expect(declaredPermissions(manifest).sort()).toEqual([...APPROVED_PERMISSIONS].sort());
  });

  it('asks for approximate location only and never for a precise fix', () => {
    const manifest = readFileSync(appManifestPath, 'utf8');
    expect(declaredPermissions(manifest)).toContain('android.permission.ACCESS_COARSE_LOCATION');
    // A commented-out entry is not a request, but it must not come back
    // unnoticed: the manifest must not mention precise location at all.
    expect(manifest).not.toContain('ACCESS_FINE_LOCATION');
  });

  it('keeps library modules free of permission declarations', () => {
    for (const file of libraryModuleManifests()) {
      expect(declaredPermissions(readFileSync(file, 'utf8')), file).toEqual([]);
    }
  });

  it('keeps the app backup switch off', () => {
    const manifest = readFileSync(appManifestPath, 'utf8');
    expect(manifest).toContain('android:allowBackup="false"');
  });
});
