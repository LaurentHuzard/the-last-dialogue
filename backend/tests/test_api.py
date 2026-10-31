"""HTTP smoke tests using the real FastAPI routes, no LLM credentials required."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from server import app, sessions


class ApiTests(unittest.TestCase):
    def setUp(self):
        sessions.clear()
        self.client = TestClient(app)

    def test_android_backend_capabilities_and_cors(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "local-test-key"}):
            response = self.client.get("/api/capabilities", headers={"Origin": "https://appassets.androidplatform.net"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["app"], "the-last-dialogue")
        self.assertTrue(response.json()["llm_configured"])
        self.assertEqual(response.headers.get("access-control-allow-origin"), "https://appassets.androidplatform.net")

    def test_end_to_end_scripted_mode(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            r = self.client.post("/api/sessions", json={"mode": "scripted"})
        self.assertEqual(r.status_code, 200)
        state = r.json()
        self.assertEqual(state["effective_mode"], "scripted")
        url = f"/api/sessions/{state['id']}"
        r = self.client.post(f"{url}/archives", json={
            "kind": "publication", "title": "Étude des pollinisateurs",
            "description": "Un résultat rapporté par un joueur, sans vérification automatique.",
            "source_url": "https://example.org/article"
        })
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["archives"][0]["provenance"], "player-submitted; unverified")
        self.assertEqual(self.client.post(f"{url}/proposals", json={"proposal": "compromise"}).status_code, 200)
        r = self.client.post(f"{url}/vote", json={"proposal": "compromise"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["phase"], "finished")
        self.assertIn("Accord adopté", r.json()["result"])
        self.assertEqual(self.client.get(url).json()["result"], r.json()["result"])

    def test_unknown_session_returns_404(self):
        self.assertEqual(self.client.get("/api/sessions/not-a-uuid").status_code, 404)

    def test_invalid_archive_returns_422(self):
        r = self.client.post("/api/sessions", json={"mode": "scripted"})
        url = f"/api/sessions/{r.json()['id']}/archives"
        self.assertEqual(self.client.post(url, json={"kind": "publication", "title": "Sans URL", "description": "Description assez longue pour être valide."}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
