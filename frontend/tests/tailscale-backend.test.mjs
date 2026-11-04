import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTailscaleLlamaOrigin, listLlamaModels, preferredModel, llamaChat } from '../lib/tailscale-backend.ts';

const BASE = 'https://mue.taile632c2.ts.net';

test('only accepts a clean HTTPS Serve origin on ts.net', () => {
  assert.equal(normalizeTailscaleLlamaOrigin(' ' + BASE + '/ '), BASE);
  assert.equal(normalizeTailscaleLlamaOrigin(BASE + ':8443'), BASE + ':8443');
  for (const url of ['', 'http://mue.taile632c2.ts.net', 'https://google.com',
      'https://mue.taile632c2.ts.net.evil.com', BASE + '/v1', BASE + '?token=key',
      'https://user:pass@mue.taile632c2.ts.net', 'javascript:alert(1)']) {
    assert.throws(() => normalizeTailscaleLlamaOrigin(url));
  }
});

test('old HTTP :8003 address returns direct, actionable Serve instructions', () => {
  assert.throws(
    () => normalizeTailscaleLlamaOrigin('http://mue.taile632c2.ts.net:8003/'),
    /tailscale serve --bg 8003/,
  );
});

test('model discovery uses /v1/models and Bearer key', async () => {
  let called = null;
  const models = await listLlamaModels(BASE, 'local-key', async (url, init) => {
    called = { url, init };
    return { ok: true, json: async () => ({ data: [
      { id: 'gemma4-32k' }, { id: 'qwen35-9b' }, { id: 'gemma4-32k' },
    ] }) };
  });
  assert.deepEqual(models, ['gemma4-32k', 'qwen35-9b']);
  assert.equal(called.url, BASE + '/v1/models');
  assert.equal(called.init.headers.Authorization, 'Bearer local-key');
  assert.ok(!called.url.includes('local-key'));
  assert.equal(preferredModel(models), 'gemma4-32k');
  assert.equal(preferredModel(models, 'qwen35-9b'), 'qwen35-9b');
});

test('missing key rejects with a useful message, never echoes secret', async () => {
  await assert.rejects(listLlamaModels(BASE, 'sensitive-secret', async () => ({
    status: 401, ok: false,
  })), error => /Clé API llama.cpp/.test(error.message) && !error.message.includes('sensitive-secret'));
});

test('wrong backend is correctly identified', async () => {
  await assert.rejects(listLlamaModels(BASE, '', async () => ({ status: 404, ok: false })), /port 8003/);
});

test('chat completions send non-streaming OpenAI format with no intermediary', async () => {
  let called;
  const text = await llamaChat({ origin: BASE, apiKey: 'local-secret', model: 'qwen35-9b' }, [
    { role: 'system', content: 'Tu es Sélène.' },
    { role: 'user', content: 'Propose une mission.' },
  ], async (url, init) => {
    called = { url, init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Une enquête sur les pollinisateurs.' } }] }) };
  });
  assert.equal(text, 'Une enquête sur les pollinisateurs.');
  assert.equal(called.url, BASE + '/v1/chat/completions');
  assert.equal(called.init.headers.Authorization, 'Bearer local-secret');
  const body = JSON.parse(called.init.body);
  assert.equal(body.model, 'qwen35-9b');
  assert.equal(body.stream, false);
  assert.ok(!called.url.includes('local-secret'));
});

test('empty content never masquerades as a generated agent message', async () => {
  await assert.rejects(llamaChat({ origin: BASE, apiKey: '', model: 'gemma4-32k' }, [
    { role: 'system', content: 'Bonjour' },
  ], async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) })), /pas produit de texte/);
});
