import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineSession, resumeOfflineSession } from '../lib/offline-game.ts';
import { parseMission, androidGameRequest, talkToDelegate } from '../lib/agent-game.ts';

const CONNECTION = {
  origin: 'https://mue.taile632c2.ts.net',
  apiKey: 'secret-only-in-react-memory',
  model: 'gemma4-32k',
};
const evidence = {
  kind: 'publication', title: 'Une étude sur les pollinisateurs',
  description: 'Une étude documente une évolution de certains pollinisateurs, sans prouver une conscience collective.',
  source_url: 'https://example.org/research',
};
const goodMission = JSON.stringify({
  title: 'Enquête sur les pollinisateurs',
  request: 'Retrouve une publication vérifiable sur les pollinisateurs et explique en quoi cette étude peut éclairer la négociation.',
});
function storage() {
  const map = new Map();
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
    values: () => Array.from(map.values()),
  };
}
function responder(text) {
  return async (url, options) => {
    assert.equal(url, CONNECTION.origin + '/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer ' + CONNECTION.apiKey);
    const parsed = JSON.parse(options.body);
    assert.equal(parsed.stream, false);
    assert.equal(parsed.model, 'gemma4-32k');
    return { ok: true, json: async () => ({choices: [{message: {content: text}}]}) };
  };
}

test('mission parsing accepts one JSON object and refuses invalid mission shapes', () => {
  assert.deepEqual(parseMission('intro:\n' + goodMission), JSON.parse(goodMission));
  assert.throws(() => parseMission('voici une mission non JSON'), /non structurée/);
  assert.throws(() => parseMission('{"title":"A","request":"B","vote":100}'), /format attendu/);
});

test('scripted mode runs without ever touching the inference API', async () => {
  const store = storage();
  const session = await androidGameRequest('/api/sessions', { mode: 'scripted' }, store, CONNECTION,
    async () => { throw new Error('LLM must not be called'); });
  assert.equal(session.effective_mode, 'scripted');
  assert.equal(session.archives.length, 0);
});

test('LLM mission is generated on MUE and persisted without the secret', async () => {
  const store = storage();
  const session = await androidGameRequest('/api/sessions', {mode: 'llm'}, store, CONNECTION, responder(goodMission));
  assert.equal(session.effective_mode, 'llm');
  assert.equal(session.mission.title, 'Enquête sur les pollinisateurs');
  assert.equal(session.messages[1].text, session.mission.request);
  assert.equal(resumeOfflineSession(store)?.mission.title, session.mission.title);
  assert.ok(store.values().every(val => !val.includes(CONNECTION.apiKey)));
});

test('archive comments and proposal reactions do not alter deterministic votes', async () => {
  const store = storage();
  const initial = await androidGameRequest('/api/sessions', {mode: 'llm'}, store, CONNECTION, responder(goodMission));
  const afterArchive = await androidGameRequest('/api/sessions/' + initial.id + '/archives',
    evidence, store, CONNECTION, responder('Ada : cette source reste à vérifier.'));
  assert.equal(afterArchive.archives.length, 1);
  assert.equal(afterArchive.positions.ada, 1);
  assert.equal(afterArchive.messages.at(-1).speaker, 'ada');
  assert.equal(afterArchive.archives[0].provenance, 'player-submitted; unverified');
  const afterProposal = await androidGameRequest('/api/sessions/' + initial.id + '/proposals',
    { proposal: 'compromise' }, store, CONNECTION, responder('Ivo demande un corridor de moindre impact.'));
  assert.equal(afterProposal.positions.ivo, -1);
  assert.equal(afterProposal.agreements[0], 'compromise');
  assert.equal(afterProposal.messages.at(-1).speaker, 'ivo');
  const finished = await androidGameRequest('/api/sessions/' + initial.id + '/vote',
    {proposal: 'compromise'}, store, CONNECTION, async () => {
      throw new Error('LLM must not vote');
    });
  assert.match(finished.result, /Accord adopté \(4\/4 voix\)/);
});

test('free-form delegate chat persists without changing official state', async () => {
  const store = storage();
  const started = await androidGameRequest('/api/sessions', {mode: 'llm'}, store, CONNECTION, responder(goodMission));
  const positions = JSON.stringify(started.positions);
  const result = await talkToDelegate(started, 'ivo',
    'Comment fournir de l’énergie tout en protégeant le vivant ?', store, CONNECTION,
    responder('Ivo : cherchons un tracé alternatif.'));
  assert.equal(JSON.stringify(result.positions), positions);
  assert.equal(result.messages.at(-1).speaker, 'ivo');
  assert.equal(result.messages.at(-2).speaker, 'player');
  assert.equal(resumeOfflineSession(store)?.messages.at(-1).speaker, 'ivo');
  assert.ok(store.values().every(val => !val.includes(CONNECTION.apiKey)));
});

test('inference failure does not fake success and scripted fallback remains playable', async () => {
  const store = storage();
  const session = await androidGameRequest('/api/sessions', {mode: 'llm'}, store, CONNECTION,
    async () => { throw new Error('network down'); });
  assert.equal(session.effective_mode, 'scripted');
  assert.match(session.warning, /MUE indisponible/);
  assert.equal(session.messages.length, 2);
  assert.equal(createOfflineSession('scripted').effective_mode, 'scripted');
});

test('invalid questions never call the model', async () => {
  const store = storage();
  const started = await androidGameRequest('/api/sessions', {mode: 'llm'}, store, CONNECTION, responder(goodMission));
  await assert.rejects(talkToDelegate(started, 'selene', 'x', store, CONNECTION, async () => {
    throw new Error('Should not reach network');
  }), /3 et 500/);
});
