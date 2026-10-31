/** Standalone scripted game engine for the Android APK.
 * Mirrors the small FastAPI prototype's deterministic rules. No network, AI or GPS.
 */
export type Mode = 'scripted' | 'llm';
export type Proposal = 'sanctuary' | 'compromise' | 'construction';
export type EvidenceKind = 'publication' | 'observation';
export type Archive = {
  id: string;
  kind: EvidenceKind;
  title: string;
  description: string;
  source_url: string | null;
  created_at: string;
  provenance: string;
};
export type Session = {
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
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'tld-offline-session-v1';
const PROPOSALS: Record<Proposal, string> = {
  sanctuary: 'Protéger la forêt et suspendre le corridor énergétique.',
  compromise: 'Rechercher un tracé alternatif avec garanties écologiques.',
  construction: 'Autoriser le corridor avec mesures de réparation écologique.',
};
const MISSION = {
  agent: 'selene',
  title: 'Les témoins du vivant',
  request: "Retrouve une publication scientifique ou réalise une observation du vivant en 2026. Dépose une archive avec sa provenance pour que l'Assemblée puisse la discuter.",
};

function uniqueId(): string {
  return globalThis.crypto.randomUUID();
}

export function createOfflineSession(mode: Mode = 'scripted'): Session {
  const session: Session = {
    id: uniqueId(), mode, effective_mode: 'scripted', phase: 'investigation',
    day: 1, influence: 0, archives: [],
    messages: [
      { speaker: 'assembly', text: "2235. L'Assemblée doit statuer sur un corridor énergétique traversant une forêt ancienne. Trois délégués attendent tes preuves et tes propositions." },
      { speaker: 'selene', text: MISSION.request },
    ],
    positions: { selene: 2, ivo: -2, ada: 0 }, agreements: [], result: null,
    mission: { ...MISSION },
    warning: mode === 'llm'
      ? "APK autonome : aucun serveur LLM configuré. Mode scénarisé activé ; aucune IA n'a été appelée."
      : 'APK autonome : les archives restent sur cet appareil et ne sont pas vérifiées.',
  };
  return session;
}

function requireText(input: unknown, label: string, min: number, max: number): string {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text.length < min || text.length > max) {
    throw new Error(`${label} doit contenir entre ${min} et ${max} caractères`);
  }
  return text;
}
function validSource(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (typeof input !== 'string' || input.length > 2048) throw new Error('URL de source invalide');
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new Error('URL de source invalide'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('URL de source invalide');
  }
  return input.trim();
}

