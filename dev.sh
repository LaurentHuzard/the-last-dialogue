#!/usr/bin/env bash
set -euo pipefail
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
(
    cd backend
    if [ ! -d venv ]; then python3 -m venv venv; fi
    source venv/bin/activate
    pip install -r requirements.txt
    uvicorn server:app --reload --host 0.0.0.0 --port 8080
) &
(
    cd frontend
    if [ ! -d node_modules ]; then npm ci; fi
    NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
) &
wait
