# The Last Dialogue sur MUE via Tailscale

L'APK Android v0.1.3 propose une connexion HTTPS facultative vers un backend
FastAPI sur MUE. Les parties sans LLM continuent à fonctionner hors ligne.

Architecture : Android (WebView) → Tailscale Serve HTTPS → FastAPI (8080) →
llama.cpp MUE (8003, /v1).

## 1. Vérifier le routeur MUE

Sur MUE, le routeur llama.cpp est généralement sur 127.0.0.1:8003.
Sa clé est stockée dans ~/.config/mue/llama-api-key.

~~~bash
curl -fsS \
  -H "Authorization: Bearer $(cat ~/.config/mue/llama-api-key)" \
  http://127.0.0.1:8003/v1/models
~~~

Vérifier la liste d'alias avant de sélectionner un modèle. Pour commencer,
qwen35-9b est un candidat, à comparer ensuite avec neohorse9b ou gemma4-32k.

## 2. Démarrer FastAPI sur MUE

~~~bash
git clone -b feat/archives-du-present-v1 \
  https://github.com/LaurentHuzard/the-last-dialogue.git
cd the-last-dialogue/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export OPENAI_API_BASE=http://127.0.0.1:8003/v1
export OPENAI_API_KEY="$(cat ~/.config/mue/llama-api-key)"
export THE_LAST_DIALOGUE_MODEL=qwen35-9b
export THE_LAST_DIALOGUE_LLM_TIMEOUT=120
export CORS_ORIGINS=https://appassets.androidplatform.net

# Clé distincte de celle de MUE : autorise uniquement l'accès au jeu.
mkdir -p ~/.config/the-last-dialogue
chmod 700 ~/.config/the-last-dialogue
python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > ~/.config/the-last-dialogue/game-token
chmod 600 ~/.config/the-last-dialogue/game-token
export THE_LAST_DIALOGUE_ACCESS_TOKEN="$(cat ~/.config/the-last-dialogue/game-token)"

uvicorn server:app --host 127.0.0.1 --port 8080
~~~

Ce backend ne doit pas être exposé sur Internet. Il stocke actuellement
les sessions en RAM. Son authentification est un jeton partagé facultatif
`THE_LAST_DIALOGUE_ACCESS_TOKEN`, nécessaire dans cette configuration.
La clé n'est jamais committée ni incluse dans l'APK. Les ACL Tailscale
constituent une protection supplémentaire.

Test local (avec jeton) :

~~~bash
curl -fsS -H "Authorization: Bearer $(cat ~/.config/the-last-dialogue/game-token)" \
  http://127.0.0.1:8080/api/capabilities
~~~

Une requête sans jeton doit retourner HTTP 401.
`/health` reste ouvert aux contrôles locaux.

Le champ llm_configured signifie que les variables sont présentes, pas que
le routeur MUE a réussi à produire une inférence.

## 3. Tailscale Serve (pas Funnel)

Dans un autre terminal sur MUE :

~~~bash
tailscale serve --bg 8080
tailscale serve status
~~~

Lire l'URL HTTPS retournée, par exemple
https://mue.exemple-tailnet.ts.net (adresse fictive).

Si HTTPS 443 est déjà pris par une autre configuration Serve, utiliser un
autre port HTTPS avec les options du Tailscale installé, ou adapter la
configuration existante sans interrompre ses services.

Sur le téléphone Android, activer Tailscale, rejoindre le même tailnet,
puis ouvrir l'URL HTTPS suivie de /api/capabilities dans le navigateur.
La réponse doit mentionner app: the-last-dialogue.

## 4. Dans la nouvelle APK

Depuis l'écran d'accueil :

1. Entrer l'URL **HTTPS** affichée par Tailscale Serve (par exemple
   `https://mue.montailnet.ts.net`, sans `:8003`).
2. Coller le contenu de `~/.config/the-last-dialogue/game-token` dans
   **Clé API d'accès au jeu**. **Ne pas saisir la clé llama.cpp**.
3. Appuyer sur Tester et enregistrer.
4. Choisir Agents LLM pour lancer une partie distante utilisant MUE.
5. Choisir Sans LLM pour continuer à jouer localement, sans réseau.

L'adresse est mémorisée uniquement sur le téléphone, jamais dans Git.
Le jeton de jeu est conservé **uniquement en mémoire dans l'interface Android** :
il faut le ressaisir après fermeture de l'application ; aucun stockage
persistant n'est activé pour les secrets.
Les parties LLM envoient archives et choix à FastAPI sur MUE ; les parties
scénarisées conservent leurs archives dans le stockage privé du téléphone.

## Sécurité et limitations

- L'APK accepte uniquement des URL HTTPS dont l'hôte se termine en .ts.net,
  et vérifie la signature de l'API du jeu. Tailscale doit être connecté.
- L'APK n'embarque aucune clé API. Le champ de clé sert à authentifier
  FastAPI (`THE_LAST_DIALOGUE_ACCESS_TOKEN`) et ne donne pas accès direct
  à llama.cpp ; `OPENAI_API_KEY` reste sur MUE.
- CORS_ORIGINS doit autoriser précisément
  https://appassets.androidplatform.net (origine de la WebView).
- FastAPI propose une clé API de jeu facultative (Bearer) mais n'a pas
  de comptes ni de persistance. Configurer obligatoirement la clé pour
  ce mode, et limiter les clients autorisés avec les ACL Tailscale.
  Ne jamais utiliser Funnel ou exposer FastAPI sur Internet.
- Le mode LLM génère actuellement des missions et des réactions narratives,
  pas des agents complètement autonomes. Les règles et votes sont calculés
  par le moteur déterministe.
- Si MUE s'arrête, une partie LLM distante n'est plus disponible et peut
  être perdue au redémarrage du backend ; commencer une partie scénarisée
  permet de jouer sans attendre.
- Le premier appel LLM peut être lent au chargement d'un modèle ;
  timeout par défaut de 120 secondes, configurable.
- Le bon fonctionnement de l'inférence sur MUE doit être vérifié par
  un test réel du joueur, la CI ne pouvant pas joindre son tailnet privé.

## Diagnostic

- `http://mue.<tailnet>.ts.net:8003` pointe vers le routeur llama.cpp.
  Il utilise HTTP et ne sert pas `/api/capabilities` : **ne pas
  l'entrer dans le champ Android**.
- Dans un terminal sur MUE : `tailscale serve status`. Vérifier que
  le proxy HTTPS mène bien à `http://127.0.0.1:8080`.
- Tester `https://mue.<tailnet>.ts.net/health` dans le navigateur Android
  avec Tailscale actif. Ce chemin ne nécessite pas de jeton.
- Le bouton **Tester et enregistrer** doit ensuite renvoyer le modèle
  configuré, ou **Clé API du jeu absente ou incorrecte** (HTTP 401).
- La configuration du jeton dans `THE_LAST_DIALOGUE_ACCESS_TOKEN` est
  totalement indépendante de la clé du routeur MUE `OPENAI_API_KEY`.
