import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCouncil, startCouncil, loadCouncil, QUESTION, COMMITMENT } from '../lib/council.ts';
import { councilLines, readCouncilChat, runCouncilDialogue, askCouncilDelegate } from '../lib/council-dialogue.ts';
import { llamaChat, MUE_LIMITS } from '../lib/tailscale-backend.ts';

const connection = { origin: 'https://test.example.ts.net', apiKey: 'test-secret-12345', model: 'fixture' };
function setup(mode = 'llm') {
  const records = new Map();
  const store = { getItem: key => records.get(key) ?? null, setItem: (k, v) => records.set(k, v), removeItem: k => records.delete(k) };
  return { store, records, session: startCouncil(store, mode) };
}
const deposit = { type: 'deposit', piece: { demo: 'edge' } };
const motion = { type: 'motion', proposal: 'compromise' };
const vote = { type: 'vote', proposal: 'compromise' };
function answer(content) {
  return Response.json({ choices: [{ message: { content } }] });
}
const line = value => answer(JSON.stringify({ line: value }));

test('offline and connected councils preserve identical events, commitments, ballots and endings', async () => {
  async function play(mode) {
    const { store, records, session } = setup(mode);
    const calls = [];
    const fetcher = async (_url, opts) => {
      const req = JSON.parse(opts.body);
      assert.equal(req.max_tokens, MUE_LIMITS.maxTokens);
      calls.push(JSON.parse(req.messages[1].content));
      return line('Une marge ouverte au dossier ' + calls.length);
    };
    await runCouncilDialogue(session, 'opening', store, connection, undefined, fetcher);
    const after = applyCouncil(store, session, deposit);
    await runCouncilDialogue(after, 'return', store, connection, undefined, fetcher);
    const decided = applyCouncil(store, applyCouncil(store, after, motion), vote);
    assert.equal(loadCouncil(store).result.support, 4);
    assert.equal([...records.values()].some(raw => raw.includes(connection.apiKey)), false);
    if (mode === 'llm') {
      assert.equal(calls.length, 4);
      assert.equal(calls[1].previous, 'Une marge ouverte au dossier 1');
      assert.equal(calls[2].memory.commitment, COMMITMENT);
      assert.equal(calls[2].memory.question, QUESTION);
      assert.equal(calls[2].memory.archive.limit, after.archive.limit);
      assert.deepEqual(councilLines(decided, 'return', store).map(l => [l.calls,l.status]), [[1,'generated'],[1,'generated']]);
    } else {
      assert.equal(calls.length, 0);
      assert.ok(councilLines(decided,'return',store)[0].text.includes(after.archive.limit));
    }
    return { events: decided.events, result: decided.result };
  }
  assert.deepEqual(await play('llm'), await play('scripted'));
});

test('disconnected and invalid/model error replies preserve the scripted scene and action', async () => {
  const { store, session } = setup();
  await runCouncilDialogue(session, 'opening', store, null);
  assert.ok(councilLines(session, 'opening', store).every(l => l.status === 'offline' && l.calls === 0));
  const after = applyCouncil(store, session, deposit);
  let turn = 0;
  await runCouncilDialogue(after, 'return', store, connection, undefined, async () =>
    ++turn === 1 ? answer('{"line":"Ordre","vote":4}') : answer(''));
  assert.ok(councilLines(after, 'return', store).every(l => l.status === 'invalid' && l.calls === 1));
  await runCouncilDialogue(loadCouncil(store), 'return', store, connection, undefined, async () => { throw Error('no retries'); });
  assert.equal(turn, 2);
  assert.deepEqual(loadCouncil(store), after);
});

