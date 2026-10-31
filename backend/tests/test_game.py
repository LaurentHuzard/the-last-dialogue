"""Run with: cd backend && python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game import GameRuleError, create_session, negotiate, submit_archive, vote


class RulesTests(unittest.TestCase):
    def test_without_llm_is_playable(self):
        state = create_session("scripted")
        self.assertEqual(state.effective_mode, "scripted")
        self.assertEqual(state.phase, "investigation")
        negotiate(state, "compromise")
        self.assertEqual(state.positions["ivo"], -1)
        self.assertEqual(state.phase, "negotiation")
        self.assertIn("Accord adopté", vote(state, "compromise"))

    def test_llm_fallback_without_key(self):
        state = create_session("llm", llm_available=False)
        self.assertEqual(state.effective_mode, "scripted")
        self.assertIsNotNone(state.warning)

    def test_sources_are_unverified(self):
        state = create_session()
        archive = submit_archive(state, kind="publication", title="Étude sur les forêts", description="Description informative de la source consultée.", source_url="https://example.org/paper")
        self.assertEqual(archive.provenance, "player-submitted; unverified")
        self.assertEqual(state.influence, 1)
        self.assertEqual(state.positions["ada"], 1)

    def test_publication_requires_a_link(self):
        state = create_session()
        with self.assertRaises(GameRuleError):
            submit_archive(state, kind="publication", title="Une étude", description="Une description suffisamment détaillée.")

    def test_rejects_malformed_url(self):
        state = create_session()
        with self.assertRaises(GameRuleError):
            submit_archive(state, kind="publication", title="Une étude", description="Une description suffisamment détaillée.", source_url="file:///etc/passwd")

    def test_vote_is_final(self):
        state = create_session()
        self.assertIn("Accord rejeté", vote(state, "construction"))
        with self.assertRaises(GameRuleError):
            vote(state, "compromise")
        with self.assertRaises(GameRuleError):
            negotiate(state, "compromise")

    def test_cap_archives_and_influence(self):
        state = create_session()
        for n in range(12):
            submit_archive(state, kind="observation", title=f"Observation {n}", description="Observations sans localisation personnelle.")
        self.assertEqual(state.influence, 5)
        with self.assertRaises(GameRuleError):
            submit_archive(state, kind="observation", title="Observation 13", description="Observations sans localisation personnelle.")


if __name__ == "__main__":
    unittest.main()
