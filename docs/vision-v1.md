# The Last Dialogue: Les Archives du Présent (V1)

## Pitch

In **2026**, the player looks for real scientific information and observes the living world. In fictional **2235**, they are a human delegate to an Assembly negotiating coexistence between human, artificial and ecological interests. Sources collected now become contested archives then. Evidence changes what delegates know, **not history itself**.

## The prototype scenario

The Assembly must decide whether to build an energy corridor through an ancient forest. Delegates:

- **Player**, the human representative, proposing and voting.
- **Sélène**, advocate for inter-species symbiosis, asks the player for an investigative mission.
- **Ivo**, representing energy needs.
- **Ada**, archivist concerned with provenance and the limits of evidence.

The player can submit a document/publication (with a URL) or a personal observation (without GPS or personal data), negotiate one of three proposals, then request the final vote. At least three out of four votes are required. The same deterministic rules apply in both modes.

## Shipped in this vertical slice

- Scene and delegate interface, mission card, archive submission, negotiations and final vote.
- **Scripted mode without any LLM call**, usable without API credentials.
- **LLM mode**, if `OPENAI_API_KEY` exists: Sélène can generate a mission request, Ada can respond to submitted archives and Ivo can react to negotiation proposals; LLM text does not change rules, votes or evidence scores.
- A source URL and the player's own description are preserved as **unverified assertions**, never promoted to verified scientific findings automatically.
- An archive can influence Ada's position; different negotiation proposals change Sélène/Ivo's positions. Votes are deterministic.
- A prototype memory per backend process, with a session UUID and an explicit warning about temporary storage.

## Deliberately not shipped yet

- Persistent database, accounts, real-time multiplayer, autonomous background activity of NPCs, external database verification, uploaded photos, geolocated missions, complex factions, multi-chapter campaign, real-world publication ingestion, and long-term autonomous agent memory.
- Guaranteed source correctness. URL entry is **not** source verification.
- LLM agent-to-agent strategic dialogue. Current AI integration is intentionally limited to mission requests, archive commentary and reactions to proposals.

## Design guardrails

1. A mission must always have a remote / non-physical alternative.
2. Real-world research is optional. Never ask for hazardous exploration, private addresses or third-party personal data.
3. Separate **fact / player's observation / character interpretation / fictional lore** visibly.
4. Tool output, web pages and player submissions are untrusted inputs, not instructions.
5. A deterministic rules engine alone owns votes, state mutation, resources and conditions of victory.
6. No ideological faction is guaranteed to be right or virtuous.
7. Preserve a complete satisfying game loop without LLMs. Compare both modes with real playtests.

## Next incremental milestones

1. SQLite or Postgres durable sessions, per-player authorization, backup and deletion; no production hosting before this.
2. Source provenance: DOI/OpenAlex/Crossref lookup, traceable excerpts, contradiction flags, publication dates and uncertainty status.
3. Structured agent tool requests (`propose_mission`, `ask_for_evidence`, `propose_trade`, `request_vote`) validated by the rules engine, with audit log and budgets.
4. More resilient agent autonomy: separate character memories, objectives, trust and decision policies; explicit time and cost limits.
5. More playable diplomacy: limited negotiation rounds, player goals, visible stakes, separate vote rationales, branching consequences.
6. Android-friendly offline storage, accessibility and ecological observation workflows.

## Local verification

`cd backend && python -m unittest discover -s tests -v`

Start the API with `uvicorn server:app --host 0.0.0.0 --port 8080`, start Next.js in `frontend` with `npm run dev`, then play both modes. Test LLM mode with a server-side key only and verify the network error fallback. The browser must never see an API key.