test('cancellation returns immediately, an uncooperative late response cannot replace any session', async () => {
  const { store, session } = setup();
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const abort = new AbortController();
  let calls = 0;
  const fetcher = async () => { calls++; return waiting; };
  const running = runCouncilDialogue(session, 'opening', store, connection, abort.signal, fetcher);
  await runCouncilDialogue(session, 'opening', store, connection, undefined, fetcher);
  await assert.rejects(llamaChat(connection, [], fetcher), /déjà en cours/);
  abort.abort();
  await running;
  assert.equal(calls, 1);
  assert.deepEqual(councilLines(session, 'opening', store).map(l => [l.status, l.calls]), [['cancelled',1], ['cancelled',0]]);
  const after = applyCouncil(store, session, deposit);
  applyCouncil(store, applyCouncil(store, after, motion), vote);
  const other = startCouncil(store, 'scripted');
  finish(line('Une réplique arrivée trop tard.'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(loadCouncil(store), other);
  assert.ok(councilLines(other, 'opening', store).every(l => l.status === 'scripted'));
});

test('timeout and network rejection are bounded and carry distinct diagnostics', async () => {
  let physicalSignal;
  const blocked = (_url, { signal }) => new Promise((_, reject) => {
    physicalSignal = signal;
    signal.addEventListener('abort', () => reject(Error('lost')), { once:true });
  });
  await assert.rejects(llamaChat(connection, [], blocked, {timeoutMs: 5}), err => err.kind === 'timeout');
  assert.equal(physicalSignal.aborted, true);
  const { store, session } = setup();
  await runCouncilDialogue(session, 'opening', store, connection, undefined, async () => { throw Error('offline'); });
  assert.ok(councilLines(session,'opening',store).every(l => l.status === 'unavailable' && l.calls === 1 && l.durationMs >= 0));
});

test('a stale receipt (including a vote while a response is in flight) never gains prose', async () => {
  const { store, session } = setup();
  let finish;
  const pending = runCouncilDialogue(session,'opening',store,connection,undefined,() => new Promise(resolve => { finish = resolve; }));
  const done = applyCouncil(store, applyCouncil(store, applyCouncil(store, session, deposit), motion), vote);
  finish(line('Cette ligne arrive après le scrutin.'));
  await pending;
  assert.deepEqual(loadCouncil(store), done);
  assert.ok(councilLines(done,'opening',store).every(l => l.status !== 'generated'));
});

test('free chat only on request, limited to three bounded questions; no forged intent', async () => {
  const { store, session } = setup();
  const fetcher = async () => line('Le registre garde une nuit dans sa marge.');
  for (let i = 0; i < 3; i++) {
    await askCouncilDelegate(session,'ada','Que manque-t-il au registre '+i+' ?',store,connection,undefined,fetcher);
  }
  assert.equal(readCouncilChat(session,store).length,3);
  assert.equal(readCouncilChat(session,store)[0].status,'generated');
  assert.deepEqual(loadCouncil(store),session);
  await assert.rejects(askCouncilDelegate(session,'ada','Et maintenant ?',store,connection),/trois questions/);
  await assert.rejects(askCouncilDelegate(session,'intrus','Qui est là ?',store,connection),/Choisis/);
});

test('scene budget expires before turn two even when the first completes', async t => {
  const { store, session } = setup();
  let now = Date.now(), count = 0;
  t.mock.method(Date, 'now', () => now);
  await runCouncilDialogue(session, 'opening', store, connection, undefined, async () => {
    count++; now += MUE_LIMITS.sceneMs; return line('Première intervention.');
  });
  assert.equal(count,1);
  assert.deepEqual(councilLines(session,'opening',store).map(l => [l.status,l.calls]), [['generated',1],['timeout',0]]);
});

test('requesting a second reading is remembered as pending; Ada contests the immediate ballot', async () => {
  const {store, session} = setup();
  const after = applyCouncil(store, session, { type: 'deposit', piece: { demo: 'clinic', review: 'defer' } });
  assert.match(councilLines(after,'return',store)[0].text,/contre-lecture/);
  let memory;
  await runCouncilDialogue(after,'return',store,connection,undefined,async (_url, init) => {
    memory = JSON.parse(JSON.parse(init.body).messages[1].content).memory;
    return line('La contre-lecture reste demandée.');
  });
  assert.equal(memory.archive.review,'defer');
  assert.ok(memory.events.some(e => e.id === 'review'));
  const next = applyCouncil(store, after, {type:'motion',proposal:'construction'});
  assert.equal(applyCouncil(store,next,{type:'vote',proposal:'construction'}).result.support,2);
});
