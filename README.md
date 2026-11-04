# The Last Dialogue · Les Archives du Présent

An experimental negotiation game set across two times: **real research in 2026** becomes **debated archives in fictional 2235**. You play a human delegate negotiating the future of an ancient forest with three other delegates. The first vertical slice includes an entirely offline-inference/scripted mode and an optional LLM-assisted mode.

> **Prototype, not production-ready:** The optional web/FastAPI backend stores sessions in memory and has no user accounts (it supports a shared Bearer key, which is not a substitute for account authorization). Android stores its sessions locally. Submitted archives are not scientifically verified. Do not expose the backend or router publicly or enter private data.

## Start locally

Requirements: Python 3.11+, Node.js 20+, npm.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8080 --reload
```

In another terminal:

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

Open http://localhost:3000 and select a game mode.

### Optional LLM mode

Set `OPENAI_API_KEY` **on the backend only** to enable Sélène's dynamically generated research mission and Ada's comments. `THE_LAST_DIALOGUE_MODEL` defaults to `gpt-4o-mini`. Without a key, selecting LLM mode explicitly falls back to scripted mode with a visible warning. Never put the key in a `NEXT_PUBLIC_` variable.

### Docker Compose

```bash
docker compose up --build
```

For Docker deployments use backend-only API keys via an environment file or a secret store, and set `CORS_ORIGINS` to the allowed browser origin(s). `NEXT_PUBLIC_API_URL` is compiled into the Next.js client at **build time**: set the Docker build argument for the browser-visible API URL, not just a runtime environment variable. The example Compose file is intended for local evaluation only.

## Validate

```bash
cd backend
pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python -m compileall -q .
```

The prototype includes rules-engine unit tests and FastAPI route smoke tests. Next.js lint/build, deployment tests and UI playtesting still need to be run in a fully provisioned environment.

See [design scope and next steps](docs/vision-v1.md).

## Android APK (prototype)

Pull requests now build a debug APK using `.github/workflows/android-apk.yml`. Download the `the-last-dialogue-android-debug` artifact from the linked GitHub Actions run, or follow its link in the PR discussion. **Android v0.2.0 / direct MUE:** the bundled rules engine and archives run entirely on-device. The optional **Agents LLM** mode connects directly to MUE's OpenAI-compatible **llama-server** via HTTPS **Tailscale Serve**, using the user's locally entered router API key and chosen model. No FastAPI process is required on Android. Sélène can propose research missions, Ada/Ivo comment on choices, and players can question each delegate. Without MUE, the scripted mode is fully playable. See [Android build](android/README.md) and [direct Tailscale + MUE setup](docs/mue-tailscale.md).
