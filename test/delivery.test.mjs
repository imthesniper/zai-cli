import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/util.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('package version, binary version, public entry, and pinned runtime dependency agree', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, VERSION);
  assert.deepEqual(pkg.dependencies, { 'zcode-app-cli': '3.15.3-37' });
  assert.equal(Object.keys(pkg.devDependencies || {}).length, 0);
  for (const file of Object.values(pkg.bin)) assert.ok((await lstat(join(root, file))).isFile());
});
test('documentation has no broken local links or missing images', async () => {
  const docs = ['README.md', 'SECURITY.md', ...((await readdir(join(root, 'docs'))).filter(name => name.endsWith('.md')).map(name => 'docs/' + name))];
  for (const file of docs) {
    const text = await readFile(join(root, file), 'utf8');
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const path = resolve(dirname(join(root, file)), decodeURIComponent(target));
      assert.ok((await lstat(path)).isFile(), `${file}: ${target}`);
    }
  }
});
test('CI defines all three OS targets and both Node target lines', async () => {
  const ci = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8');
  for (const expected of ['ubuntu-latest', 'macos-latest', 'windows-latest', '24.14.0', '24.x', 'npm run check', 'npm pack', 'zc demo --plain']) assert.ok(ci.includes(expected));
  assert.ok(ci.includes('contents: read')); assert.ok(!ci.includes('secrets.'));
});
test('CI package installation and every release-artifact reference match the current package version', async () => {
  const ci = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8');
  const names = [...ci.matchAll(/striking-lions-zc-(\\d+\\.\\d+\\.\\d+)\\.tgz/g)].map(match => match[1]);
  assert.ok(names.length >= 2, 'The installer and CI must name the tarball.');
  for (const version of names) assert.equal(version, VERSION, 'CI references a stale tarball version.');
});
test('GitHub public preview is CI-gated and cannot silently replace an existing release', async () => {
  const ci = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(ci.includes("startsWith(github.event.head_commit.message, 'release: ZC v0.2.0 public preview')"));
  assert.ok(ci.includes('needs: [verify, isolated_live_image, dependencies, distribution]'));
  assert.ok(ci.includes('contents: write'));
  assert.ok(ci.includes('gh release view v0.2.0'));
  assert.ok(ci.includes('git ls-remote --tags --exit-code'));
  assert.ok(ci.includes('--target "$GITHUB_SHA"'));
  assert.ok(ci.includes('--notes-file docs/releases/v0.2.0.md'));
  assert.ok(ci.includes('--prerelease'));
  assert.ok(!ci.includes('npm publish'));
});
test('distribution lock pins each runtime dependency to a verified HTTPS npm archive', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'npm-shrinkwrap.json'), 'utf8'));
  assert.equal(lock.version, VERSION); assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.equal(lock.packages['node_modules/zcode-app-cli'].version, pkg.dependencies['zcode-app-cli']);
  const entries = Object.entries(lock.packages).filter(([name]) => name);
  assert.equal(entries.length, 5);
  for (const [name, value] of entries) {
    assert.equal(new URL(value.resolved).origin, 'https://registry.npmjs.org', name);
    assert.match(value.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/, name);
    assert.ok(!value.link && !value.hasInstallScript, name);
    for (const dependency of Object.keys(value.dependencies || {})) assert.ok(lock.packages[`node_modules/${dependency}`], dependency);
  }
});
