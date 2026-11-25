'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { applyCouncil, COMMITMENT, loadCouncil, QUESTION, recoverCouncil, SCENARIO_PIECES, startCouncil, type Council, type PieceInput } from '../lib/council';
import { askCouncilDelegate, COUNCIL_PROFILES, preserveDamagedVoices, voiceRecordDamaged, councilLines, readCouncilChat, runCouncilDialogue } from '../lib/council-dialogue';
import type { DelegateId } from '../lib/agent-game';
import type { Mode, Proposal } from '../lib/offline-game';
import { MUE_LIMITS, type LlamaConnection } from '../lib/tailscale-backend';
import CouncilConnection from './council-connection';
import { CouncilStorageError, confirmVoices, durableCouncil, storyStore } from '../lib/durable-council';
import './council.css';

const sourceTarget = process.env.NEXT_PUBLIC_ANDROID_BUILD === '1' ? '_self' : '_blank';
const motions: Record<Proposal, {name: string; stake: string}> = {
  sanctuary: {name: 'Sanctuaire', stake: 'Suspendre le chantier. Le bois garde sa continuité, le dispensaire attend une autre alimentation.'},
  compromise: {name: 'Corridor alternatif', stake: 'Étudier le détour. La lisière reste intacte pendant l’étude, les ateliers doivent céder des heures de courant.'},
  construction: {name: 'Construction', stake: 'Maintenir le tracé et réparer les abords. Le dispensaire gagne une ligne stable, la forêt perd un passage.'},
};
const signs = {selene: '✳', ivo: '◈', ada: '⌘'};
const names = {selene: 'Sélène', ivo: 'Ivo', ada: 'Ada', player: 'Toi'};
const stages = {investigation: 'Enquête en 2026', motion: 'Retour au conseil', vote: 'Scrutin', finished: 'Après le vote'};
const statusText: Record<string,string> = {
  scripted: 'Scénario', generated: 'Interprétation MUE', offline: 'Scénario · hors connexion',
  interrupted: 'Scénario · transmission interrompue', invalid: 'Scénario · réponse illisible',
  timeout: 'Scénario · délai dépassé', cancelled: 'Scénario · appel annulé',
  unavailable: 'Scénario · MUE indisponible', busy: 'Scénario · canal occupé',
};
type Action = Parameters<typeof applyCouncil>[2];
type Exchange = 'opening' | 'return';

function ExchangeLines({session, scene}: {session: Council; scene: Exchange}) {
  const lines = councilLines(session, scene, storyStore);
  return <ol className="council-lines">{lines.map((line, i) => {
    const other = lines[1-i].speaker;
    return <li key={line.speaker} className={'voice voice-' + line.speaker}>
      <span className="voice-sign" aria-hidden="true">{signs[line.speaker]}</span>
      <div><p className="voice-by"><b>{names[line.speaker]}</b> à {names[other]}</p>
        <p className="voice-words">{line.text}</p>
        <small>{statusText[line.status] || 'Scénario'}{line.calls > 0 && ' · ' + line.calls + ' appel · ' + (line.status === 'interrupted' ? 'durée inconnue' : (line.durationMs / 1000).toFixed(1) + ' s')}</small>
      </div>
    </li>;
  })}</ol>;
}

function PieceCard({piece, recorded = false}: {piece: NonNullable<Council['archive']>; recorded?: boolean}) {
  return <article className="evidence-slip">
    <span className="council-kicker">{piece.kind === 'scenario' ? 'Pièce de scénario · fiction' : piece.kind === 'publication' ? 'Document déclaré par le joueur' : 'Observation déclarée par le joueur'}</span>
    <h3>{piece.title}</h3><p>{piece.description}</p>
    {piece.source_url && <p><a href={piece.source_url} target={sourceTarget} rel="noopener noreferrer">Ouvrir la source déclarée ↗</a></p>}
    <p className="piece-limit"><strong>Limite consignée</strong> {piece.limit}</p>
    {recorded && <p><b>Mandat confié à Ada</b> · {piece.review === 'defer' ? 'Demander une contre-lecture. Elle reste en attente.' : 'Consigner la réserve et statuer pendant cette séance.'}</p>}
    <small>{piece.kind === 'scenario' ? 'Provenance : dossier fictif de la séance.' : 'Provenance déclarée. Aucune vérification externe effectuée.'}</small>
  </article>;
}

