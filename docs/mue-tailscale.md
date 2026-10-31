# Android → MUE directement : llama-server avec Tailscale (v0.2.0)

**Architecture choisie : B.** L'application Android contient le moteur de jeu
déterministe et les règles de négociation. Les délégués LLM (Sélène, Ada et
Ivo) appellent directement l'API OpenAI-compatible de llama.cpp sur MUE.
**Aucun FastAPI, compte cloud, ni second serveur n'est requis pour jouer.**

    Android (règles, archives, UI)
          └── HTTPS via Tailscale Serve, clé du routeur en mémoire uniquement
                 └── MUE / llama-server :8003 /v1/chat/completions

La version web d'origine conserve son backend FastAPI indépendant pour le
prototype navigateur. Le mode sans LLM de l'APK n'effectue aucun appel réseau.

## 1. Vérifier MUE sur le PC

Le routeur existant utilise normalement le port 8003 et une clé dans
\`~/.config/mue/llama-api-key\`. Vérifie les alias réellement disponibles :

~~~bash
curl -fsS \
  -H "Authorization: Bearer $(cat ~/.config/mue/llama-api-key)" \
  http://127.0.0.1:8003/v1/models
~~~

L'application propose la liste retournée par \`/v1/models\`, en préférant
\`gemma4-32k\` s'il existe, puis \`qwen35-9b\`, ou le premier modèle.
Choisir uniquement un alias qui répond aux conversations.

La clé de MUE est une vraie clé d'inférence : n'ajoute jamais cette valeur
dans le dépôt, dans un argument d'URL ou dans une capture d'écran.

## 2. Exposer directement llama.cpp avec Tailscale Serve

Sur MUE, inspecte d'abord les services existants :

~~~bash
tailscale status
tailscale serve status
~~~

Si HTTPS 443 n'est pas déjà utilisé pour un autre service :

~~~bash
tailscale serve --bg 8003
tailscale serve status
~~~

Le second affichage doit indiquer un proxy du genre :

    https://mue.ton-tailnet.ts.net
       -> http://127.0.0.1:8003

**S'il existe déjà un serveur sur 443**, ne remplace pas sa configuration.
Tu peux utiliser un autre port HTTPS Serve, si disponible dans ta
configuration Tailscale :

~~~bash
tailscale serve --bg --https=8443 8003
tailscale serve status
~~~

Dans ce cas, saisis l'URL HTTPS avec \`:8443\` dans l'application.
Tailscale **Serve** partage au sein du tailnet : **ne jamais utiliser
Funnel** pour publier le routeur llama.cpp sur Internet.

Aucune commande de ce document n'est exécutée automatiquement sur MUE.

## 3. Vérifier CORS pour la WebView

L'origine de l'APK est
\`https://appassets.androidplatform.net\`, et les appels sont des
requêtes HTTPS cross-origin avec \`Authorization: Bearer ...\`.
Le serveur llama.cpp actuel fournit les options \`--cors-origins\` et
\`--cors-headers\` (variables \`LLAMA_ARG_CORS_ORIGINS\` et
\`LLAMA_ARG_CORS_HEADERS\`). Si la WebView signale une erreur CORS,
autorise explicitement l'origine Android dans la configuration effective
du routeur MUE :

    LLAMA_ARG_CORS_ORIGINS=https://appassets.androidplatform.net
    LLAMA_ARG_CORS_HEADERS=Authorization,Content-Type

Attention : pour conserver d'autres clients web de MUE, fusionne les
origines autorisées au lieu d'écraser leur configuration. Un changement
d'environnement nécessite de relancer le processus llama-server.

Teste le preflight depuis un terminal MUE :

~~~bash
curl -i -X OPTIONS http://127.0.0.1:8003/v1/chat/completions \
  -H "Origin: https://appassets.androidplatform.net" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
~~~

La réponse doit autoriser l'origine et les en-têtes demandés.
La configuration CORS ne remplace pas la clé d'API ni les ACL Tailscale.

## 4. Dans la nouvelle APK

1. Installer The Last Dialogue **v0.2.0-direct-mue**.
2. Activer Tailscale sur Android, connecté au même tailnet.
3. Renseigner l'adresse **HTTPS Serve** du routeur, par exemple
   \`https://mue.ton-tailnet.ts.net\`, **sans \`:8003\` ni \`/v1\`**.
4. Coller la clé issue de \`~/.config/mue/llama-api-key\` dans le champ
   **Clé API llama.cpp** (masqué et non persistant).
5. Appuyer sur **Tester /v1/models**, puis choisir le modèle dans la liste.
6. Sélectionner **Agents LLM** pour demander une mission à Sélène et
   dialoguer avec Sélène, Ivo et Ada ; ou **Sans LLM** pour une partie
   totalement hors ligne.

L'URL, non secrète, reste sauvegardée localement. Le secret **n'est
pas sauvegardé** et doit être ressaisi après un redémarrage de l'app.
Les archives et les règles demeurent sur le téléphone, y compris en mode LLM.
Seuls les extraits nécessaires aux prompts partent vers MUE.

## Limites connues de la V1

- Les délégués peuvent demander une mission, discuter et commenter les
  archives ou propositions. Leurs messages sont mémorisés dans la partie
  locale, mais ils ne peuvent ni changer les règles ni manipuler le vote.
- Les missions ne déclenchent pas encore de navigation web automatique.
  Une archive saisie par le joueur reste **non vérifiée**.
- Une partie en mode LLM peut continuer avec ses règles locales si MUE
  devient indisponible, mais la génération de réponses ne fonctionnera
  plus tant que la connexion est coupée.
- Ce prototype ne chiffre pas le stockage local des archives ; ne pas y
  saisir de secrets ni de localisation précise.
- Une clé routeur transmise au téléphone doit être protégée. La WebView
  n'a aucun pont JavaScript natif et les liens de recherche s'ouvrent
  dans le navigateur externe. Il reste conseillé de restreindre l'accès
  au tailnet par ACL et de ne pas activer les outils shell de llama-server.
- Les générations peuvent prendre du temps avec une RTX 2080 selon le
  modèle. Le délai de réponse maximal de l'APK est de 150 secondes.
- Les appels ne sont **pas encore testés sur ton vrai MUE depuis la CI** :
  l'automatisation utilise des simulations locales de l'API.
