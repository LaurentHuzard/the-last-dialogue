'use client';

import { useEffect, useState } from 'react';
import { clearOfflineSession, resumeOfflineSession, type Session } from '../lib/offline-game';
import { androidGameRequest, talkToDelegate, type DelegateId } from '../lib/agent-game';
import {
  MUE_ORIGIN_STORAGE_KEY, normalizeTailscaleLlamaOrigin, listLlamaModels,
  preferredModel, llamaChat, type LlamaConnection,
} from '../lib/tailscale-backend';

type Mode = 'scripted' | 'llm';
type Proposal = 'sanctuary' | 'compromise' | 'construction';
const ANDROID_BUILD = process.env.NEXT_PUBLIC_ANDROID_BUILD === '1';
const API = (process.env.NEXT_PUBLIC_API_URL || (ANDROID_BUILD ? '' : 'http://localhost:8080')).replace(/\/$/, '');
const PROPOSALS: { id: Proposal; title: string; description: string }[] = [
  { id: 'sanctuary', title: 'Sanctuaire', description: 'Suspendre le chantier et protéger la forêt.' },
  { id: 'compromise', title: 'Corridor alternatif', description: 'Négocier un autre tracé et des garanties écologiques.' },
  { id: 'construction', title: 'Construction', description: 'Maintenir le corridor avec des réparations écologiques.' },
];
const DELEGATES = [
  { id: 'selene', name: 'Sélène', role: 'Symbioses', symbol: '✳' },
  { id: 'ivo', name: 'Ivo', role: 'Énergie', symbol: '◈' },
  { id: 'ada', name: 'Ada', role: 'Archives', symbol: '⌘' },
];

