/** Tailscale-only HTTPS backend settings for optional Android agents.
 * No server hostname or secret is embedded into public APKs.
 */
export const BACKEND_STORAGE_KEY = 'tld-tailscale-backend-v1';

export function normalizeTailscaleBackend(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Adresse incorrecte. Utilise l'URL HTTPS fournie par Tailscale Serve pour FastAPI.");
  }
  if (url.protocol === 'http:' && url.port === '8003') {
    throw new Error(
      "Le port 8003 est celui de llama.cpp, pas du jeu. " +
      "Démarre FastAPI sur MUE (8080), puis exécute tailscale serve --bg 8080. " +
      "Utilise ensuite l'URL HTTPS affichée par tailscale serve status.",
    );
  }
  if (url.protocol === 'http:' && url.hostname.endsWith('.ts.net')) {
    throw new Error(
      "La connexion HTTP directe n'est pas acceptée. " +
      "Expose FastAPI avec tailscale serve --bg 8080 et saisis son URL HTTPS.",
    );
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.ts.net') ||
    url.username !== '' || url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' || url.hash !== ''
  ) {
    throw new Error('Adresse attendue : https://mue.<ton-tailnet>.ts.net (Tailscale Serve uniquement).');
  }
  return url.origin;
}

export type BackendCapabilities = {
  app: 'the-last-dialogue';
  llm_configured: boolean;
  model: string;
};

export async function verifyBackend(
  base: string,
  fetcher: typeof fetch = fetch,
  gameAccessToken = '',
): Promise<BackendCapabilities> {
  const response = await fetcher(normalizeTailscaleBackend(base) + '/api/capabilities', {
    method: 'GET', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: gameAccessToken ? { Authorization: 'Bearer ' + gameAccessToken } : {},
  });
  if (response.status === 401) {
    throw new Error("Clé d'accès au jeu absente ou incorrecte.");
  }
  if (response.status === 404) {
    throw new Error("Ce service n'est pas l'API The Last Dialogue. Vérifie que Tailscale Serve cible FastAPI sur le port 8080, et non llama.cpp sur 8003.");
  }
  if (!response.ok) throw new Error('Serveur indisponible (HTTP ' + response.status + ').');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' ||
      (result as BackendCapabilities).app !== 'the-last-dialogue' ||
      typeof (result as BackendCapabilities).llm_configured !== 'boolean' ||
      typeof (result as BackendCapabilities).model !== 'string') {
    throw new Error("Le serveur n'est pas l'API The Last Dialogue attendue.");
  }
  return result as BackendCapabilities;
}