function Investigation({disabled, deposit}: {disabled: boolean; deposit: (piece: PieceInput) => void}) {
  const [choice, setChoice] = useState<''|'edge'|'clinic'|'own'>('');
  const [review, setReview] = useState<''|'record'|'defer'>('');
  const [kind, setKind] = useState<'observation'|'publication'>('observation');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!review) return;
    if (choice === 'edge' || choice === 'clinic') return deposit({demo: choice, review});
    if (choice !== 'own') return;
    const data = new FormData(e.currentTarget);
    deposit({kind, review, title: String(data.get('title')), description: String(data.get('description')),
      source_url: String(data.get('url') || '') || null, limit: String(data.get('limit'))});
  }
  return <form className="council-form" onSubmit={submit}><fieldset disabled={disabled}>
    <legend>Quelle pièce rapportes-tu ?</legend>
    <p>Lis les deux pièces fictives disponibles hors ligne, ou apporte une source depuis chez toi. Une seule entrera au dossier.</p>
    {(['edge','clinic'] as const).map(id => <div className="piece-choice" key={id}>
      <label><input required type="radio" name="piece" checked={choice === id} onChange={() => setChoice(id)} /> <strong>{SCENARIO_PIECES[id].title}</strong></label>
      <details><summary>Lire la pièce de scénario</summary><PieceCard piece={SCENARIO_PIECES[id]} /></details>
    </div>)}
    <label className="own-choice"><input required type="radio" name="piece" checked={choice === 'own'} onChange={() => setChoice('own')} /> Apporter ma propre archive</label>
    {choice === 'own' && <div className="own-fields">
      <p>Tu peux consulter <a href="https://openalex.org/" target={sourceTarget} rel="noopener noreferrer">OpenAlex</a> ou <a href="https://inpn.mnhn.fr/" target={sourceTarget} rel="noopener noreferrer">l’inventaire du patrimoine naturel</a> depuis chez toi. La consultation de ces catalogues demande une connexion.</p>
      <label>Nature<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="observation">Observation personnelle</option><option value="publication">Publication ou document</option></select></label>
      <label>Titre<input name="title" required minLength={5} maxLength={120} /></label>
      <label>Source web {kind === 'publication' ? '(requise)' : '(facultative)'}<input name="url" type="url" required={kind === 'publication'} maxLength={2048} /></label>
      <label>Ce que tu as lu ou observé<textarea name="description" required minLength={25} maxLength={1500} rows={3}/></label>
      <label>Qu’est-ce que cette pièce laisse inconnu ?<textarea name="limit" required minLength={8} rows={2} maxLength={350} /></label>
      <p className="council-note">Évite les coordonnées et les données personnelles. En mode MUE, un extrait de la pièce accompagne la demande de dialogue.</p>
    </div>}
    {choice && <fieldset className="review-policy"><legend>Que demandes-tu à Ada ?</legend>
      <p>Une archive peut éclairer une décision tout en laissant un doute. Choisis comment le conseil doit traiter cette réserve.</p>
      <label className="motion-choice"><input required type="radio" name="review" checked={review === 'record'} onChange={() => setReview('record')} />
        <span><strong>Consigner ma réserve et statuer</strong><small>Ada acceptera de voter pour la motion avec la limite au dossier.</small></span></label>
      <label className="motion-choice"><input required type="radio" name="review" checked={review === 'defer'} onChange={() => setReview('defer')} />
        <span><strong>Demander une contre-lecture avant décision</strong><small>Elle prendra plus d’une séance. Ada votera contre ce soir, les autres voix restent libres.</small></span></label>
    </fieldset>}
    <button className="primary-action" disabled={!choice || !review} type="submit">Verser la pièce et revenir au conseil</button>
  </fieldset></form>;
}

function MotionForm({session, disabled, act}: {session: Council; disabled: boolean; act: (action: Action) => void}) {
  const ballot = session.phase === 'vote';
  const [selected, setSelected] = useState<Proposal | ''>(ballot ? session.motion || '' : '');
  return <form className="council-form" onSubmit={e => {
    e.preventDefault(); if (selected) act({type: ballot ? 'vote' : 'motion', proposal: selected});
  }}><fieldset disabled={disabled}><legend>{ballot ? 'Quelle motion soumets-tu au vote ?' : 'Quelle motion mets-tu en discussion ?'}</legend>
    <p>{ballot && session.motion ? 'La motion discutée est « ' + motions[session.motion].name + ' ». Tu peux la défendre ou la contester en présentant une autre motion. Ta voix va au texte soumis.' : 'Tu as la parole pour une seule négociation. Lis le coût de chaque option avant d’engager le conseil.'}</p>
    {(Object.keys(motions) as Proposal[]).map(id => <label className="motion-choice" key={id}>
      <input required type="radio" name="motion" value={id} checked={selected === id} onChange={() => setSelected(id)} />
      <span><strong>{motions[id].name}</strong><small>{motions[id].stake}</small></span>
    </label>)}
    {ballot && <p>Adoption à trois voix sur quatre. Le scrutin clôt la séance.</p>}
    <button className="primary-action" type="submit" disabled={!selected}>{ballot ? 'Voter et entendre le verdict' : 'Négocier cette motion'}</button>
  </fieldset></form>;
}

