# Les Échos du Vivant · Android → MUE

L'application Android contient le moteur de jeu
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
`~/.config/mue/llama-api-key`. Vérifie les alias réellement disponibles :

~~~bash
curl -fsS \
  -H "Authorization: Bearer $(cat ~/.config/mue/llama-api-key)" \
  http://127.0.0.1:8003/v1/models
~~~

L'application propose la liste retournée par `/v1/models`, en préférant
`gemma4-32k` s'il existe, puis `qwen35-9b`, ou le premier modèle.
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
Lors de la reconnaissance, 443 et 8443 servaient déjà d’autres applications. L’exemple suivant concerne uniquement un port 8443 confirmé libre sur ton installation. Toute modification des routes relève de l’opérateur.

~~~bash
tailscale serve --bg --https=8443 8003
tailscale serve status
~~~

Dans ce cas, saisis l'URL HTTPS avec `:8443` dans l'application.
Tailscale **Serve** partage au sein du tailnet : **ne jamais utiliser
Funnel** pour publier le routeur llama.cpp sur Internet.

Aucune commande de ce document n'est exécutée automatiquement sur MUE.

## 3. Vérifier CORS pour la WebView

L'origine de l'APK est
`https://appassets.androidplatform.net`, et les appels sont des
requêtes HTTPS cross-origin avec `Authorization: Bearer ...`.
Le serveur llama.cpp actuel fournit les options `--cors-origins` et
`--cors-headers` (variables `LLAMA_ARG_CORS_ORIGINS` et
`LLAMA_ARG_CORS_HEADERS`). Si la WebView signale une erreur CORS,
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

## Jouer sur le téléphone

1. Installer l’APK de la PR. Ouvrir une séance scénarisée en mode avion. Déposer le carnet de lisière, négocier un détour et le soumettre au vote. Fermer puis rouvrir l’application et relire l’épilogue.
2. Quitter le mode avion et rejoindre le tailnet de MUE. Dans une nouvelle séance, renseigner l’origine HTTPS Serve, la clé si nécessaire et choisir un modèle dans la liste. Tester une génération. La découverte des alias seule mesure uniquement la disponibilité de `/v1/models`.
3. Choisir les voix MUE et ouvrir la séance. Vérifier l’étiquette de chaque réplique et compter les appels dans les diagnostics du conseil. Couper Tailscale avant le dépôt de la pièce. Le conseil doit conserver la pièce et les deux répliques de retour restent lisibles en version scénarisée.
4. Fermer complètement l’application. À la reprise, le joueur retrouve la séance ; la connexion demande à nouveau sa clé. Choisir de se reconnecter ou voter avec les voix scénarisées. Vérifier qu’une délibération passée ne redémarre pas.

Consigner le modèle, l'étape, le statut, le nombre d'appels et les durées. Distinguer l’APK sur téléphone, le navigateur et une requête directe au fournisseur. Ne joindre ni en-têtes HTTP, ni saisie personnelle.

## Contrat de narration

L’entrée dans la salle déclenche Sélène puis Ivo. La réception d’une pièce déclenche Ada puis Ivo. Chaque événement fournit immédiatement ses deux répliques écrites. En mode connecté, MUE reçoit une sélection des événements, l’extrait de la pièce, sa réserve, l’engagement consigné et la réplique précédente pour la seconde voix. Il renvoie un objet JSON avec un unique champ de prose `line`. Le moteur n’accepte aucune intention de mutation dans ce protocole.

Les limites de transport figurent dans [le connecteur](../frontend/lib/tailscale-backend.ts). Une génération peut occuper le client à la fois, y compris le test manuel ou une question libre. Le connecteur annule le transport lorsque son délai expire. Une annulation côté client ne mesure pas le moment où llama.cpp libère ses ressources.

| Usage | Appels maximum | Délai | Plafond de sortie demandé |
| --- | --- | --- | --- |
| Une délibération | 2, une tentative par voix | 18 s par appel, 30 s au total | 768 tokens par appel |
| Deux délibérations | 4 | 60 s au total | 3 072 tokens |
| Questions libres volontaires | 3 | 18 s par question | 2 304 tokens au total |
| Test manuel du connecteur | 1 par clic, hors partie | 18 s | 768 tokens |

