import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'

async function findTests(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await findTests(absolute))
    else if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(absolute)
  }
  return out
}

const files = (await findTests(path.resolve('dist/server'))).sort()
if (files.length === 0) {
  console.error('[test] no compiled test files found')
  process.exitCode = 1
} else {
  console.log(`[test] running ${files.length} compiled test files`)
  const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' })
  child.on('error', (err) => { console.error(err); process.exitCode = 1 })
  child.on('close', (code) => { process.exitCode = code ?? 1 })
}