function Minutes({session}: {session: Council}) {
  return <details className="council-fold"><summary>Relire le procès-verbal</summary>
    <h3>Délibération d’ouverture</h3><ExchangeLines session={session} scene="opening" />
    <p><b>Mission</b> · {QUESTION}</p><p><b>Engagement enregistré</b> · {COMMITMENT}</p>
    {session.archive && <><PieceCard piece={session.archive} recorded /><h3>Délibération de retour</h3><ExchangeLines session={session} scene="return" /></>}
    <h3>Registre des événements</h3>
    <ol className="council-events">{session.events.map(event => <li key={event.id}>{event.text}</li>)}</ol>
  </details>;
}

function LegacyRegister({legacy}: {legacy: NonNullable<Council['legacy']>}) {
  return <details className="council-fold"><summary>Retrouver ma séance des Archives du Présent (V1)</summary>
    <p>Le registre conserve la partie précédente à côté de la nouvelle séance.</p>
    <p>Jour {legacy.day} · influence {legacy.influence} · {legacy.result || 'Scrutin non tenu.'}</p>
    <p>{legacy.agreements.map(p => motions[p].name).join(' · ')}</p>
    {legacy.archives.map(a => <article key={a.id}><h4>{a.title}</h4><p>{a.description}</p><small>Archive déclarée · non vérifiée</small>{a.source_url && <p><a href={a.source_url} target={sourceTarget} rel="noopener noreferrer">Consulter la source</a></p>}</article>)}
    {legacy.messages.map((m,i) => <p key={i}><b>{names[m.speaker as keyof typeof names] || 'Assemblée'}</b> · {m.text}</p>)}
  </details>;
}