Pour une séance, le maximum automatique est donc de quatre appels. Avec les trois questions volontaires, le plafond est de sept appels, 114 secondes d’attente cumulée et 5 376 tokens de sortie demandés. Ces plafonds ne mesurent pas la consommation effective. Les répliques du jeu et les questions libres ont une limite de 500 caractères. Les diagnostics mémorisent pour chaque intervention son statut, le nombre d’appels envoyés et le temps écoulé. Avant l’envoi, le jeu confirme en stockage durable le créneau de la voix ou la question du joueur. Un arrêt forcé pendant l’appel conserve ce créneau et les répliques déjà confirmées. Le compteur d’envois peut être incomplet pour une intervention interrompue, et sa durée finale est inconnue.

Les créneaux narratifs sont réservés avant le premier appel. Une reprise ne les relance pas. Après annulation, délai ou réponse invalide, la voix scénarisée accompagne la pièce déjà enregistrée. L’identité de séance et sa révision sont vérifiées avant d’appliquer une réponse. Les répliques et questions occupent un carnet local distinct des événements qui calculent le vote.

La clé reste en mémoire et doit être ressaisie après redémarrage. Les archives et textes résident dans le stockage privé de la WebView, sans chiffrement supplémentaire. Le mode MUE transmet uniquement les extraits utiles au routeur privé. La WebView n’ouvre pas de pont JavaScript natif. Le test automatisé utilise un transport simulé ; seul le parcours sur téléphone permet de confirmer le trajet Android → HTTPS Serve → modèle.


### Mesure auprès du fournisseur

Le 25 novembre 2026, quatre appels de séance avec une pièce fictive ont atteint le modèle actif `gemma4_e4b` via un tunnel SSH temporaire. La requête à 180 tokens avec grammaire JSON forcée a donné quatre replis. Le modèle pouvait épuiser son budget avant le premier caractère visible. Avec validation JSON côté client et un plafond de 768 tokens incluant le raisonnement, trois répliques ont été acceptées (0,83 s, 0,71 s et 7,99 s). La quatrième, tronquée à 9,63 s, a déclenché la réplique de secours. Aucune reprise automatique. Les réponses visibles restent bornées à 500 caractères.

### Essai matériel du 25 novembre 2026

Un Samsung Galaxy sous Android 17 (WebView 157) a joué la séance sur son propre moteur TypeScript. Le jeu déjà installé portait une autre signature. Une variante de test a donc utilisé un identifiant Android distinct, le code natif de la révision `6424317` et les 47 ressources embarquées de l’APK de CI, identiques octet pour octet. L’USB pilotait l’écran. Les requêtes du jeu sortaient du téléphone par HTTPS sur le tailnet.

- La WebView a démarré avec son accès réseau coupé et a adopté le corridor alternatif par 4 voix sur 4.
- Sur une route Serve privée temporaire vers llama.cpp, la WebView a découvert `gemma4_e4b`, affiché une génération de test et obtenu les deux interventions d’ouverture en 1,06 s et 0,91 s. La clé saisie était absente des valeurs du stockage local vérifiées après l’échange.
- Après retrait de cette route pendant la partie, les deux tentatives de retour ont reçu un refus de connexion. Le jeu a utilisé ses deux répliques de scénario. Après fermeture et relance, la pièce était consultable et le jeu proposait la reconnexion. Les deux routes Serve préexistantes ont été revérifiées.

Sur cette première révision, un second arrêt forcé aussitôt après l’affichage du verdict a laissé le registre au stade du dépôt. Le correctif attend la fin de la transaction IndexedDB en durabilité stricte avant d’afficher un verdict. Sur le même Galaxy, la partie interrompue au dépôt a repris, puis le test a forcé l’arrêt dès l’apparition du nouveau verdict. Au redémarrage, le carnet de lisière, les quatre bulletins et l’adoption à 4/4 étaient relisibles.

Pour reproduire ce contrôle, fermer le processus de l’application de test dès que le verdict apparaît, relancer la même installation et relire la pièce, les quatre bulletins et l’épilogue.

Les commandes ADB utilisées pour simuler une fermeture brutale portent uniquement sur le paquet de test. Dans cette installation à part, le nom de l’activité Java reste celui du jeu.

~~~sh
adb -d shell am force-stop tv.octomue.thelastdialogue.smoke6424317
adb -d shell am start -W -n tv.octomue.thelastdialogue.smoke6424317/tv.octomue.thelastdialogue.MainActivity
~~~
