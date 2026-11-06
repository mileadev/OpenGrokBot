import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchPublicText, isPublicAddress } from './http-fetch.js'

test('blocks loopback, link-local, private, reserved and mapped addresses', () => {
  const denied = [
    '0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '198.18.0.1', '192.0.2.1',
    '203.0.113.1', '224.0.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '2001:db8::1',
  ]
  for (const address of denied) assert.equal(isPublicAddress(address), false, address)
})

test('allows publicly routable IPv4/IPv6 addresses', () => {
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicAddress(address), true, address)
  }
})

test('agent fetch rejects localhost without making a network request', async () => {
  await assert.rejects(fetchPublicText('http://127.0.0.1/private', new AbortController().signal))
  await assert.rejects(fetchPublicText('http://localhost/admin', new AbortController().signal))
})
