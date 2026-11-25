import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { durableCouncil } from '../lib/durable-council.ts';
import { COUNCIL_KEY, applyCouncil, startCouncil, loadCouncil, recoverCouncil } from '../lib/council.ts';

function setup() {
  const values = new Map();
  const factory = new IDBFactory();
  const mirror = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  return { values, mirror, commit: (op, restore = false) => durableCouncil(mirror, op, restore, factory) };
}
const deposit = { type: 'deposit', piece: { demo: 'edge' } };
const motion = { type: 'motion', proposal: 'compromise' };
const vote = { type: 'vote', proposal: 'compromise' };

test('a cold restart restores a confirmed ballot and its voice book despite a stale WebView mirror', async () => {
  const { values, mirror, commit } = setup();
  // Existing V2 before the upgrade, interrupted on the Android device after deposit.
  const old = applyCouncil(mirror, startCouncil(mirror, 'llm'), deposit);
  const partial = values.get(COUNCIL_KEY);
  assert.deepEqual(await commit(loadCouncil, true), old);
  const prose = JSON.stringify({ version: 1, id: old.id, chat: [] });
  mirror.setItem('tld-council-prose-v1', prose);
  const negotiated = await commit(store => applyCouncil(store, old, motion));
  const final = await commit(store => applyCouncil(store, negotiated, vote));
  values.set(COUNCIL_KEY, partial);
  values.delete('tld-council-prose-v1');
  assert.equal(final.result.support, 4);
  assert.deepEqual(await commit(loadCouncil, true), final);
  assert.equal(mirror.getItem('tld-council-prose-v1'), prose);
  assert.deepEqual(loadCouncil(mirror), final);
});

test('concurrent actions read the committed revision; an aborted transaction never changes its mirror', async () => {
  const { mirror, commit } = setup();
  const session = await commit(store => startCouncil(store, 'scripted'));
  const settled = await Promise.allSettled([1, 2].map(() => commit(store => applyCouncil(store, session, deposit))));
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
  const recorded = await commit(loadCouncil, true);
  await assert.rejects(commit(store => {
    applyCouncil(store, recorded, motion);
    throw Error('Interrupted before commit');
  }), /Interrupted/);
  assert.deepEqual(loadCouncil(mirror), recorded);
  assert.deepEqual(await commit(loadCouncil, true), recorded);
});

test('unreadable legacy bytes survive an explicit recovery', async () => {
  const { values, commit } = setup();
  values.set(COUNCIL_KEY, '{illisible');
  await assert.rejects(commit(loadCouncil, true), /conservées/);
  assert.equal(values.get(COUNCIL_KEY), '{illisible');
  const fresh = await commit(store => recoverCouncil(store, 'scripted'));
  assert.ok([...values].some(([k,v]) => k.startsWith('tld-council-recovery-') && v === '{illisible'));
  assert.deepEqual(await commit(loadCouncil, true), fresh);
});
