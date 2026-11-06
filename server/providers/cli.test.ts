import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unsafeWindowsArg } from './cli.js'

test('Windows CLI argument filter rejects shell metacharacters and quote breakouts', () => {
  for (const arg of ['model&whoami', 'model|cmd', 'a > file', '%USERPROFILE%', '!ENV!', 'foo^bar', 'x" --dangerously-bypass-approvals-and-sandbox', 'x\nwhoami']) {
    assert.equal(unsafeWindowsArg(arg), true, arg)
  }
  for (const arg of ['us-east-1', 'arn:aws:bedrock:us-east-1:123456789012:inference-profile/abc', 'C:\\Users\\Test Folder', 'model_reasoning_effort="medium"']) {
    assert.equal(unsafeWindowsArg(arg), false, arg)
  }
})
