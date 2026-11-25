'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listLlamaModels, llamaChat, MUE_ORIGIN_STORAGE_KEY, normalizeTailscaleLlamaOrigin,
  preferredModel, type LlamaConnection,
} from '../lib/tailscale-backend';

type Props = { disabled: boolean; onBusyChange?: (busy: boolean) => void; onChange: (connection: LlamaConnection | null) => void };

export function CouncilConnection({ disabled, onChange, onBusyChange }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const token = useRef(0);

  useEffect(() => {
    const attempts = token;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try { setUrl(localStorage.getItem(MUE_ORIGIN_STORAGE_KEY) || ''); }
      catch { setStatus('Adresse indisponible dans le stockage local.'); }
    });
    return () => { mounted = false; attempts.current++; };
  }, []);

  useEffect(() => {
    onBusyChange?.(busy);
    return () => { onBusyChange?.(false); };
  }, [busy, onBusyChange]);

  function forgetModel() {
    token.current++;
    setModels([]);
    setModel('');
    setStatus('');
    setBusy(false);
    onChange(null);
  }

  async function connect(test: boolean) {
    if (disabled || busy) return;
    const attempt = ++token.current;
    setBusy(true);
    setStatus(test ? 'Le modèle prépare une réplique…' : 'Lecture des modèles de MUE…');
    try {
      const origin = normalizeTailscaleLlamaOrigin(url);
      if (test) {
        const answer = await llamaChat({ origin, apiKey: key, model }, [
          { role: 'user', content: 'En français, annonce en une phrase l’ouverture de la séance fictive.' },
        ]);
        if (token.current === attempt) setStatus('Réponse du modèle · ' + answer.slice(0, 250));
      } else {
        const available = await listLlamaModels(origin, key);
        if (token.current !== attempt) return;
        const selected = preferredModel(available);
        setUrl(origin);
        setModels(available);
        setModel(selected);
        onChange({ origin, apiKey: key, model: selected });
        let message = 'Modèles reçus. Tu peux tester une réplique ou rejoindre la séance.';
        try { localStorage.setItem(MUE_ORIGIN_STORAGE_KEY, origin); }
        catch { message += ' Cette adresse devra être ressaisie après fermeture.'; }
        setStatus(message);
      }
    } catch (reason) {
      if (token.current === attempt) setStatus(reason instanceof Error ? reason.message : 'MUE indisponible. La séance peut continuer hors ligne.');
    } finally {
      if (token.current === attempt) setBusy(false);
    }
  }

  return <details className="panel remote-panel">
    <summary>Connexion privée à MUE · {model || 'à établir'}</summary>
    <p>Les répliques générées utilisent le modèle de ton tailnet. La question, la pièce et les derniers échanges lui sont transmis. La clé reste en mémoire et doit être ressaisie après fermeture.</p>
    <fieldset disabled={disabled || busy}>
      <label><span>Adresse HTTPS Tailscale Serve</span>
        <input type="url" placeholder="https://mue.mon-tailnet.ts.net" autoComplete="off" spellCheck={false}
          value={url} onChange={e => { forgetModel(); setUrl(e.target.value); }} />
      </label>
      <label><span>Clé du routeur, si requise</span>
        <input type="password" autoComplete="off" spellCheck={false}
          value={key} onChange={e => { forgetModel(); setKey(e.target.value); }} />
      </label>
      <button type="button" className="secondary-action" disabled={!url.trim()} onClick={() => void connect(false)}>Lire les modèles de MUE</button>
      {model && <>
        <label><span>Modèle des délégués</span>
          <select value={model} onChange={e => { setModel(e.target.value); onChange({ origin: url, apiKey: key, model: e.target.value }); }}>
            {models.map(id => <option key={id}>{id}</option>)}
          </select>
        </label>
        <button type="button" className="secondary-action" onClick={() => void connect(true)}>Tester une réplique</button>
        <button type="button" className="text-action" onClick={() => { forgetModel(); setKey(''); setStatus('MUE déconnecté.'); }}>Déconnecter MUE</button>
      </>}
    </fieldset>
    {status && <p role="status" className="notice">{status}</p>}
  </details>;
}

export default CouncilConnection;
