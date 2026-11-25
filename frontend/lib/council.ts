/** On-device assembly. Only the accepted events are inputs to the rules. */
import {
  adjustPositions, checkProposal, councilBallots, requireText, validSource,
  type Ballot, type Mode, type Proposal, type Session, type SessionStorage,
} from './offline-game.ts';

export const QUESTION = 'Quelle dépendance de la lisière ou du dispensaire le tracé laisse-t-il dans l’ombre ? Rapporte une pièce et précise ce qu’elle ne permet pas de conclure.';
export const COMMITMENT = 'Ivo accepte d’examiner un détour si le dispensaire reste alimenté, quitte à réduire les heures des ateliers.';
export const COUNCIL_KEY = 'tld-council-v2';
const LEGACY_KEY = 'tld-offline-session-v1';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TITLES: Record<Proposal, string> = {
  sanctuary: 'Sanctuaire', compromise: 'Corridor alternatif', construction: 'Construction',
};
const ENDINGS: Record<Proposal | 'rejected', string> = {
  sanctuary: 'Les rubans de chantier quittent les vieux arbres. Au dispensaire, la garde de nuit compte encore les bidons du groupe de secours. Le conseil devra trouver une autre alimentation.',
  compromise: 'Les piquets longent désormais les ateliers. La lisière tient et le dispensaire garde ses heures de courant. À la forge, la seconde équipe décroche sa grille horaire : plusieurs nuits de travail attendront.',
  construction: 'La première garde branchée au réseau range enfin ses lampes de secours. Dans la forêt, deux bandes de mousse se font face de part et d’autre de la tranchée. Le calendrier des réparations reste à tenir.',
  rejected: 'Aucun mandat ne sort de la salle. Cet hiver, le dispensaire tournera encore sur ses groupes de secours. Les arbres restent debout, sans protection durable contre le prochain tracé.',
};

type Review = 'record' | 'defer';
export type Piece = {
  kind: 'scenario' | 'publication' | 'observation'; title: string; description: string;
  limit: string; source_url: string | null; review: Review;
};
export const SCENARIO_PIECES: Record<'edge' | 'clinic', Piece> = {
  edge: {
    kind: 'scenario', review: 'record', title: 'Le carnet de lisière', source_url: null,
    description: 'Sur le feuillet du matin, une file de traces quitte le sous-bois par la même trouée. Le trait rouge du corridor traverse cette trouée.',
    limit: 'Le carnet décrit une seule matinée. Il ne dit ni qui passe la nuit, ni si une autre trouée reste praticable.',
  },
  clinic: {
    kind: 'scenario', review: 'record', title: 'Le registre de garde du dispensaire', source_url: null,
    description: 'Une garde a reporté les stérilisations au matin après une panne. Le plan de recharge place le dispensaire et les fours des ateliers sur la même ligne de secours.',
    limit: 'Une seule garde est consignée. La durée réelle des prochaines coupures et les réserves des ateliers restent inconnues.',
  },
};
export type PieceInput = ({ demo: 'edge' | 'clinic' } |
  { kind: 'publication' | 'observation'; title: string; description: string; limit: string; source_url?: string | null }) & { review?: Review };
export type CouncilAction = { type: 'deposit'; piece: PieceInput } | { type: 'motion' | 'vote'; proposal: Proposal };
export type CouncilResult = { proposal: Proposal; support: number; passed: boolean; ballots: Ballot[]; epilogue: string };
export type Council = {
  id: string; mode: Mode; revision: number; phase: 'investigation' | 'motion' | 'vote' | 'finished';
  archive: Piece | null; motion: Proposal | null; result: CouncilResult | null;
  events: { id: string; text: string }[]; legacy: Session | null;
};

