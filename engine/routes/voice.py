"""Africa's Talking Voice / IVR — ElevenLabs <Play> when available, else <Say>."""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response

from services import elevenlabs_tts, gemma_ai, session_store
from services.playbook_loader import cell_to_ward, get_playbook_line
from services.risk_engine import compute_compound_risk

router = APIRouter(tags=["voice"])

DEMO_RAIN_MM = 62.0
DEMO_DAM_M3S = 420.0


def _xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _speak_or_play(text: str) -> str:
    """Prefer ElevenLabs MP3 via public ngrok URL; fall back to AT <Say>."""
    audio = elevenlabs_tts.synthesize(text)
    if audio.get("ok") and audio.get("url"):
        return f"<Play>{escape(audio['url'])}</Play>"
    return f"<Say>{escape(text)}</Say>"


@router.post("/api/voice")
async def voice_webhook(
    request: Request,
    sessionId: str = Form(""),
    isActive: str = Form("1"),
    callerNumber: str = Form(""),
    dtmfDigits: str = Form(""),
    recordingUrl: str = Form(""),
):
    lac = request.headers.get("lac")
    cid = request.headers.get("cid")
    ward = cell_to_ward(lac, cid) or "kalokol"

    if recordingUrl:
        transcript = "Maji iko juu sana kwa Node 3, ng'ombe wamekwama"
        parsed = gemma_ai.parse_ground_truth(transcript)
        session_store.add_ground_truth(callerNumber, ward, parsed)
        risk = compute_compound_risk(DEMO_RAIN_MM, DEMO_DAM_M3S, data_quality="simulated")
        line = get_playbook_line("pastoralist", risk.tier, "sw")
        speak = f"Asante. ALMA imesikia ripoti yako. Hali {risk.tier}. {line}"
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if dtmfDigits == "1":
        risk = compute_compound_risk(DEMO_RAIN_MM, DEMO_DAM_M3S, data_quality="simulated")
        line = get_playbook_line("pastoralist", risk.tier, "sw")
        speak = f"Hali ya mafuriko {risk.tier}. {line}"
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if dtmfDigits == "2":
        prompt = "After the beep, describe water levels in your language, then hang up."
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="20" trimSilence="true" playBeep="true"/>
</Response>"""
        )

    menu = "Karibu ALMA Early Action. Press 1 for flood risk in Swahili. Press 2 to report water levels by voice."
    goodbye = "No input received. Goodbye."
    return _xml(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="20" finishOnKey="#">
    {_speak_or_play(menu)}
  </GetDigits>
  {_speak_or_play(goodbye)}
</Response>"""
    )
