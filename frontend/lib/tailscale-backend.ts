/** Tailscale-only HTTPS backend settings for optional Android agents.
 * No server hostname or secret is embedded into public APKs.
 */
export const BACKEND_STORAGE_KEY = 'tld-tailscale-backend-v1';

export function normalizeTailscaleBackend(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Saisis l'adresse HTTPS affichée par Tailscale Serve.");
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

export async function verifyBackend(base: string, fetcher: typeof fetch = fetch): Promise<BackendCapabilities> {
  const response = await fetcher(normalizeTailscaleBackend(base) + '/api/capabilities', {
    method: 'GET', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
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
