/** Browser-side, opt-in llama.cpp access over HTTPS Tailscale Serve.
 * No FastAPI intermediary and no router API key is embedded into the APK.
 */
export const MUE_ORIGIN_STORAGE_KEY = 'tld-tailscale-llama-origin-v1';

export type LlamaConnection = {
  origin: string;
  apiKey: string;
  model: string;
};
export const MUE_LIMITS = Object.freeze({
  turnsPerScene: 2, scenesPerCouncil: 2, questionsPerCouncil: 3,
  maxTokens: 768, callMs: 18000, sceneMs: 30000, maxLine: 500,
});
export type Failure = 'busy' | 'timeout' | 'cancelled' | 'invalid' | 'unavailable';
export class MueError extends Error {
  readonly kind: Failure;
  constructor(kind: Failure, message: string) { super(message); this.kind = kind; }
}
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LlamaFetch = typeof fetch;

export function normalizeTailscaleLlamaOrigin(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Adresse invalide. Saisis l'URL HTTPS affichée par tailscale serve status."); }
  if (url.protocol === 'http:' && url.port === '8003') {
    throw new Error('Tu as indiqué llama-server en HTTP :8003. Expose ce même port avec tailscale serve --bg 8003 puis utilise son URL HTTPS, sans :8003.');
  }
  if (url.protocol !== 'https:' ||
      !/^(?:[a-z0-9-]+\.)+ts\.net$/.test(url.hostname) ||
      url.username !== '' || url.password !== '' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.search !== '' || url.hash !== '') {
    throw new Error('Adresse attendue : https://mue.<ton-tailnet>.ts.net (proxy Tailscale Serve vers llama-server :8003, sans /v1).');
  }
  return url.origin;
}

function getHeaders(apiKey: string, withBody: boolean): HeadersInit {
  return {
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
    ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
  };
}

async function checkedResponse(response: Response): Promise<Response> {
  if (response.status === 401 || response.status === 403) {
    throw new Error('Clé API llama.cpp incorrecte ou refusée par MUE.');
  }
  if (response.status === 404) {
    throw new Error("Le service ne présente pas l'API llama.cpp /v1. Vérifie que Tailscale Serve cible le port 8003, pas FastAPI.");
  }
  if (!response.ok) {
    throw new Error('MUE a retourné HTTP ' + response.status + '. Vérifie le modèle chargé et les journaux de llama-server.');
  }
  return response;
}

function networkError(error: unknown): Error {
  if (error instanceof Error && (/^Clé API|^Le service|^MUE a retourné/.test(error.message))) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new Error('Délai dépassé. Vérifie que le modèle est chargé et que MUE répond sur Tailscale.');
  }
  return new Error('Connexion à MUE impossible. Vérifie Tailscale sur les deux appareils, HTTPS Serve et les paramètres CORS de llama-server.');
}

export async function listLlamaModels(
  base: string,
  apiKey: string,
  fetcher: LlamaFetch = fetch,
): Promise<string[]> {
  const origin = normalizeTailscaleLlamaOrigin(base);
  try {
    const response = await fetcher(origin + '/v1/models', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: getHeaders(apiKey, false),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    await checkedResponse(response);
    const body: unknown = await response.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new Error('La réponse /v1/models ne contient pas de liste de modèles.');
    }
    if (data.length > 2048) throw new Error('La réponse dépasse la limite de modèles.');
    const models = [...new Set(data
      .map(item => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && /^[\w./:-]{1,128}$/.test(id)))];
    if (models.length === 0) throw new Error('MUE ne propose aucun modèle dans /v1/models.');
    return models;
  } catch (error) {
    if (error instanceof Error && /^(La réponse|MUE ne propose)/.test(error.message)) throw error;
    throw networkError(error);
  }
}

export function preferredModel(models: string[], previous = ''): string {
  if (previous && models.includes(previous)) return previous;
  return models.find(id => id === 'gemma4-32k')
    || models.find(id => id === 'qwen35-9b')
    || models[0] || '';
}

// A transport that ignores abort keeps its slot until the physical call settles.
let generating = false;

async function readCompletion(response: Response): Promise<unknown> {
  if (!response.body) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let json = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 65536) {
        void reader.cancel().catch(() => {});
        throw new MueError('invalid', 'Réponse trop volumineuse.');
      }
      json += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export async function llamaChat(
  connection: LlamaConnection, messages: ChatMessage[], fetcher: LlamaFetch = fetch,
  options: { signal?: AbortSignal; timeoutMs?: number; onDispatch?: () => void } = {},
): Promise<string> {
  const origin = normalizeTailscaleLlamaOrigin(connection.origin);
  if (!/^[\w./:-]{1,128}$/.test(connection.model)) {
    throw new MueError('invalid', 'Choisis un modèle proposé par MUE.');
  }
  const cancelled = () => new MueError('cancelled', 'Génération annulée.');
  if (options.signal?.aborted) throw cancelled();
  if (generating) throw new MueError('busy', 'Une génération est déjà en cours.');
  const timeoutMs = Math.min(MUE_LIMITS.callMs, options.timeoutMs ?? MUE_LIMITS.callMs);
  const controller = new AbortController();
  const abort = () => controller.abort(cancelled());
  const timer = setTimeout(() => controller.abort(new MueError('timeout', 'Délai de génération dépassé.')), timeoutMs);
  options.signal?.addEventListener('abort', abort, { once: true });
  generating = true;
  const call = async () => {
    try {
      options.onDispatch?.();
      const response = await fetcher(origin + '/v1/chat/completions', {
        method: 'POST', mode: 'cors', cache: 'no-store', redirect: 'error',
        headers: getHeaders(connection.apiKey, true),
        body: JSON.stringify({ model: connection.model, messages, stream: false,
          temperature: 0.6, max_tokens: MUE_LIMITS.maxTokens,
        }),
        signal: controller.signal,
      });
      await checkedResponse(response);
      let body: unknown;
      try { body = await readCompletion(response); }
      catch { throw new MueError('invalid', 'Réponse MUE illisible.'); }
      const content = (body as {choices?: {message?: {content?: unknown}}[]})?.choices?.[0]?.message?.content;
      const raw = Array.isArray(content) && content.length <= 16 && content.every(p => typeof p?.text === 'string')
        ? content.map(p => p.text).join('\n') : content;
      if (typeof raw !== 'string' || !raw.trim()) throw new MueError('invalid', 'Le modèle n’a pas produit de texte visible.');
      if (raw.length > 3000 || (connection.apiKey && raw.includes(connection.apiKey))) {
        throw new MueError('invalid', 'Réponse MUE hors format.');
      }
      return raw.trim();
    } finally { generating = false; }
  };
  try {
    return await Promise.race([call(), new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(controller.signal.reason);
      else controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    })]);
  } catch (err) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (err instanceof MueError) throw err;
    throw new MueError('unavailable', networkError(err).message);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
