# Android v0.2.0 : jeu hors ligne + agents sur MUE

L'application est une WebView Android emballant le frontend Next.js exporté
en fichiers statiques. Les règles et les archives résident localement dans
la WebView. Le mode **Agents LLM** parle maintenant **directement** à
llama.cpp sur MUE via une adresse HTTPS Tailscale Serve : **pas de FastAPI
pour la version Android**.

## Télécharger une build

Sur la [PR #1](https://github.com/LaurentHuzard/the-last-dialogue/pull/1),
ouvre le dernier workflow **Android debug APK** réussi et télécharge
l'artifact \`the-last-dialogue-android-debug\`. Après extraction du ZIP,
installe \`app-debug.apk\`. Les clés de signature debug peuvent changer
entre les builds : si Android refuse une mise à jour pour problème de
signature, il faudra désinstaller l'ancien build, ce qui efface les
parties sauvegardées localement.

## Jeu avec ou sans MUE

- **Sans LLM** : entièrement local, sans connexion, sans requête réseau
  générée par le jeu. Missions prédéfinies et règles déterministes.
- **Agents LLM** : URL Tailscale HTTPS + clé API llama.cpp en mémoire +
  alias de modèle choisi dans la liste \`/v1/models\`. Sélène propose
  une mission, Ada réagit à une archive, Ivo réagit à une négociation,
  et le joueur peut envoyer une question libre à l'un des trois.
- Les personnages n'ont pas accès aux outils de MUE, n'effectuent
  pas de recherches web et ne contrôlent pas les votes du jeu.
- Les sources externes sont ouvertes dans le navigateur système.
  Aucune géolocalisation, caméra ou permission d'accès aux fichiers.

**Guide :** [Connecter directement Android à MUE](../docs/mue-tailscale.md).

## Compiler en local

Node.js 22+, Java 17, Android SDK 35, Android build-tools 35, Gradle 8.10.2 :

~~~bash
cd frontend
npm ci
node --experimental-strip-types --test tests/*.test.mjs
ANDROID_BUILD=1 NEXT_PUBLIC_ANDROID_BUILD=1 NEXT_PUBLIC_API_URL= npm run build
cd ..
mkdir -p android/app/src/main/assets
cp -a frontend/out/. android/app/src/main/assets/
cd android
gradle --no-daemon :app:assembleDebug
cd ..
python3 android/scripts/verify_apk_assets.py android/app/build/outputs/apk/debug/app-debug.apk
~~~

Le fichier produit est \`android/app/build/outputs/apk/debug/app-debug.apk\`.

## Confidentialité et limites

L'URL Tailscale est sauvée dans localStorage. La clé est stockée dans le
state React de la session courante et n'est pas sérialisée. Les messages et
archives sont enregistrés dans le stockage privé WebView, sans chiffrage
supplémentaire. Ne pas exposer le routeur avec Tailscale Funnel ni partager
la clé MUE publiquement. Un appareil compromis peut compromettre une clé
saisie dans l'application ; prévoir sa rotation si nécessaire.
