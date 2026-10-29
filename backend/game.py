"""Deterministic prototype of the Last Dialogue negotiation.

No calls to AI or external sites are made from this module.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

Mode = Literal["scripted", "llm"]
EvidenceKind = Literal["publication", "observation"]
ActionName = Literal["archive", "negotiate", "vote"]


class GameRuleError(ValueError):
    pass


@dataclass
class Archive:
    id: str
    kind: EvidenceKind
    title: str
    description: str
    created_at: str
    source_url: str | None = None
    provenance: str = "player-submitted; unverified"


@dataclass
class Session:
    id: str
    mode: Mode
    effective_mode: Mode
    phase: Literal["investigation", "negotiation", "finished"] = "investigation"
    day: int = 1
    influence: int = 0
    archives: list[Archive] = field(default_factory=list)
    messages: list[dict[str, str]] = field(default_factory=list)
    positions: dict[str, int] = field(default_factory=lambda: {"selene": 2, "ivo": -2, "ada": 0})
    agreements: list[str] = field(default_factory=list)
    result: str | None = None
    mission: dict[str, str] = field(default_factory=lambda: {
        "agent": "selene",
        "title": "Les témoins du vivant",
        "request": "Retrouve une publication scientifique ou réalise une observation du vivant en 2026. Dépose une archive avec sa provenance pour que l'Assemblée puisse la discuter.",
    })
    warning: str | None = None

    def public(self) -> dict:
        return asdict(self)


def create_session(mode: Mode = "scripted", *, llm_available: bool = False) -> Session:
    if mode not in ("scripted", "llm"):
        raise GameRuleError("Mode inconnu")
    effective: Mode = "llm" if mode == "llm" and llm_available else "scripted"
    session = Session(id=str(uuid4()), mode=mode, effective_mode=effective)
    if mode == "llm" and effective == "scripted":
        session.warning = "Clé OPENAI_API_KEY absente : mode scénarisé activé, aucune IA appelée."
    session.messages.append({"speaker": "assembly", "text": "2235. L'Assemblée doit statuer sur un corridor énergétique traversant une forêt ancienne. Trois délégués attendent tes preuves et tes propositions."})
    session.messages.append({"speaker": "selene", "text": session.mission["request"]})
    return session


def _check_text(value: str, field_name: str, minimum: int = 1, maximum: int = 1500) -> str:
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise GameRuleError(f"{field_name} doit contenir entre {minimum} et {maximum} caractères")
    return value


def _valid_source_url(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    p = urlsplit(value)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password or len(value) > 2048:
        raise GameRuleError("URL de source invalide")
    return value


def submit_archive(session: Session, *, kind: EvidenceKind, title: str, description: str, source_url: str | None = None) -> Archive:
    if session.phase == "finished":
        raise GameRuleError("La négociation est terminée")
    if kind not in ("publication", "observation"):
        raise GameRuleError("Type d'archive inconnu")
    if len(session.archives) >= 12:
        raise GameRuleError("La limite de douze archives est atteinte")
    title = _check_text(title, "Titre", 5, 120)
    description = _check_text(description, "Description", 25, 1500)
    source_url = _valid_source_url(source_url)
    if kind == "publication" and not source_url:
        raise GameRuleError("Une publication doit comporter un lien vers sa source")
    archive = Archive(id=str(uuid4()), kind=kind, title=title, description=description, source_url=source_url,
                      created_at=datetime.now(timezone.utc).isoformat())
    session.archives.append(archive)
    session.influence = min(5, session.influence + 1)
    session.positions["ada"] = min(2, session.positions["ada"] + 1)
    session.messages.append({"speaker": "ada", "text": f"L'archive « {title} » entre au dossier. Sa provenance est déclarée, pas encore vérifiée. Elle ouvre une question, elle ne prouve pas à elle seule une thèse."})
    session.day += 1
    session.phase = "negotiation"
    return archive


PROPOSALS = {
    "sanctuary": "Protéger la forêt et suspendre le corridor énergétique.",
    "compromise": "Rechercher un tracé alternatif avec garanties écologiques.",
    "construction": "Autoriser le corridor avec mesures de réparation écologique.",
}


def negotiate(session: Session, proposal: str) -> None:
    if session.phase == "finished":
        raise GameRuleError("La négociation est terminée")
    if proposal not in PROPOSALS:
        raise GameRuleError("Proposition inconnue")
    if session.day >= 7:
        raise GameRuleError("Le délai de négociation est écoulé : passe au vote")
    if proposal == "sanctuary":
        session.positions["selene"] = min(3, session.positions["selene"] + 1)
        session.positions["ivo"] = max(-3, session.positions["ivo"] - 1)
    elif proposal == "construction":
        session.positions["ivo"] = min(3, session.positions["ivo"] + 2)
        session.positions["selene"] = max(-3, session.positions["selene"] - 1)
    else:
        session.positions["selene"] = min(3, session.positions["selene"] + 1)
        session.positions["ivo"] = min(3, session.positions["ivo"] + 1)
    session.agreements.append(proposal)
    session.phase = "negotiation"
    session.day += 1
    session.messages.append({"speaker": "ivo", "text": f"J'enregistre ta proposition : {PROPOSALS[proposal]} Notre position évolue, mais les besoins énergétiques demeurent."})


def vote(session: Session, proposal: str) -> str:
    if session.phase == "finished":
        raise GameRuleError("Cette session a déjà voté")
    if proposal not in PROPOSALS:
        raise GameRuleError("Proposition inconnue")
    # Deterministic public rules. Each delegate votes independently.
    support = 1  # player
    support += int(proposal == "sanctuary" and session.positions["selene"] >= 1)
    support += int(proposal == "construction" and session.positions["ivo"] >= 0)
    support += int(proposal == "compromise" and session.positions["selene"] >= 1)
    support += int(proposal == "compromise" and session.positions["ivo"] >= -1)
    support += int(session.positions["ada"] >= 1 and len(session.archives) >= 1)
    # Each of the three NPCs can contribute at most one vote. For compromise,
    # the two comparisons above represent separate delegates.
    # For other proposals Ada supports procedural admission of sourced archives.
    passed = support >= 3
    session.phase = "finished"
    session.result = ("Accord adopté" if passed else "Accord rejeté") + f" ({support}/4 voix) : {PROPOSALS[proposal]}"
    session.messages.append({"speaker": "assembly", "text": session.result})
    return session.result
