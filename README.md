# The Last Dialogue · Les Échos du Vivant

En 2235, le courant manque au dispensaire. Pour l’y amener, un corridor doit traverser une forêt ancienne. Sélène et Ivo s’interpellent. Ada te confie le dossier. À toi de rapporter une pièce de 2026 ou d’ouvrir le carnet fictif disponible sur l’appareil, puis de défendre un tracé devant quatre votants.

## Jouer

| Entrée | Règles et sauvegarde | Voix générées, facultatives |
| --- | --- | --- |
| APK Android, écran d’accueil | Campagne solo TypeScript embarquée. Dossier et procès-verbal en stockage privé WebView. Hors ligne dès l’installation. | Android contacte directement llama.cpp sur MUE via HTTPS Tailscale Serve. Clé en mémoire. |
| Navigateur, `/assemblee/` | Même campagne et même moteur. Stockage local lié à l’origine du site. | Même connecteur, si cette origine est admise par le routeur privé. |
| Navigateur, `/` | Prototype V1 indépendant. FastAPI conserve les sessions dans la mémoire de son processus. | Narrateur Python facultatif. Le mode scénarisé fonctionne sans clé. |

Pour jouer immédiatement sur une machine de développement (Node 22+) :

~~~sh
cd frontend
npm ci
npm run dev
~~~

Ouvrir [la première Assemblée](http://localhost:3000/assemblee/). Pour le prototype V1, démarrer également FastAPI dans un autre terminal.

~~~sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8080
~~~

Le prototype à [l’accueil web](http://localhost:3000/) utilise `NEXT_PUBLIC_API_URL` (par défaut `http://localhost:8080`). Avec Docker, `docker compose up --build` construit les deux services. Pour activer son narrateur, la configuration optionnelle `OPENAI_API_KEY` appartient au serveur Python. La campagne locale fonctionne entièrement sans compte ni service payant.

## Démo et validation

Pour le chemin de démo, choisir les voix scénarisées et le carnet de lisière. Verser la pièce avec réserve, négocier le corridor alternatif et le soutenir. Les quatre bulletins et le coût pour les ateliers sont relisibles après fermeture. Les autres chemins, les origines et les prochaines missions figurent dans le [contrat de séance](docs/vision-v1.md).

~~~sh
cd backend
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python -m compileall -q .
cd ../frontend
npm ci
node --experimental-strip-types --test tests/*.test.mjs
npm run lint
npm run build
ANDROID_BUILD=1 NEXT_PUBLIC_ANDROID_BUILD=1 npm run build
~~~

Les cas communs dans `fixtures/council-votes.json` exercent les seuils de vote V1 des deux moteurs. La nouvelle séquence d’enquête et de contre-lecture appartient à la campagne locale. L’ancienne partie Android migre dans un registre consultable qui préserve ses pièces, échanges et verdict éventuel. Une V1 en cours ouvre la nouvelle enquête avec son historique. Une sauvegarde illisible déclenche une récupération explicite. Les sources et observations restent déclaratives.

La CI valide les règles, le transport simulé, les routes Python, le lint et le build web. Le workflow Android construit et inspecte l’APK debug. Pour l’export et le test sur appareil, consulter le [guide Android](android/README.md) et le [protocole MUE](docs/mue-tailscale.md).
