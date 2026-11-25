import test from 'node:test';
import assert from 'node:assert/strict';
import { askCouncilDelegate, readCouncilChat, runCouncilDialogue, councilLines } from '../lib/council-dialogue.ts';
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

test('a restart during generation preserves the question slot and the previous completed voice', async () => {
  const { values, mirror, commit } = setup();
  const session = await commit(store => startCouncil(store, 'llm'));
  const connection = { origin: 'https://mue.example.ts.net', model: 'fixture', apiKey: '' };
  const checkpoint = () => commit(loadCouncil);
  for (const stage of ['opening', 'question']) {
    let started, release;
    const dispatched = new Promise(resolve => { started = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    let calls = 0;
    const fetcher = async () => {
      if (++calls === (stage === 'opening' ? 2 : 1)) { started(); await wait; }
      return Response.json({ choices: [{ message: { content: '{"line":"Une pièce demeure dans la marge."}' } }] });
    };
    const pending = stage === 'opening'
      ? runCouncilDialogue(session, 'opening', mirror, connection, undefined, fetcher, checkpoint)
      : askCouncilDelegate(session, 'ada', 'Que manque-t-il au dossier ?', mirror, connection, undefined, fetcher, checkpoint);
    await dispatched;
    values.delete('tld-council-prose-v1');
    assert.deepEqual(await commit(loadCouncil, true), session);
    assert.equal(councilLines(session, 'opening', mirror)[0].status, 'generated');
    if (stage === 'question') assert.equal(readCouncilChat(session, mirror)[0].question, 'Que manque-t-il au dossier ?');
    release();
    await pending;
  }
});
