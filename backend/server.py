"""Prototype HTTP API: 2026 archives influence the 2235 assembly."""
from __future__ import annotations

import os
from threading import RLock
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agents import LLM_MODEL, council_reaction, is_available, propose_mission, response_to_archive
from game import GameRuleError, Session, create_session, negotiate, submit_archive, vote

app = FastAPI(title="The Last Dialogue API", version="0.1.0")
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

# Prototype storage only; an actual deployment needs durable, per-user storage.
sessions: dict[str, Session] = {}
lock = RLock()


class StartRequest(BaseModel):
    mode: Literal["scripted", "llm"] = "scripted"


class ArchiveRequest(BaseModel):
    kind: Literal["publication", "observation"]
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1500)
    source_url: str | None = Field(default=None, max_length=2048)


class ProposalRequest(BaseModel):
    proposal: Literal["sanctuary", "compromise", "construction"]


def find_session(session_id: str) -> Session:
    session = sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session introuvable")
    return session


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/capabilities")
def capabilities():
    """Read-only identification for the optional Android Tailscale connection."""
    return {"app": "the-last-dialogue", "llm_configured": is_available(), "model": LLM_MODEL}


@app.post("/api/sessions")
def start_session(request: StartRequest):
    session = create_session(request.mode, llm_available=is_available())
    # Network calls must not happen under the session store lock.
    mission = propose_mission(session)
    if mission is not None:
        session.mission = mission
        session.messages[-1]["text"] = mission["request"]
    elif session.effective_mode == "llm":
        session.warning = "Agent LLM indisponible : mission scénarisée utilisée."
    with lock:
        sessions[session.id] = session
    return session.public()


@app.get("/api/sessions/{session_id}")
def read_session(session_id: str):
    with lock:
        return find_session(session_id).public()


@app.post("/api/sessions/{session_id}/archives")
def add_archive(session_id: str, request: ArchiveRequest):
    try:
        with lock:
            session = find_session(session_id)
            archive = submit_archive(session, **request.model_dump())
            snapshot = session.public()
        # Freeform LLM commentary is informational and cannot affect game rules.
        comment = response_to_archive(session, archive.title, archive.description)
        if comment:
            with lock:
                session.messages.append({"speaker": "ada", "text": comment})
                snapshot = session.public()
        return snapshot
    except GameRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/sessions/{session_id}/proposals")
def make_proposal(session_id: str, request: ProposalRequest):
    try:
        with lock:
            session = find_session(session_id)
            negotiate(session, request.proposal)
            snapshot = session.public()
        comment = council_reaction(session, request.proposal)
        if comment:
            with lock:
                session.messages.append({"speaker": "ivo", "text": comment})
                snapshot = session.public()
        return snapshot
    except GameRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/sessions/{session_id}/vote")
def cast_vote(session_id: str, request: ProposalRequest):
    try:
        with lock:
            session = find_session(session_id)
            vote(session, request.proposal)
            return session.public()
    except GameRuleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