async function request<T>(
  url: string, data?: unknown, connection?: LlamaConnection | null,
): Promise<T> {
  // Android always runs the local game engine; only prose is sent to MUE.
  if (ANDROID_BUILD) {
    return androidGameRequest(url, data, window.localStorage, connection) as Promise<T>;
  }
  const res = await fetch(API + url, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Erreur du serveur (' + res.status + ')');
  }
  return res.json() as Promise<T>;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('scripted');
  const [session, setSession] = useState<Session | null>(null);
  const [kind, setKind] = useState<'publication' | 'observation'>('publication');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [proposal, setProposal] = useState<Proposal>('compromise');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [mueInput, setMueInput] = useState('');
  const [mueOrigin, setMueOrigin] = useState('');
  // The router API key is kept in memory only. Never persist or embed it.
  const [mueKey, setMueKey] = useState('');
  const [mueModels, setMueModels] = useState<string[]>([]);
  const [mueModel, setMueModel] = useState('');
  const [activeConnection, setActiveConnection] = useState<LlamaConnection | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [checkingMue, setCheckingMue] = useState(false);
  const [testingGeneration, setTestingGeneration] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('');
  const [speaker, setSpeaker] = useState<DelegateId>('selene');
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (ANDROID_BUILD) {
      const savedUrl = window.localStorage.getItem(MUE_ORIGIN_STORAGE_KEY);
      if (savedUrl) setMueInput(savedUrl); // Re-test connection and re-enter key after restart.
      const saved = resumeOfflineSession(window.localStorage);
      if (saved) queueMicrotask(() => setSession(saved as Session));
    }
  }, []);

  async function act(action: () => Promise<Session>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      setSession(await action());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Une erreur inattendue est survenue.');
    } finally {
      setPending(false);
    }
  }

  async function connectMue() {
    setCheckingMue(true);
    setConnectionMessage('Lecture des modèles du routeur MUE…');
    try {
      const normalized = normalizeTailscaleLlamaOrigin(mueInput);
      const models = await listLlamaModels(normalized, mueKey);
      const selected = preferredModel(models, mueModel);
      setMueOrigin(normalized);
      setMueInput(normalized);
      setMueModels(models);
      setMueModel(selected);
      window.localStorage.setItem(MUE_ORIGIN_STORAGE_KEY, normalized);
      setConnectionMessage('API /v1/models accessible : ' + models.length +
        ' modèle(s), dont ' + selected + '. Lance un test de génération pour vérifier le modèle.');
      setGenerationMessage('');
    } catch (reason) {
      setMueOrigin('');
      setMueModels([]);
      setMueModel('');
      setConnectionMessage(reason instanceof Error ? reason.message : 'Connexion impossible : vérifie Tailscale.');
      setGenerationMessage('');
    } finally {
      setCheckingMue(false);
    }
  }

  function disconnectMue() {
    window.localStorage.removeItem(MUE_ORIGIN_STORAGE_KEY);
    setMueOrigin('');
    setMueInput('');
    setMueModels([]);
    setMueModel('');
    setMueKey('');
    setActiveConnection(null);
    setConnectionMessage('MUE déconnecté. Le mode scénarisé reste disponible hors ligne.');
    setGenerationMessage('');
  }

  async function testGeneration() {
    if (!mueOrigin || !mueModel || checkingMue || testingGeneration) return;
    setTestingGeneration(true);
    setGenerationMessage('Test d’une vraie génération sur MUE en cours…');
    try {
      const result = await llamaChat(
        { origin: mueOrigin, apiKey: mueKey, model: mueModel },
        [
          { role: 'system', content: 'Tu es un délégué de test. Réponds brièvement en français.' },
          { role: 'user', content: 'Dis en une phrase que la liaison avec l’Assemblée fonctionne.' },
        ],
      );
      setGenerationMessage('Génération réussie sur ' + mueModel + ' : ' + result.slice(0, 200));
    } catch (reason) {
      setGenerationMessage('Échec de génération : ' +
        (reason instanceof Error ? reason.message : 'Erreur inconnue.'));
    } finally {
      setTestingGeneration(false);
    }
  }

  function startGame() {
    const connection: LlamaConnection | null = ANDROID_BUILD && mode === 'llm' && mueOrigin && mueModel
      ? { origin: mueOrigin, apiKey: mueKey, model: mueModel }
      : null;
    void act(async () => {
      const started = await request<Session>('/api/sessions', { mode }, connection);
      setActiveConnection(started.effective_mode === 'llm' ? connection : null);
      return started;
    });
  }

  function askDelegate() {
    if (!session || !activeConnection || !question.trim() || pending) return;
    const original = question;
    void act(async () => {
      const updated = await talkToDelegate(
        session, speaker, original, window.localStorage, activeConnection,
      );
      setQuestion('');
      return { ...updated };
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><span className="eyebrow">OCTOMUE / EXPÉRIENCE 01</span><h1>THE LAST DIALOGUE<span className="title-dot">.</span></h1></div>
        <div className="topbar-right"><span>LES ARCHIVES DU PRÉSENT</span><strong>{session ? `2235 · JOUR ${session.day}` : '2026 ⇄ 2235'}</strong></div>
      </header>

      {!session ? (
        <section className="welcome">
          <p className="eyebrow">UN JEU DE NÉGOCIATION POSTHUMAINE</p>
          <h2>Le passé est une preuve.<br /><em>Le futur, une décision.</em></h2>
          <p>En 2235, tu représentes une voix humaine à l&apos;Assemblée. Une forêt ancienne risque de disparaître sous un corridor énergétique. Les autres délégués attendent des archives issues de notre présent, en 2026.</p>
          <div className="mode-grid">
            <button type="button" className={`mode-card ${mode === 'scripted' ? 'selected' : ''}`} onClick={() => setMode('scripted')} aria-pressed={mode === 'scripted'}>
              <span className="mode-mark">◌</span><strong>Sans LLM</strong><small>Partie scénarisée, sans clé API et sans génération de contenu.</small>
            </button>
            <button type="button" className={`mode-card ${mode === 'llm' ? 'selected' : ''}`} onClick={() => setMode('llm')} aria-pressed={mode === 'llm'}>
              <span className="mode-mark">✳</span><strong>Agents LLM</strong><small>{ANDROID_BUILD ? (mueOrigin ? 'Agents exécutés via llama-server sur MUE, avec les règles conservées sur Android.' : 'Connecte directement le routeur MUE ci-dessous. Sans connexion, le jeu reste scénarisé.') : 'Sélène propose une mission ; Ada et Ivo réagissent aux archives et négociations via le backend web.'}</small>
            </button>
          </div>
          {ANDROID_BUILD && <div className="panel remote-panel">
            <span className="eyebrow">CERVEAU DISTANT / LLAMA-SERVER VIA TAILSCALE</span>
            <p>Pas de FastAPI à installer : Android gère le jeu et demande directement les dialogues à llama.cpp sur MUE, via Tailscale Serve en HTTPS.</p>
            <label><span>URL HTTPS de MUE via Tailscale Serve</span>
              <input type="url" autoComplete="url" spellCheck={false}
                placeholder="https://mue.mon-tailnet.ts.net"
                value={mueInput} onChange={event => {
                  setMueInput(event.target.value);
                  setMueOrigin('');
                  setMueModels([]);
                  setConnectionMessage('');
                  setGenerationMessage('');
                }} />
            </label>
            <label><span>Clé API llama.cpp (si le routeur en exige une)</span>
              <input type="password" autoComplete="off" spellCheck={false}
                placeholder="Clé d&apos;accès au routeur MUE"
                value={mueKey}
                onChange={event => {
                  setMueKey(event.target.value);
                  setMueOrigin('');
                  setMueModels([]);
                  setConnectionMessage('');
                  setGenerationMessage('');
                }} />
            </label>
            <p className="footnote">La clé reste en mémoire et n&apos;est ni enregistrée dans les archives ni intégrée à l&apos;APK. Ne la saisis que sur un appareil de confiance.</p>
            <div className="remote-buttons">
              <button type="button" className="secondary-action" disabled={checkingMue || !mueInput.trim()} onClick={() => void connectMue()}>
                {checkingMue ? 'Recherche des modèles…' : 'Tester /v1/models'}
              </button>
              {mueOrigin && <button type="button" className="text-action" onClick={disconnectMue}>Déconnecter MUE</button>}
            </div>
            {mueModels.length > 0 && <label><span>Modèle pour les délégués</span>
              <select value={mueModel} onChange={event => { setMueModel(event.target.value); setGenerationMessage(''); }}>
                {mueModels.map(id => <option value={id} key={id}>{id}</option>)}
              </select>
            </label>}
            {mueOrigin && mueModel && <button type="button" className="secondary-action"
              disabled={testingGeneration || checkingMue} onClick={() => void testGeneration()}>
              {testingGeneration ? 'Test de génération…' : 'Tester une vraie génération LLM'}
            </button>}
            {connectionMessage && <p role="status" className="notice">{connectionMessage}</p>}
            {generationMessage && <p role="status" className="notice">{generationMessage}</p>}
            <p className="footnote">Sur MUE, vérifie d&apos;abord <code>tailscale serve status</code>. Si le port HTTPS 443 est libre, utilise <code>tailscale serve --bg 8003</code> ; sinon, un port distinct comme <code>tailscale serve --bg --https=8443 8003</code>. Utilise l&apos;URL HTTPS affichée, sans :8003 et sans /v1.</p>
          </div>}
          <button className="primary-action" disabled={pending} onClick={startGame}>{pending ? 'Ouverture de la séance…' : 'Entrer dans l’Assemblée →'}</button>
          <p className="footnote">{ANDROID_BUILD ? 'Règles, votes et archives restent sur Android. En mode Agents LLM, seules les instructions et données nécessaires aux dialogues partent vers MUE sur ton tailnet.' : 'Prototype web : la session est traitée par le backend FastAPI.'}</p>
        </section>
      ) : (
        <div className="game-layout">
          <section className="main-column">
            <div className="panel chapter-panel">
              <span className="eyebrow">CHAPITRE 01 / LA FORÊT QUE L&apos;ON N&apos;ENTEND PAS</span>
              <h2>La dernière négociation</h2>
              <p>La cité a besoin d&apos;énergie. Le vivant réclame du temps. Les archives de 2026 peuvent infléchir les décisions, mais elles ne font pas disparaître les contradictions.</p>
              <div className="status-line"><span>Phase : {session.phase === 'finished' ? 'résolue' : session.phase === 'investigation' ? 'enquête' : 'négociation'}</span><span>Archives : {session.archives.length}</span><span>Influence : {session.influence}/5</span></div>
              {session.warning && <p className="notice" role="status">{session.warning}</p>}
              {session.result && <div className="verdict" role="status"><span className="eyebrow">DÉCISION DE L&apos;ASSEMBLÉE</span><strong>{session.result}</strong></div>}
            </div>

            <div className="panel dialogue-panel">
              <div className="panel-header"><span className="eyebrow">TRANSMISSIONS DE L&apos;ASSEMBLÉE</span><span className="live-mark">● ENREGISTRÉ</span></div>
              <div className="transcript" aria-live="polite">
                {session.messages.map((message, index) => (
                  <article key={`${index}-${message.speaker}`} className="message">
                    <div className="avatar">{DELEGATES.find(d => d.id === message.speaker)?.symbol || '◉'}</div>
                    <div><strong>{DELEGATES.find(d => d.id === message.speaker)?.name || 'Assemblée'}</strong><p>{message.text}</p></div>
                  </article>
                ))}
              </div>
              {ANDROID_BUILD && session.effective_mode === 'llm' && activeConnection && session.phase !== 'finished' &&
                <form className="delegate-chat" onSubmit={event => { event.preventDefault(); askDelegate(); }}>
                  <span className="eyebrow">DIALOGUE LIBRE AVEC LES DÉLÉGUÉS</span>
                  <label><span>Interlocuteur</span><select value={speaker} onChange={event => setSpeaker(event.target.value as DelegateId)}>
                    {DELEGATES.map(d => <option key={d.id} value={d.id}>{d.name} · {d.role}</option>)}
                  </select></label>
                  <label><span>Ta question ou ta proposition</span>
                    <textarea rows={2} minLength={3} maxLength={500} required
                      value={question} onChange={event => setQuestion(event.target.value)}
                      placeholder="Demander une précision, contester un argument, proposer une piste…" />
                  </label>
                  <button className="secondary-action" type="submit" disabled={pending || !question.trim()}>Envoyer au délégué →</button>
                  <p className="footnote">Le délégué peut discuter et proposer des idées. Il ne peut pas modifier les règles ni voter à ta place.</p>
                </form>}
            </div>

            {session.phase !== 'finished' && <div className="panel action-panel">
              <div className="panel-header"><span className="eyebrow">MISSION PROPOSÉE PAR SÉLÈNE</span><span className="tag">2026</span></div>
              <h3>{session.mission.title}</h3><p>{session.mission.request}</p>
              <div className="source-links"><a href="https://openalex.org/" target={ANDROID_BUILD ? '_self' : '_blank'} rel="noopener noreferrer">Explorer OpenAlex ↗</a><a href="https://inpn.mnhn.fr/" target={ANDROID_BUILD ? '_self' : '_blank'} rel="noopener noreferrer">Explorer l&apos;INPN ↗</a></div>
              <form onSubmit={(event) => { event.preventDefault(); void act(() => request<Session>(`/api/sessions/${session.id}/archives`, { kind, title, description, source_url: sourceUrl || null }, activeConnection)).then(() => { setTitle(''); setDescription(''); setSourceUrl(''); }); }}>
                <div className="field-row"><label><span>Nature de l&apos;archive</span><select value={kind} onChange={event => setKind(event.target.value as 'publication' | 'observation')}><option value="publication">Publication / document</option><option value="observation">Observation personnelle</option></select></label><label><span>Intitulé</span><input required maxLength={120} minLength={5} value={title} onChange={event => setTitle(event.target.value)} placeholder="Titre de la découverte" /></label></div>
                <label><span>Source web {kind === 'publication' ? '(requise)' : '(facultative)'}</span><input required={kind === 'publication'} type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
                <label><span>Ce que tu as réellement trouvé ou observé</span><textarea required minLength={25} maxLength={1500} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Décris l'observation ou résume les résultats. Une source déclarée n'est pas une preuve validée." /></label>
                <button className="secondary-action" disabled={pending || session.archives.length >= 12} type="submit">{pending ? 'Transmission…' : 'Ajouter aux archives →'}</button>
                <p className="footnote">Ne partage pas de localisation précise, de données personnelles ou de photos privées. {ANDROID_BUILD ? 'L’archive est conservée sur le téléphone. Sa description peut être transmise à Ada sur MUE pour commentaire.' : 'L’archive est conservée dans la session temporaire du backend.'}</p>
              </form>
            </div>}

            <div className="panel archives-panel"><div className="panel-header"><span className="eyebrow">ARCHIVES DU PRÉSENT</span><span className="tag">{session.archives.length} / 12</span></div>{session.archives.length === 0 ? <p className="muted">Aucun document versé. Une archive commence par une question.</p> : session.archives.map(a => <article className="archive" key={a.id}><div><span className="eyebrow">{a.kind === 'publication' ? 'PUBLICATION' : 'OBSERVATION'} / PROVENANCE NON VÉRIFIÉE</span><strong>{a.title}</strong><p>{a.description}</p>{a.source_url && <a href={a.source_url} target={ANDROID_BUILD ? '_self' : '_blank'} rel="noopener noreferrer">Consulter la source déclarée ↗</a>}</div></article>)}</div>
          </section>

          <aside className="side-column">
            <div className="panel delegates-panel"><span className="eyebrow">LE CONSEIL</span><div className="delegate-list">{DELEGATES.map(d => <div className="delegate" key={d.id}><span className="avatar">{d.symbol}</span><div><strong>{d.name}</strong><small>{d.role}</small></div><span className="position">{(session.positions[d.id] || 0) > 0 ? '+' : ''}{session.positions[d.id] || 0}</span></div>)}</div><p className="footnote">Position indicative dans ce conflit, pas un jugement moral.</p></div>
            <div className="panel decision-panel"><span className="eyebrow">ORDRE DU JOUR · VOTE FINAL</span><h3>Le corridor énergétique</h3><p>Dépose tes preuves, échange des concessions et soumets une proposition au Conseil.</p><div className="proposal-list">{PROPOSALS.map(p => <label className={`proposal ${proposal === p.id ? 'selected' : ''}`} key={p.id}><input type="radio" name="proposal" value={p.id} checked={proposal === p.id} onChange={() => setProposal(p.id)} disabled={session.phase === 'finished'} /><span><strong>{p.title}</strong><small>{p.description}</small></span></label>)}</div><button className="secondary-action" disabled={pending || session.phase === 'finished' || session.day >= 7} onClick={() => act(() => request<Session>(`/api/sessions/${session.id}/proposals`, { proposal }, activeConnection))}>Négocier cette proposition</button><button className="primary-action" disabled={pending || session.phase === 'finished'} onClick={() => act(() => request<Session>(`/api/sessions/${session.id}/vote`, { proposal }, activeConnection))}>Soumettre au vote →</button><p className="footnote">Le vote est définitif. 3 voix sur 4 sont nécessaires. Les règles sont identiques avec ou sans LLM.</p></div>
            <div className="panel session-panel"><span className="eyebrow">SESSION</span><p>{session.effective_mode === 'llm' ? 'Agents MUE · ' + (activeConnection ? activeConnection.model : 'connexion à rétablir') : 'Mode scénarisé · local'}</p><button className="text-action" onClick={() => { if (ANDROID_BUILD) clearOfflineSession(window.localStorage); setActiveConnection(null); setSession(null); setError(''); }}>Nouvelle partie ↗</button></div>
          </aside>
        </div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <footer>THE LAST DIALOGUE / PROTOTYPE DES ARCHIVES DU PRÉSENT · 2026 / 2235</footer>
    </main>
  );
}
