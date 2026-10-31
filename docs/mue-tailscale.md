# The Last Dialogue sur MUE via Tailscale

L'APK Android v0.1.2 propose une connexion HTTPS facultative vers un backend
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

uvicorn server:app --host 127.0.0.1 --port 8080
~~~

Ce backend ne doit pas être exposé sur Internet. Il stocke actuellement
les sessions en RAM et n'a pas encore d'authentification applicative.

Test local : curl -fsS http://127.0.0.1:8080/api/capabilities

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

1. Entrer l'URL affichée par Tailscale Serve dans CERVEAU DISTANT / MUE.
2. Appuyer sur Tester et enregistrer.
3. Choisir Agents LLM pour lancer une nouvelle partie distante sur MUE.
4. Choisir Sans LLM pour continuer à jouer localement, sans réseau.

L'adresse est mémorisée uniquement sur le téléphone, jamais dans Git.
Les parties LLM envoient archives et choix à FastAPI sur MUE ; les parties
scénarisées conservent leurs archives dans le stockage privé du téléphone.

## Sécurité et limitations

- L'APK accepte uniquement des URL HTTPS dont l'hôte se termine en .ts.net,
  et vérifie la signature de l'API du jeu. Tailscale doit être connecté.
- L'APK ne contient aucune clé API ; le secret du routeur reste sur MUE.
- CORS_ORIGINS doit autoriser précisément
  https://appassets.androidplatform.net (origine de la WebView).
- FastAPI n'a aucune authentification ni persistance dans cette V1 :
  utiliser les ACL Tailscale pour restreindre les clients autorisés,
  ne pas utiliser Funnel et ne pas exposer le port 8080 sur Internet.
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
