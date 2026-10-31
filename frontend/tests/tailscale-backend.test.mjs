import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTailscaleBackend, verifyBackend } from '../lib/tailscale-backend.ts';

test('Tailscale Serve HTTPS origin is normalized', () => {
  assert.equal(normalizeTailscaleBackend(' https://mue.example-tailnet.ts.net/ '), 'https://mue.example-tailnet.ts.net');
  assert.equal(normalizeTailscaleBackend('https://mue.example-tailnet.ts.net:8443'), 'https://mue.example-tailnet.ts.net:8443');
});

test('public, cleartext, credentialed or path-masked origins are rejected', () => {
  for (const input of ['', 'http://mue.example.ts.net', 'https://example.org',
    'https://evilts.net', 'https://attacker.ts.net.evil.org',
    'https://user:secret@mue.example.ts.net', 'https://mue.example.ts.net@evil.org',
    'https://mue.example.ts.net/api', 'https://mue.example.ts.net/?token=secret',
    'javascript:alert(1)']) assert.throws(() => normalizeTailscaleBackend(input));
});

test('reads backend identity and declared LLM model', async () => {
  let received;
  const result = await verifyBackend('https://mue.example.ts.net', async (url) => {
    received = url;
    return { ok: true, json: async () => ({
      app: 'the-last-dialogue', llm_configured: true, model: 'qwen35-9b',
    }) };
  });
  assert.equal(received, 'https://mue.example.ts.net/api/capabilities');
  assert.equal(result.model, 'qwen35-9b');
});

test('rejects unrelated HTTPS services', async () => {
  await assert.rejects(verifyBackend('https://mue.example.ts.net', async () => ({
    ok: true, json: async () => ({
      app: 'unrelated', llm_configured: true, model: 'other',
    }),
  })), /attendue/);
});
