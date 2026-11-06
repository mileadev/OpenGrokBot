import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runOpenAiTurn } from './openai.js'
import type { Agent, Conversation, Team } from '../../shared/types.js'

function fixture(workspace: string) {
  const agent: Agent = {
    id: 'bot', name: 'BOT', role: 'Assistant', provider: 'local', model: 'test-model',
    color: '#fff', shape: 'blob', effort: 'low', personality: 'Answer.',
    tools: [], permissionMode: 'dontAsk', mcpServers: [], inheritClaudeSettings: false,
    autoApproveTools: false, muted: false, approvals: 'ask-all',
  }
  const conversation: Conversation = {
    id: 'dm-bot', kind: 'dm', name: 'BOT', memberIds: ['user', 'bot'], sessions: {},
    messages: [{ id: 'u1', conversationId: 'dm-bot', authorId: 'user', text: 'hello', createdAt: 1, status: 'done' }],
  }
  const team: Team = {
    company: 'Test', owner: { id: 'user', name: 'Owner', title: 'Lead' }, workspace,
    agents: [agent], providers: { local: { kind: 'openai', label: 'Mock', baseUrl: 'http://localhost:9999/v1' } },
    mcpServers: {}, skills: {}, settings: {
      maxMessagesPerRound: 1, maxTurnsPerAgentPerRound: 1, maxTurnsPerReply: 3,
      groupMode: 'mentions-only', language: 'en', notifications: false, autoReview: [],
    },
  }
  return { team, agent, conversation, provider: team.providers.local! }
}

function sse(parts: object[]): Response {
  return new Response(parts.map((p) => 'data: ' + JSON.stringify(p) + '\n\n').join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  })
}

test('OpenAI model cannot call an unconfigured file-write tool', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ogb-allowlist-'))
  const file = path.join(cwd, 'should-not-exist.txt')
  const originalFetch = globalThis.fetch
  let requests = 0
  try {
    globalThis.fetch = async (_url, init) => {
      requests++
      if (requests === 1) return sse([{ choices: [{ delta: { tool_calls: [{
        index: 0, id: 'call1', function: { name: 'write_file', arguments: JSON.stringify({ path: file, content: 'unapproved' }) },
      }] }, finish_reason: 'tool_calls' }] }])
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
      assert.match(body.messages.find((m) => m.role === 'tool')?.content ?? '', /Denied: tool not enabled/)
      return sse([{ choices: [{ delta: { content: 'Safely denied.' }, finish_reason: 'stop' }] }])
    }
    const fx = fixture(cwd)
    const result = await runOpenAiTurn({
      ...fx, signal: new AbortController().signal, sessionId: undefined,
      handlers: { onDelta: () => {}, onActivity: () => {}, onSession: () => {}, onToolPermission: async () => true },
    })
    assert.equal(result.text, 'Safely denied.')
    assert.equal(existsSync(file), false)
    assert.equal(requests, 2)
  } finally { globalThis.fetch = originalFetch; rmSync(cwd, { recursive: true, force: true }) }
})

test('approval denial blocks an advertised local file-write', async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ogb-approval-'))
  const file = path.join(cwd, 'should-not-exist.txt')
  const originalFetch = globalThis.fetch
  let requests = 0
  try {
    globalThis.fetch = async () => {
      requests++
      if (requests === 1) return sse([{ choices: [{ delta: { tool_calls: [{
        index: 0, id: 'call1', function: { name: 'write_file', arguments: JSON.stringify({ path: file, content: 'unapproved' }) },
      }] }, finish_reason: 'tool_calls' }] }])
      return sse([{ choices: [{ delta: { content: 'Denied.' }, finish_reason: 'stop' }] }])
    }
    const fx = fixture(cwd)
    fx.agent.tools = ['Write']
    let checked = false
    await runOpenAiTurn({
      ...fx, signal: new AbortController().signal, sessionId: undefined,
      handlers: { onDelta: () => {}, onActivity: () => {}, onSession: () => {}, onToolPermission: async () => { checked = true; return false } },
    })
    assert.equal(checked, true)
    assert.equal(existsSync(file), false)
  } finally { globalThis.fetch = originalFetch; rmSync(cwd, { recursive: true, force: true }) }
})