// The receipt is kept with the vote so a revision cannot silently change a past ruling.
type Saved = {
  version: 2; id: string; mode: Mode; legacy: Session | null;
  actions: CouncilAction[]; receipt: CouncilResult | null; events: Council['events'];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function invalid(): never {
  throw new Error('Sauvegarde illisible ou incohérente. Tes données ont été conservées.');
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every(key => allowed.includes(key));
}
function modeValue(mode: unknown): Mode {
  if (mode !== 'llm' && mode !== 'scripted') throw new Error('Mode de jeu inconnu.');
  return mode;
}
function readPiece(value: unknown): PieceInput {
  if (!record(value)) throw new Error('Pièce manquante.');
  const review = value.review === undefined ? 'record' : value.review;
  if (review !== 'record' && review !== 'defer') throw new Error('Demande de contre-lecture inconnue.');
  if ('demo' in value) {
    if (!keys(value, ['demo', 'review']) || (value.demo !== 'edge' && value.demo !== 'clinic')) throw new Error('Fiche de scénario inconnue.');
    return { demo: value.demo, review };
  }
  if (!keys(value, ['kind', 'title', 'description', 'limit', 'source_url', 'review']) ||
      (value.kind !== 'publication' && value.kind !== 'observation')) throw new Error('Nature de pièce inconnue.');
  const title = requireText(value.title, 'Titre', 5, 120);
  const description = requireText(value.description, 'Description', 25, 1500);
  const limit = requireText(value.limit, 'Réserve', 8, 350);
  const source_url = validSource(value.source_url);
  if (value.kind === 'publication' && !source_url) throw new Error('Indique la source du document.');
  return { kind: value.kind, title, description, limit, source_url, review };
}
function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function inRange(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function readLegacy(value: unknown): Session {
  if (!record(value) || typeof value.id !== 'string' || !UUID.test(value.id) ||
      !['investigation', 'negotiation', 'finished'].includes(String(value.phase)) ||
      !inRange(value.day, 1, 25) || !inRange(value.influence, 0, 5) ||
      !record(value.positions) || !['selene', 'ivo', 'ada'].every(id => inRange((value.positions as Record<string, unknown>)[id], -3, 3)) ||
      !Array.isArray(value.archives) || value.archives.length > 12 ||
      !Array.isArray(value.agreements) || value.agreements.length > 6 ||
      !Array.isArray(value.messages) || value.messages.length > 10000 ||
      !record(value.mission) || value.mission.agent !== 'selene' || !bounded(value.mission.title, 120) ||
      !bounded(value.mission.request, 1500) || !(value.warning === null || bounded(value.warning, 1500)) ||
      !(value.phase === 'finished' ? bounded(value.result, 1500) : value.result === null)) invalid();
  const archives = value.archives.map(a => {
    if (!record(a) || typeof a.id !== 'string' || !UUID.test(a.id) ||
        (a.kind !== 'observation' && a.kind !== 'publication') || !bounded(a.title, 120) ||
        !bounded(a.description, 1500) || !bounded(a.created_at, 40) || !Number.isFinite(Date.parse(a.created_at)) ||
        a.provenance !== 'player-submitted; unverified') invalid();
    const url = validSource(a.source_url);
    if (a.kind === 'publication' && !url) invalid();
    return { id: a.id, kind: a.kind, title: a.title, description: a.description, source_url: url, provenance: a.provenance, created_at: a.created_at };
  });
  if (new Set(archives.map(a => a.id)).size !== archives.length) invalid();
  const messages = value.messages.map(m => {
    if (!record(m) || !['assembly', 'player', 'ivo', 'ada', 'selene'].includes(String(m.speaker)) || !bounded(m.text, 3000)) invalid();
    return { speaker: String(m.speaker), text: m.text };
  });
  const agreements = value.agreements.map(p => { checkProposal(p); return p; });
  const positions = value.positions as Record<string, number>;
  return {
    id: value.id, mode: modeValue(value.mode), effective_mode: modeValue(value.effective_mode), phase: value.phase as Session['phase'],
    day: Number(value.day), influence: Number(value.influence), positions: { selene: positions.selene, ivo: positions.ivo, ada: positions.ada },
    archives: archives as Session['archives'], messages, agreements, result: value.result as string | null,
    mission: { agent: 'selene', title: value.mission.title, request: value.mission.request }, warning: value.warning as string | null,
  };
}

function opening(saved: Saved): Council {
  return { id: saved.id, mode: saved.mode, legacy: saved.legacy, phase: 'investigation', revision: 0,
    archive: null, motion: null, result: null, events: [
      { id: 'opening', text: QUESTION }, { id: 'commitment', text: COMMITMENT },
    ] };
}
function apply(state: Council, input: unknown): CouncilAction {
  if (!record(input)) throw new Error('Action inconnue.');
  if (state.phase === 'investigation' && input.type === 'deposit' && keys(input, ['type', 'piece'])) {
    const piece = readPiece(input.piece);
    const review = piece.review ?? 'record';
    state.archive = 'demo' in piece
      ? { ...SCENARIO_PIECES[piece.demo], review }
      : { ...piece, source_url: piece.source_url ?? null, review };
    state.events.push(
      { id: 'archive', text: state.archive.title },
      { id: 'review', text: review === 'defer'
        ? 'Le joueur demande une contre-lecture avant décision. Ada s’oppose à statuer tant que cette demande reste ouverte.'
        : 'Le joueur consigne la réserve et demande de statuer. Ada accepte que la pièce entre au scrutin.' },
      { id: 'return', text: state.archive.limit },
    );
    state.phase = 'motion';
    state.revision += 1;
    return { type: 'deposit', piece };
  }
  if (!keys(input, ['type', 'proposal']) || (input.type !== 'motion' && input.type !== 'vote') || state.phase !== input.type) {
    throw new Error('Cette action ne figure plus à l’ordre du jour.');
  }
  const proposal = input.proposal;
  checkProposal(proposal);
  if (input.type === 'motion') {
    state.motion = proposal;
    state.events.push({ id: 'motion', text: 'Motion négociée : ' + TITLES[proposal] });
    state.phase = 'vote';
  } else {
    if (!state.motion || !state.archive) invalid();
    const positions = { selene: 2, ivo: -2, ada: 1 };
    adjustPositions(positions, state.motion);
    const ballots = councilBallots(positions, 1, proposal, state.archive.review === 'defer');
    const support = ballots.filter(ballot => ballot.yes).length;
    const passed = support >= 3;
    state.result = { proposal, support, passed, ballots, epilogue: ENDINGS[passed ? proposal : 'rejected'] };
    state.events.push({ id: 'vote', text: TITLES[proposal] + ' · ' + support + '/4 voix · ' + (passed ? 'adoption' : 'rejet') });
    state.phase = 'finished';
  }
  state.revision += 1;
  return { type: input.type, proposal };
}
function parseSaved(raw: string): { saved: Saved; council: Council } {
  try {
    if (raw.length > 4_000_000) invalid();
    const obj: unknown = JSON.parse(raw);
    if (!record(obj) || obj.version !== 2 || typeof obj.id !== 'string' || !UUID.test(obj.id) ||
        !Array.isArray(obj.actions) || obj.actions.length > 3) invalid();
    const saved: Saved = {
      version: 2, id: obj.id, mode: modeValue(obj.mode), legacy: obj.legacy === null ? null : readLegacy(obj.legacy),
      actions: [], receipt: null, events: [],
    };
    const council = opening(saved);
    for (const action of obj.actions) saved.actions.push(apply(council, action));
    if (JSON.stringify(obj.events) !== JSON.stringify(council.events)) invalid();
    saved.events = council.events;
    if (JSON.stringify(obj.receipt) !== JSON.stringify(council.result)) invalid();
    saved.receipt = council.result;
    return { saved, council };
  } catch { return invalid(); }
}
function newSession(store: SessionStorage, mode: Mode, legacy: Session | null): Council {
  const saved: Saved = { version: 2, id: crypto.randomUUID(), mode: modeValue(mode), legacy, actions: [], receipt: null, events: [] };
  const state = opening(saved);
  saved.events = state.events;
  store.setItem(COUNCIL_KEY, JSON.stringify(saved));
  return state;
}
function parseLegacy(raw: string): Session {
  try {
    if (raw.length > 3_000_000) invalid();
    return readLegacy(JSON.parse(raw));
  } catch { return invalid(); }
}

export function loadCouncil(store: SessionStorage): Council | null {
  const raw = store.getItem(COUNCIL_KEY);
  if (raw !== null) return parseSaved(raw).council;
  const old = store.getItem(LEGACY_KEY);
  if (old === null) return null;
  const legacy = parseLegacy(old);
  return newSession(store, legacy.mode, legacy);
}
export function startCouncil(store: SessionStorage, mode: Mode): Council {
  const current = loadCouncil(store);
  if (current && current.phase !== 'finished') throw new Error('Une séance est déjà ouverte. Reprends son ordre du jour.');
  return newSession(store, mode, current?.legacy ?? null);
}
export function applyCouncil(store: SessionStorage, previous: Council, action: CouncilAction): Council {
  const raw = store.getItem(COUNCIL_KEY);
  if (raw === null) throw new Error('La séance n’est plus disponible.');
  const { saved, council } = parseSaved(raw);
  if (council.id !== previous.id || council.revision !== previous.revision) throw new Error('La séance a déjà avancé.');
  saved.actions.push(apply(council, action));
  saved.receipt = council.result;
  saved.events = council.events;
  store.setItem(COUNCIL_KEY, JSON.stringify(saved));
  return council;
}
/** Explicit recovery. A failed backup or replacement leaves the original readable bytes in place. */
export function recoverCouncil(store: SessionStorage, mode: Mode): Council {
  const current = store.getItem(COUNCIL_KEY);
  const legacy = store.getItem(LEGACY_KEY);
  if (current === null && legacy === null) return newSession(store, mode, null);
  let readable = true;
  try {
    if (current !== null) parseSaved(current);
    else if (legacy !== null) parseLegacy(legacy);
  } catch { readable = false; }
  if (readable) throw new Error('La sauvegarde est lisible. Reprends la séance.');
  const key = 'tld-council-recovery-' + crypto.randomUUID();
  store.setItem(key, current ?? legacy!);
  return newSession(store, mode, null);
}