export function addOfflineArchive(session: Session, data: {
  kind: EvidenceKind; title: string; description: string; source_url?: string | null;
}): Session {
  if (session.phase === 'finished') throw new Error('La négociation est terminée');
  if (session.archives.length >= 12) throw new Error('La limite de douze archives est atteinte');
  if (!['publication', 'observation'].includes(data.kind)) throw new Error("Type d'archive inconnu");
  const title = requireText(data.title, 'Titre', 5, 120);
  const description = requireText(data.description, 'Description', 25, 1500);
  const source_url = validSource(data.source_url);
  if (data.kind === 'publication' && !source_url) throw new Error('Une publication doit comporter un lien vers sa source');
  const archive: Archive = {
    id: uniqueId(), kind: data.kind, title, description,
    source_url, created_at: new Date().toISOString(), provenance: 'player-submitted; unverified',
  };
  session.archives.push(archive);
  session.influence = Math.min(5, session.influence + 1);
  session.positions.ada = Math.min(2, session.positions.ada + 1);
  session.messages.push({ speaker: 'ada', text: `L'archive « ${title} » entre au dossier. Sa provenance est déclarée, pas encore vérifiée. Elle ouvre une question, elle ne prouve pas à elle seule une thèse.` });
  session.day += 1;
  session.phase = 'negotiation';
  return session;
}
function checkProposal(proposal: string): asserts proposal is Proposal {
  if (!(proposal in PROPOSALS)) throw new Error('Proposition inconnue');
}
export function negotiateOffline(session: Session, proposal: string): Session {
  if (session.phase === 'finished') throw new Error('La négociation est terminée');
  checkProposal(proposal);
  if (session.day >= 7) throw new Error('Le délai de négociation est écoulé : passe au vote');
  if (proposal === 'sanctuary') {
    session.positions.selene = Math.min(3, session.positions.selene + 1);
    session.positions.ivo = Math.max(-3, session.positions.ivo - 1);
  } else if (proposal === 'construction') {
    session.positions.ivo = Math.min(3, session.positions.ivo + 2);
    session.positions.selene = Math.max(-3, session.positions.selene - 1);
  } else {
    session.positions.selene = Math.min(3, session.positions.selene + 1);
    session.positions.ivo = Math.min(3, session.positions.ivo + 1);
  }
  session.agreements.push(proposal);
  session.phase = 'negotiation';
  session.day += 1;
  session.messages.push({ speaker: 'ivo', text: `J'enregistre ta proposition : ${PROPOSALS[proposal]} Notre position évolue, mais les besoins énergétiques demeurent.` });
  return session;
}
export function voteOffline(session: Session, proposal: string): Session {
  if (session.phase === 'finished') throw new Error('Cette session a déjà voté');
  checkProposal(proposal);
  let support = 1;
  support += Number(proposal === 'sanctuary' && session.positions.selene >= 1);
  support += Number(proposal === 'construction' && session.positions.ivo >= 0);
  support += Number(proposal === 'compromise' && session.positions.selene >= 1);
  support += Number(proposal === 'compromise' && session.positions.ivo >= -1);
  support += Number(session.positions.ada >= 1 && session.archives.length >= 1);
  const passed = support >= 3;
  session.phase = 'finished';
  session.result = `${passed ? 'Accord adopté' : 'Accord rejeté'} (${support}/4 voix) : ${PROPOSALS[proposal]}`;
  session.messages.push({ speaker: 'assembly', text: session.result });
  return session;
}

export function resumeOfflineSession(store: SessionStorage): Session | null {
  const saved = store.getItem(KEY);
  if (!saved) return null;
  try {
    const candidate: unknown = JSON.parse(saved);
    if (!candidate || typeof candidate !== 'object') return null;
    const s = candidate as Partial<Session>;
    if (!s.id || !['investigation', 'negotiation', 'finished'].includes(s.phase || '') || !Array.isArray(s.archives) || !Array.isArray(s.messages) || !s.positions || !s.mission) return null;
    return s as Session;
  } catch { return null; }
}

/** The same HTTP contract as the FastAPI prototype, but entirely on device. */
export function offlineRequest(path: string, data: unknown, store: SessionStorage): Session {
  if (path === '/api/sessions') {
    const requestedMode = (data as { mode?: Mode } | undefined)?.mode || 'scripted';
    if (requestedMode !== 'scripted' && requestedMode !== 'llm') throw new Error('Mode inconnu');
    const next = createOfflineSession(requestedMode);
    store.setItem(KEY, JSON.stringify(next));
    return next;
  }
  const match = /^\/api\/sessions\/([^/]+)(?:\/(archives|proposals|vote))?$/.exec(path);
  if (!match) throw new Error('Action inconnue');
  const session = resumeOfflineSession(store);
  if (!session || session.id !== match[1]) throw new Error('Session introuvable');
  const action = match[2];
  if (!action) return session;
  const body = data as { kind: EvidenceKind; title: string; description: string; source_url: string | null; proposal: string };
  if (!body) throw new Error('Requête incomplète');
  if (action === 'archives') addOfflineArchive(session, body);
  else if (action === 'proposals') negotiateOffline(session, body.proposal);
  else if (action === 'vote') voteOffline(session, body.proposal);
  store.setItem(KEY, JSON.stringify(session));
  return session;
}

export function clearOfflineSession(store: SessionStorage): void {
  store.removeItem(KEY);
}
