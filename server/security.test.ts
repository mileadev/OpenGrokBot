import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { insideRoots, safeFetchUrl, trustedRequestOrigin } from './security.js'

test('file root containment rejects traversal and symlink escapes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ogb-security-'))
  try {
    const permitted = path.join(root, 'work')
    const elsewhere = path.join(root, 'other')
    mkdirSync(permitted)
    mkdirSync(elsewhere)
    writeFileSync(path.join(permitted, 'safe.txt'), 'ok')
    writeFileSync(path.join(elsewhere, 'secret.txt'), 'secret')
    symlinkSync(elsewhere, path.join(permitted, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(insideRoots(path.join(permitted, 'safe.txt'), [permitted]), true)
    assert.equal(insideRoots(path.join(permitted, 'link', 'secret.txt'), [permitted]), false)
    assert.equal(insideRoots(path.join(permitted, 'link', 'new.txt'), [permitted], true), false)
    assert.equal(insideRoots(path.join(permitted, 'new.txt'), [permitted], true), true)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('untrusted web URLs reject IP literals and local hostnames', () => {
  for (const target of ['http://127.0.0.1/', 'http://[::1]/', 'http://localhost/', 'http://metadata.google.internal/']) {
    assert.throws(() => safeFetchUrl(target))
  }
  assert.equal(safeFetchUrl('https://example.org/page').hostname, 'example.org')
})

test('mutation origins block cross-site browsers', () => {
  const req = (origin?: string, site?: string) => ({ get: (key: string) =>
    key === 'origin' ? origin : key === 'host' ? '127.0.0.1:4310' : key === 'sec-fetch-site' ? site : undefined,
  }) as Parameters<typeof trustedRequestOrigin>[0]
  assert.equal(trustedRequestOrigin(req('https://evil.example', 'cross-site')), false)
  assert.equal(trustedRequestOrigin(req('http://127.0.0.1:4310', 'same-origin')), true)
  assert.equal(trustedRequestOrigin(req('http://127.0.0.1:5180', 'same-origin')), true)
  assert.equal(trustedRequestOrigin(req(undefined, 'cross-site')), false)
})
