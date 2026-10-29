'use client';

import { useState } from 'react';

type Mode = 'scripted' | 'llm';
type Proposal = 'sanctuary' | 'compromise' | 'construction';
type Archive = {
  id: string;
  kind: 'publication' | 'observation';
  title: string;
  description: string;
  source_url: string | null;
  provenance: string;
};
type Session = {
  id: string;
  mode: Mode;
  effective_mode: Mode;
  phase: 'investigation' | 'negotiation' | 'finished';
  day: number;
  influence: number;
  archives: Archive[];
  messages: { speaker: string; text: string }[];
  positions: Record<string, number>;
  agreements: Proposal[];
  result: string | null;
  mission: { agent: string; title: string; request: string };
  warning: string | null;
};

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');
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

async function request<T>(url: string, data?: unknown): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : `Erreur du serveur (${res.status})`);
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
              <span className="mode-mark">✳</span><strong>Agents LLM</strong><small>Sélène propose une mission ; Ada et Ivo réagissent aux archives et négociations. Requiert une clé OpenAI côté serveur.</small>
            </button>
          </div>
          <button className="primary-action" disabled={pending} onClick={() => act(() => request<Session>('/api/sessions', { mode }))}>{pending ? 'Ouverture de la séance…' : 'Entrer dans l’Assemblée →'}</button>
          <p className="footnote">Prototype local : sessions temporaires, aucune information envoyée à un service externe en mode sans LLM.</p>
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
            </div>

            {session.phase !== 'finished' && <div className="panel action-panel">
              <div className="panel-header"><span className="eyebrow">MISSION PROPOSÉE PAR SÉLÈNE</span><span className="tag">2026</span></div>
              <h3>{session.mission.title}</h3><p>{session.mission.request}</p>
              <div className="source-links"><a href="https://openalex.org/" target="_blank" rel="noopener noreferrer">Explorer OpenAlex ↗</a><a href="https://inpn.mnhn.fr/" target="_blank" rel="noopener noreferrer">Explorer l&apos;INPN ↗</a></div>
              <form onSubmit={(event) => { event.preventDefault(); void act(() => request<Session>(`/api/sessions/${session.id}/archives`, { kind, title, description, source_url: sourceUrl || null })).then(() => { setTitle(''); setDescription(''); setSourceUrl(''); }); }}>
                <div className="field-row"><label><span>Nature de l&apos;archive</span><select value={kind} onChange={event => setKind(event.target.value as 'publication' | 'observation')}><option value="publication">Publication / document</option><option value="observation">Observation personnelle</option></select></label><label><span>Intitulé</span><input required maxLength={120} minLength={5} value={title} onChange={event => setTitle(event.target.value)} placeholder="Titre de la découverte" /></label></div>
                <label><span>Source web {kind === 'publication' ? '(requise)' : '(facultative)'}</span><input required={kind === 'publication'} type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
                <label><span>Ce que tu as réellement trouvé ou observé</span><textarea required minLength={25} maxLength={1500} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Décris l'observation ou résume les résultats. Une source déclarée n'est pas une preuve validée." /></label>
                <button className="secondary-action" disabled={pending || session.archives.length >= 12} type="submit">{pending ? 'Transmission…' : 'Ajouter aux archives →'}</button>
                <p className="footnote">Ne partage pas de localisation précise, de données personnelles ou de photos privées. Les données restent dans la session côté serveur (temporairement).</p>
              </form>
            </div>}

            <div className="panel archives-panel"><div className="panel-header"><span className="eyebrow">ARCHIVES DU PRÉSENT</span><span className="tag">{session.archives.length} / 12</span></div>{session.archives.length === 0 ? <p className="muted">Aucun document versé. Une archive commence par une question.</p> : session.archives.map(a => <article className="archive" key={a.id}><div><span className="eyebrow">{a.kind === 'publication' ? 'PUBLICATION' : 'OBSERVATION'} / PROVENANCE NON VÉRIFIÉE</span><strong>{a.title}</strong><p>{a.description}</p>{a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer">Consulter la source déclarée ↗</a>}</div></article>)}</div>
          </section>

          <aside className="side-column">
            <div className="panel delegates-panel"><span className="eyebrow">LE CONSEIL</span><div className="delegate-list">{DELEGATES.map(d => <div className="delegate" key={d.id}><span className="avatar">{d.symbol}</span><div><strong>{d.name}</strong><small>{d.role}</small></div><span className="position">{(session.positions[d.id] || 0) > 0 ? '+' : ''}{session.positions[d.id] || 0}</span></div>)}</div><p className="footnote">Position indicative dans ce conflit, pas un jugement moral.</p></div>
            <div className="panel decision-panel"><span className="eyebrow">ORDRE DU JOUR · VOTE FINAL</span><h3>Le corridor énergétique</h3><p>Dépose tes preuves, échange des concessions et soumets une proposition au Conseil.</p><div className="proposal-list">{PROPOSALS.map(p => <label className={`proposal ${proposal === p.id ? 'selected' : ''}`} key={p.id}><input type="radio" name="proposal" value={p.id} checked={proposal === p.id} onChange={() => setProposal(p.id)} disabled={session.phase === 'finished'} /><span><strong>{p.title}</strong><small>{p.description}</small></span></label>)}</div><button className="secondary-action" disabled={pending || session.phase === 'finished' || session.day >= 7} onClick={() => act(() => request<Session>(`/api/sessions/${session.id}/proposals`, { proposal }))}>Négocier cette proposition</button><button className="primary-action" disabled={pending || session.phase === 'finished'} onClick={() => act(() => request<Session>(`/api/sessions/${session.id}/vote`, { proposal }))}>Soumettre au vote →</button><p className="footnote">Le vote est définitif. 3 voix sur 4 sont nécessaires. Les règles sont identiques avec ou sans LLM.</p></div>
            <div className="panel session-panel"><span className="eyebrow">SESSION</span><p>{session.effective_mode === 'llm' ? 'Agents LLM actifs' : 'Mode scénarisé'}</p><button className="text-action" onClick={() => { setSession(null); setError(''); }}>Nouvelle partie ↗</button></div>
          </aside>
        </div>
      )}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <footer>THE LAST DIALOGUE / PROTOTYPE DES ARCHIVES DU PRÉSENT · 2026 / 2235</footer>
    </main>
  );
}