export default function CouncilGame() {
  const [session, setSession] = useState<Council|null>(null);
  const [loaded, setLoaded] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const [storageFailed, setStorageFailed] = useState(false);
  const [damaged, setDamaged] = useState(false);
  const [newGame, setNewGame] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const locked = busy || connectionBusy;
  const [mode, setMode] = useState<Mode>('scripted');
  const [connection, setConnection] = useState<LlamaConnection|null>(null);
  const [delegate, setDelegate] = useState<DelegateId>('selene');
  const [question, setQuestion] = useState('');
  const controller = useRef<AbortController|null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstView = useRef(true);
  const welcome = !session || newGame;

  useEffect(() => {
    let live = true;
    durableCouncil(storyStore, loadCouncil, true).then(saved => {
      if (live) { setSession(saved); setStorageFailed(false); setDamaged(false); setError(''); }
    }).catch(e => {
      if (!live) return;
      const failed = e instanceof CouncilStorageError || e instanceof DOMException;
      setStorageFailed(failed); setDamaged(!failed);
      setError(e instanceof Error ? e.message : 'Lecture impossible.');
    }).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; controller.current?.abort(); controller.current = null; };
  }, [readAttempt]);

  useEffect(() => {
    if (!loaded) return;
    if (firstView.current) { firstView.current = false; return; }
    heading.current?.focus();
  }, [loaded, session?.id, session?.phase, newGame]);

  async function perform(fn: (signal: AbortSignal) => Promise<void>) {
    if (controller.current || connectionBusy) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError('');
    try { await fn(current.signal); }
    catch (e) { if (controller.current === current) setError(e instanceof Error ? e.message : 'La transmission a échoué.'); }
    finally { if (controller.current === current) { controller.current = null; setBusy(false); setTransmitting(false); } }
  }
  function enter() {
    void perform(async signal => {
      const store = storyStore;
      const next = await durableCouncil(store, tx => {
        const opened = damaged ? recoverCouncil(tx, mode) : startCouncil(tx, mode);
        preserveDamagedVoices(tx);
        return opened;
      });
      setDamaged(false); setSession(next); setNewGame(false); setQuestion('');
      setTransmitting(next.mode === 'llm' && connection !== null);
      await runCouncilDialogue(next, 'opening', store, connection, signal);
      if (next.mode === 'llm') await confirmVoices(next, store);
    });
  }
  function act(action: Action) {
    if (!session) return;
    void perform(async signal => {
      const next = await durableCouncil(storyStore, tx => applyCouncil(tx, session, action));
      setSession(next);
      if (action.type === 'deposit' && next.mode === 'llm') {
        setTransmitting(connection !== null);
        await runCouncilDialogue(next, 'return', storyStore, connection, signal);
        await confirmVoices(next, storyStore);
      }
    });
  }
  function ask(e: FormEvent) {
    e.preventDefault();
    if (!session || !connection) return;
    void perform(async signal => {
      setTransmitting(true);
      await askCouncilDelegate(session, delegate, question, storyStore, connection, signal);
      await confirmVoices(session, storyStore);
      if (!signal.aborted) setQuestion('');
    });
  }

  const pendingNotice = busy && <div className="council-pending"><p role="status">{transmitting ? 'Transmission aux délégués en cours…' : 'Enregistrement sur cet appareil…'}</p>
    {transmitting && <button type="button" className="secondary-action" onClick={() => controller.current?.abort()}>Annuler la transmission</button>}</div>;
  const damagedVoices = loaded && !damaged && voiceRecordDamaged(storyStore);
  const needsConnection = loaded && (welcome || !damagedVoices) && (welcome ? mode : session?.mode) === 'llm' && (welcome || session?.phase !== 'finished');
  const chat = loaded && session && !welcome ? readCouncilChat(session, storyStore) : [];
  return <main className="council-shell">
    <header className="council-banner"><span>OctoMUE Game Studio</span><strong>The Last Dialogue</strong></header>
    {!loaded ? <p role="status">Ouverture du registre local…</p> : <>
      {damagedVoices && <p role="status" className="notice">{welcome
        ? 'Le carnet de voix est illisible. Ouvrir une nouvelle séance conservera une copie de secours de ce carnet.'
        : 'Le carnet de voix est illisible. La séance continue en voix scénarisées. Le procès-verbal reste accessible. À la prochaine séance, une copie de secours sera conservée.'}</p>}
      {storageFailed ? <button type="button" className="secondary-action" onClick={() => setReadAttempt(n => n + 1)}>Réessayer d’ouvrir le registre</button> : welcome ? <section className="council-welcome"><p className="council-kicker">Assemblée de 2235 · première séance</p>
        <h1 ref={heading} tabIndex={-1}>Les Échos du Vivant</h1>
        <p className="council-lead">Au pied des vieux arbres, le câble attend. À l’autre bout, le dispensaire compte les heures de courant.</p>
        <p>En 2235, tu sièges avec Sélène, Ivo et Ada. Leur désaccord t’enverra enquêter en 2026. Rapporte une pièce, négocie le tracé et porte une voix au scrutin.</p>
        {damaged && <p className="notice">Le registre local demande une récupération. Tu peux conserver une copie de secours et ouvrir une nouvelle séance sur cet appareil.</p>}
        {newGame && <p className="notice">En ouvrant une autre séance, tu remplaceras le procès-verbal affiché. <button className="text-action" onClick={() => setNewGame(false)}>Revenir au verdict</button></p>}
        <fieldset className="council-mode" disabled={locked}><legend>Voix du conseil</legend>
          <label><input type="radio" name="voice-mode" checked={mode === 'scripted'} onChange={() => { setConnection(null); setMode('scripted'); }} /> Scénarisées · entièrement hors ligne</label>
          <label><input type="radio" name="voice-mode" checked={mode === 'llm'} onChange={() => setMode('llm')} /> Incarnées par MUE · connexion au tailnet</label>
        </fieldset>
      </section> : session && <section className="council-stage">
        <p className="council-kicker">Les Échos du Vivant · {stages[session.phase]}</p>
        <h1 ref={heading} tabIndex={-1}>{session.phase === 'investigation' ? 'Le câble et la lisière' : session.phase === 'motion' ? 'La pièce sur la table' : session.phase === 'vote' ? 'Quatre voix pour un tracé' : 'Le lendemain du vote'}</h1>
        {pendingNotice}
        {session.phase === 'investigation' && <>
          <h2>Première délibération</h2><ExchangeLines session={session} scene="opening" />
          <div className="council-pledge"><strong>Engagement enregistré</strong><p>{COMMITMENT}</p></div>
          <div className="council-charge"><span className="council-kicker">Ta mission · Deep Searcher</span><h2>{QUESTION}</h2></div>
          <Investigation disabled={locked} deposit={piece => act({type:'deposit', piece})} />
        </>}
        {session.phase === 'motion' && session.archive && <>
          <PieceCard piece={session.archive} recorded /><h2>Seconde délibération</h2><ExchangeLines session={session} scene="return" />
          <p className="council-pledge"><b>Engagement rappelé</b> · {COMMITMENT}</p>
        </>}
        {(session.phase === 'motion' || session.phase === 'vote') && <MotionForm key={session.phase} session={session} disabled={locked} act={act} />}
        {session.phase === 'finished' && session.result && <div className="council-verdict">
          <p className="council-kicker">Scrutin clos · {session.result.support} voix sur 4</p>
          <h2>{motions[session.result.proposal].name} · {session.result.passed ? 'accord adopté' : 'accord rejeté'}</h2>
          <p className="council-lead">{session.result.epilogue}</p>
          <h3>Pourquoi ces quatre voix ?</h3><ul className="council-ballots">{session.result.ballots.map(b => <li key={b.speaker}>
            <strong>{names[b.speaker]} · {b.yes ? 'pour' : 'contre'}</strong><p>{b.reason}</p>
          </li>)}</ul>
        </div>}
        <Minutes session={session} />
        <details className="council-fold"><summary>Qui siège à cette table ?</summary>{(['selene','ivo','ada'] as const).map(id => {
          const p = COUNCIL_PROFILES[id];
          return <article key={id}><h3>{signs[id]} {p.name}</h3><p>{p.goal}</p><p><b>Ligne rouge</b> · {p.redLine}</p><p><b>Concession possible</b> · {p.concession}</p></article>;
        })}</details>
        {session.legacy && <LegacyRegister legacy={session.legacy} />}
      </section>}
      {needsConnection && <div className="council-network">
        <p>{connection ? 'Voix MUE connectées au modèle ' + connection.model + '.' : 'MUE déconnecté. Les voix scénarisées prennent le relais. Pour connecter MUE, saisis à nouveau ta clé si le routeur en exige une.'}</p>
        <CouncilConnection onChange={setConnection} disabled={busy} onBusyChange={setConnectionBusy}/>
      </div>}
      {welcome && !storageFailed && <button type="button" className="primary-action" disabled={locked} onClick={enter}>{damaged ? 'Créer la copie de secours et ouvrir une séance' : 'Entrer dans l’Assemblée'}</button>}
      {!welcome && session && !damagedVoices && (chat.length > 0 || (connection && session.mode === 'llm' && session.phase !== 'finished')) &&
        <details className="council-fold"><summary>Questions libres aux délégués</summary>
          {chat.map((m,i) => <article key={i}><p><b>Toi à {names[m.speaker]}</b> · {m.question}</p>
            <p><b>{names[m.speaker]}</b> · {m.text || 'La question reste au registre sans réponse générée.'}</p><small>{statusText[m.status]} · {m.calls} appel(s) · {m.status === 'interrupted' ? 'durée inconnue' : (m.durationMs/1000).toFixed(1) + ' s'}</small></article>)}
          {connection && session.mode === 'llm' && session.phase !== 'finished' && <form className="council-form" onSubmit={ask}><p>{chat.length} / {MUE_LIMITS.questionsPerCouncil} questions consignées. Les réponses restent dans le carnet de voix.</p><fieldset disabled={locked || chat.length >= MUE_LIMITS.questionsPerCouncil}><legend>Prendre la parole</legend>
            <label>Destinataire<select value={delegate} onChange={e => setDelegate(e.target.value as DelegateId)}>{Object.entries(signs).map(([id]) => <option key={id} value={id}>{names[id as DelegateId]}</option>)}</select></label>
            <label>Question<textarea required minLength={3} maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} /></label>
            <button className="secondary-action">Poser la question à {names[delegate]}</button>
          </fieldset></form>}
        </details>}
      {!welcome && session?.phase === 'finished' && <button type="button" className="secondary-action" onClick={() => { setConnection(null); setMode('scripted'); setNewGame(true); }}>Préparer une nouvelle séance</button>}
    </>}
    {error && <p className="notice" role="alert">{error}</p>}
    <footer>Registre local · Archives de 2026 / Assemblée fictive de 2235</footer>
  </main>;
}
