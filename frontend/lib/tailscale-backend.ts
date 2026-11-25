/** Browser-side, opt-in llama.cpp access over HTTPS Tailscale Serve.
 * No FastAPI intermediary and no router API key is embedded into the APK.
 */
export const MUE_ORIGIN_STORAGE_KEY = 'tld-tailscale-llama-origin-v1';

export type LlamaConnection = {
  origin: string;
  apiKey: string;
  model: string;
};
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
      signal: AbortSignal.timeout(15000),
    });
    await checkedResponse(response);
    const body: unknown = await response.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new Error('La réponse /v1/models ne contient pas de liste de modèles.');
    }
    const models = [...new Set(data
      .map(item => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128))];
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

export async function llamaChat(
  connection: LlamaConnection,
  messages: ChatMessage[],
  fetcher: LlamaFetch = fetch,
): Promise<string> {
  const origin = normalizeTailscaleLlamaOrigin(connection.origin);
  if (!connection.model || !/^[\w./:-]{1,128}$/.test(connection.model)) {
    throw new Error('Choisis un modèle proposé par MUE.');
  }
  try {
    const response = await fetcher(origin + '/v1/chat/completions', {
      method: 'POST',
      mode: 'cors',
      headers: getHeaders(connection.apiKey, true),
      body: JSON.stringify({
        model: connection.model,
        messages,
        stream: false,
        temperature: 0.6,
        max_tokens: 420,
      }),
      signal: AbortSignal.timeout(150000),
    });
    await checkedResponse(response);
    const body: unknown = await response.json();
    const choice = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
    const raw = choice?.message?.content;
    const text = typeof raw === 'string' ? raw : Array.isArray(raw)
      ? raw.map(item => typeof item === 'object' && item !== null && 'text' in item
          ? String((item as { text: unknown }).text) : '').join('\n') : '';
    if (!text.trim()) throw new Error('Le modèle n’a pas produit de texte visible. Essaie un alias non-thinking sur MUE.');
    return text.trim().slice(0, 3000);
  } catch (error) {
    if (error instanceof Error && (/^(Le modèle n|Choisis un modèle)/.test(error.message))) throw error;
    throw networkError(error);
  }
}
