import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runLocalTool } from './localtools.js'

test('file discovery does not follow symlinked directories outside workspace', async () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'ogb-walk-'))
  try {
    const root = path.join(base, 'workspace')
    const elsewhere = path.join(base, 'outside')
    mkdirSync(root); mkdirSync(elsewhere)
    writeFileSync(path.join(root, 'allowed.txt'), 'visible')
    writeFileSync(path.join(elsewhere, 'secret.txt'), 'secret')
    symlinkSync(elsewhere, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    const signal = new AbortController().signal
    const files = await runLocalTool('list_files', { pattern: '**/*.txt' }, root, false, signal)
    assert.match(files, /allowed.txt/)
    assert.doesNotMatch(files, /secret.txt/)
    const hits = await runLocalTool('search_files', { pattern: 'secret' }, root, false, signal)
    assert.equal(hits, 'No matches.')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('default API agent is denied arbitrary shell execution', async () => {
  const signal = new AbortController().signal
  const out = await runLocalTool('run_command', { command: 'echo test' }, os.tmpdir(), false, signal)
  assert.match(out, /Denied/)
})
