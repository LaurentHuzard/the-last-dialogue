import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineSession, addOfflineArchive, negotiateOffline, voteOffline, offlineRequest, resumeOfflineSession } from '../lib/offline-game.ts';

function storage() {
  const db = new Map();
  return {
    getItem: (key) => db.get(key) ?? null,
    setItem: (key, value) => db.set(key, value),
    removeItem: (key) => db.delete(key),
  };
}
const evidence = {
  kind: 'publication', title: 'Étude sur les pollinisateurs',
  description: 'Des recherches décrivent une diminution variable des populations de pollinisateurs.',
  source_url: 'https://example.org/research',
};

test('scripted engine starts with four votes and no external requirements', () => {
  const session = createOfflineSession();
  assert.equal(session.effective_mode, 'scripted');
  assert.equal(session.phase, 'investigation');
  assert.deepEqual(Object.keys(session.positions).sort(), ['ada', 'ivo', 'selene']);
});
test('LLM request visibly falls back to scripted mode in standalone APK', () => {
  const session = createOfflineSession('llm');
  assert.equal(session.mode, 'llm');
  assert.equal(session.effective_mode, 'scripted');
  assert.match(session.warning, /aucune IA/);
});
test('publication requires a source URL', () => {
  const session = createOfflineSession();
  assert.throws(() => addOfflineArchive(session, { ...evidence, source_url: null }), /source/);
  assert.equal(session.archives.length, 0);
});
test('archives mark provenance unverified and increase Ada influence', () => {
  const session = createOfflineSession();
  addOfflineArchive(session, evidence);
  assert.equal(session.influence, 1);
  assert.equal(session.positions.ada, 1);
  assert.equal(session.archives[0].provenance, 'player-submitted; unverified');
});
test('compromise gains three votes after an archive and one negotiation', () => {
  const session = createOfflineSession();
  addOfflineArchive(session, evidence);
  negotiateOffline(session, 'compromise');
  voteOffline(session, 'compromise');
  assert.match(session.result, /Accord adopté \(4\/4 voix\)/);
  assert.throws(() => voteOffline(session, 'compromise'), /déjà voté/);
});
test('a naive unsourced sanctuary vote fails with two votes', () => {
  const session = createOfflineSession();
  voteOffline(session, 'sanctuary');
  assert.match(session.result, /Accord rejeté \(2\/4 voix\)/);
});
test('native API contract persists and resumes between app launches', () => {
  const db = storage();
  const started = offlineRequest('/api/sessions', { mode: 'scripted' }, db);
  offlineRequest(`/api/sessions/${started.id}/archives`, evidence, db);
  const restored = resumeOfflineSession(db);
  assert.equal(restored?.archives.length, 1);
  assert.equal(offlineRequest(`/api/sessions/${started.id}`, undefined, db).id, started.id);
});
test('unknown sessions and invalid URLs are rejected', () => {
  const db = storage();
  const session = offlineRequest('/api/sessions', {}, db);
  assert.throws(() => offlineRequest('/api/sessions/wrong/vote', { proposal: 'compromise' }, db), /introuvable/);
  assert.throws(() => offlineRequest(`/api/sessions/${session.id}/archives`, { ...evidence, source_url: 'javascript:alert(1)' }, db), /invalide/);
});
