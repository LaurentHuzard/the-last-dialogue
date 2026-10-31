# The Last Dialogue — Android debug build

This is a **small Android WebView shell**, not a hosted website shortcut. The GitHub Actions job builds a Next.js **static export**, embeds the compiled frontend into the APK, then compiles the Java/Gradle Android project. A local TypeScript rules engine handles the same scripted scenario as the backend; the Android package needs **no server or network to play**.

## Get the APK from pull request #1

Open the **Android debug APK** workflow run attached to the PR, then under **Artifacts** download `the-last-dialogue-android-debug`. The automated PR comment links directly to the artifact once the job succeeds. Extract the ZIP and install `app-debug.apk` on your Android phone. This debug APK is not Play Store signed. Since GitHub Actions uses an ephemeral debug keystore, uninstall an earlier APK when you get a signature mismatch while upgrading.

## Build locally

Requires Node 22+, npm, Java 17, Android SDK platform 35, Android build-tools 35 and Gradle 8.10.2.

```bash
cd frontend
npm ci
ANDROID_BUILD=1 NEXT_PUBLIC_ANDROID_BUILD=1 NEXT_PUBLIC_API_URL= npm run build
cd ..
mkdir -p android/app/src/main/assets
cp -a frontend/out/. android/app/src/main/assets/
cd android
gradle :app:assembleDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. Run `python3 android/scripts/verify_apk_assets.py android/app/build/outputs/apk/debug/app-debug.apk` to assert that the WebView entry page and its root-relative JS/CSS resources are all loadable. `WebViewAssetLoader` maps `/index.html` to `assets/index.html` in the APK; never copy the static export under `assets/www/`.

## Modes and privacy

- **Scripted offline**: Fully functional on device, including local archive submission, negotiations, and final vote. Sessions persist to private WebView localStorage and can resume after restarting the app. Deleting the app's storage clears them.
- **LLM via MUE/Tailscale**: On the welcome screen, enter the HTTPS Tailscale Serve URL of the FastAPI backend running on MUE and tap **Tester et enregistrer**. Select **Agents LLM** for remote delegates. The APK embeds no key or server hostname; without a configured URL, LLM selection falls back to local scripted mode with a clear warning.
- **Scripted mode stays local** even when MUE is configured. In LLM mode, player archives and choices are sent through Tailscale to the remote FastAPI process.
- **Real-world sources**: OpenAlex, INPN and player-supplied URLs open in the system browser. An entered URL is not source verification. No camera, GPS, notifications or account permissions.
- **Security**: Static assets are served through AndroidX WebViewAssetLoader's local HTTPS origin. File/content access and mixed content are disabled; there is no JavaScript bridge. This is a test build, not a production release.

## Next steps

Secure user accounts and remote sessions before exposing a backend, add configurable verified HTTPS backend selection for the LLM mode, replace debug signing with a stable key for upgradeable releases, and validate gameplay and layout on physical Android devices.

## MUE connection

See [MUE / Tailscale installation](../docs/mue-tailscale.md) for the router key, backend environment, Tailscale Serve setup and Android UI configuration.
