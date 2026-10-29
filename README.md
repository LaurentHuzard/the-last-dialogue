# The Last Dialogue · Les Archives du Présent

An experimental negotiation game set across two times: **real research in 2026** becomes **debated archives in fictional 2235**. You play a human delegate negotiating the future of an ancient forest with three other delegates. The first vertical slice includes an entirely offline-inference/scripted mode and an optional LLM-assisted mode.

> **Prototype, not production-ready:** session storage is temporary and in-memory. There are no accounts or authorization and submitted archives have not been independently verified. Do not expose the backend publicly or enter personal/private data.

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
