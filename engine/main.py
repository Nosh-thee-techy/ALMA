"""
ALMA Engine — FastAPI gateway for risk, USSD, Voice, Simulator, Gemma.
Run from repo root:
  cd engine && python -m venv .venv && .venv/Scripts/activate && pip install -r requirements.txt
  uvicorn main:app --reload --port 8787
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Root .env (AT / ElevenLabs / Featherless) then engine/.env (Gemma / coords)
_ROOT = Path(__file__).resolve().parent.parent
_ENGINE = Path(__file__).resolve().parent
load_dotenv(_ENGINE / ".env", override=True)
load_dotenv(_ROOT / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routes import dashboard, farmer, simulator, twilio_webhook, ussd, voice
from services import session_store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    session_store.init_db()
    yield


app = FastAPI(
    title="ALMA Engine",
    description=(
        "Dual-trigger compound risk, USSD/Voice last-mile gateway, "
        "and offline Gemma assistants for Omo–Turkana early action."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ussd.router)
app.include_router(voice.router)
app.include_router(simulator.router)
app.include_router(dashboard.router)
app.include_router(farmer.router)
app.include_router(twilio_webhook.router)

_audio = Path(__file__).resolve().parent / "data" / "audio"
_audio.mkdir(parents=True, exist_ok=True)
app.mount("/media/audio", StaticFiles(directory=str(_audio)), name="audio")


@app.get("/health")
def health():
    return {"ok": True, "service": "alma-engine", "version": "0.1.0"}
