import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function precacheList() {
  const src = readFileSync(join(PUBLIC, 'sw.js'), 'utf8');
  const block = src.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', `${file} is a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('PWA assets', () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'));

  test('manifest has the fields required for installation', () => {
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name && manifest.short_name);
    assert.ok(manifest.start_url && manifest.scope);
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  });

  test('manifest icons exist with the declared sizes, including maskable 192 and 512', () => {
    for (const icon of manifest.icons) {
      const file = join(PUBLIC, icon.src);
      assert.ok(existsSync(file), `${icon.src} exists`);
      if (icon.type === 'image/png') {
        const [w, h] = pngSize(file);
        assert.equal(`${w}x${h}`, icon.sizes, icon.src);
      }
    }
    const has = (size, purpose) => manifest.icons.some((i) => i.sizes === size && i.purpose.split(' ').includes(purpose));
    assert.ok(has('192x192', 'any') && has('512x512', 'any'));
    assert.ok(has('192x192', 'maskable') && has('512x512', 'maskable'));
  });

  test('apple touch icon is 180x180', () => {
    assert.deepEqual(pngSize(join(PUBLIC, 'icons', 'apple-touch-icon.png')), [180, 180]);
  });

  test('service worker precaches every shipped file and nothing that is missing', () => {
    const precached = new Set(precacheList().filter((u) => u !== './').map((u) => u.replace(/^\.\//, '')));
    const shipped = listFiles(PUBLIC)
      .map((f) => relative(PUBLIC, f).split('\\').join('/'))
      .filter((f) => f !== 'sw.js' && !f.endsWith('.DS_Store'));
    for (const file of shipped) assert.ok(precached.has(file), `${file} is precached`);
    for (const file of precached) assert.ok(existsSync(join(PUBLIC, file)), `${file} exists`);
  });

  test('index.html references only local resources', () => {
    const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.doesNotMatch(ref, /^(https?:)?\/\//, `${ref} is not remote`);
      if (!ref.startsWith('#')) assert.ok(existsSync(join(PUBLIC, ref)), `${ref} exists`);
    }
  });

  test('no remote requests anywhere in the shipped code', () => {
    for (const file of listFiles(PUBLIC).filter((f) => /\.(js|css|html)$/.test(f))) {
      const src = readFileSync(file, 'utf8');
      assert.doesNotMatch(src, /https?:\/\/(?!www\.w3\.org)/, `${relative(PUBLIC, file)} has no remote URLs`);
    }
  });
});
