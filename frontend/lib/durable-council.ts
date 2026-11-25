import { COUNCIL_KEY, loadCouncil, type Council } from './council.ts';
import type { SessionStorage } from './offline-game.ts';

const BOOKS = 'books';
const CURRENT = 'current';
const VOICES = 'tld-council-prose-v1';
type Books = { council: string | null; voices: string | null };
export class CouncilStorageError extends Error {}

// The engine and the voice renderer share a synchronous view of confirmed books.
// A full localStorage mirror must never veto an already committed IndexedDB write.
const fallback = new Map<string, string | null>();
export const storyStore: SessionStorage = {
  getItem(key) {
    return fallback.has(key) ? fallback.get(key)! : window.localStorage.getItem(key);
  },
  setItem(key, value) {
    try { window.localStorage.setItem(key, value); fallback.delete(key); }
    catch { fallback.set(key, value); }
  },
  removeItem(key) {
    try { window.localStorage.removeItem(key); fallback.delete(key); }
    catch { fallback.set(key, null); }
  },
};

/** Read the last committed council and apply the synchronous rules in one transaction.
 * Only story records enter this database. Credentials and connection settings are out of scope.
 */
export async function durableCouncil<T>(
  mirror: SessionStorage, operation: (store: SessionStorage) => T,
  restoreVoices = false, factory: IDBFactory = globalThis.indexedDB,
): Promise<T> {
  if (!factory) throw new CouncilStorageError('Le stockage durable est indisponible dans ce navigateur.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open('tld-assembly', 1);
    open.onupgradeneeded = () => open.result.createObjectStore(BOOKS);
    open.onerror = () => reject(new CouncilStorageError('Impossible d’ouvrir le registre sur cet appareil.'));
    open.onsuccess = () => resolve(open.result);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(BOOKS, 'readwrite', { durability: 'strict' });
      const books = tx.objectStore(BOOKS);
      const read = books.get(CURRENT);
      const changes = new Map<string, string | null>();
      let result: T;
      let cause: unknown;
      let next: Books;
      read.onsuccess = () => {
        try {
          const previous: Books | undefined = read.result;
          const council = previous ? previous.council : mirror.getItem(COUNCIL_KEY);
          const voices = restoreVoices && previous ? previous.voices : mirror.getItem(VOICES);
          const stage: SessionStorage = {
            getItem(key) {
              if (changes.has(key)) return changes.get(key)!;
              if (key === COUNCIL_KEY) return council;
              if (key === VOICES) return voices;
              return mirror.getItem(key);
            },
            setItem: (key, value) => { changes.set(key, value); },
            removeItem: key => { changes.set(key, null); },
          };
          result = operation(stage);
          next = { council: stage.getItem(COUNCIL_KEY), voices: stage.getItem(VOICES) };
          for (const [key, value] of changes) {
            if (key.startsWith('tld-council-recovery-') || key.startsWith('tld-voices-recovery-')) books.put(value, key);
          }
          if (previous?.council !== next.council || previous?.voices !== next.voices) books.put(next, CURRENT);
        } catch (err) { cause = err; tx.abort(); }
      };
      tx.onabort = () => reject(cause ?? new CouncilStorageError('Écriture interrompue. Réessaie après avoir vérifié l’espace disponible.'));
      tx.oncomplete = () => {
        changes.set(COUNCIL_KEY, next.council);
        if (restoreVoices) changes.set(VOICES, next.voices);
        try {
          for (const [key, value] of changes) {
            if (mirror.getItem(key) !== value) {
              if (value === null) mirror.removeItem(key);
              else mirror.setItem(key, value);
            }
          }
          resolve(result);
        } catch { reject(new CouncilStorageError('Registre enregistré. Rouvre la séance pour relire sa copie locale.')); }
      };
    });
  } finally { db.close(); }
}

/** Checkpoint completed dialogue before unlocking the next action. */
export function confirmVoices(session: Council, mirror: SessionStorage) {
  return durableCouncil(mirror, store => {
    const current = loadCouncil(store);
    if (current?.id !== session.id || current.revision !== session.revision) {
      throw new Error('La séance a avancé pendant la transmission.');
    }
  });
}
