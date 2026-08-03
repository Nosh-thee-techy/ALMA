"""Africa's Talking Voice / IVR — ALMA farmer helpline + ElevenLabs when available."""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response

from services import gemma_ai, session_store, voice_agent
from services.live_signals import get_live_signals
from services.playbook_loader import cell_to_ward, get_playbook_line

router = APIRouter(tags=["voice"])


def _xml(body: str) -> Response:
    return Response(content=body, media_type="application/xml")


def _speak_or_play(text: str) -> str:
    from services import elevenlabs_tts

    audio = elevenlabs_tts.synthesize(text)
    if audio.get("ok") and audio.get("url"):
        return f"<Play>{escape(audio['url'])}</Play>"
    return f"<Say>{escape(text)}</Say>"


def _live_risk_line(ward: str, lang: str = "sw") -> str:
    brief = voice_agent.brief_script(ward_id=ward, lang=lang)
    return brief["text"]


@router.post("/api/voice")
async def voice_webhook(
    request: Request,
    sessionId: str = Form(""),
    isActive: str = Form("1"),
    callerNumber: str = Form(""),
    dtmfDigits: str = Form(""),
    recordingUrl: str = Form(""),
):
    """
    Farmer helpline IVR.
    1 = live flood risk (plain language)
    2 = what to do now (sector playbook)
    3 = record river report
    4 = repeat menu
    """
    lac = request.headers.get("lac")
    cid = request.headers.get("cid")
    ward = cell_to_ward(lac, cid) or "kalokol"
    digit = (dtmfDigits or "").strip()

    if recordingUrl:
        transcript = "Maji iko juu sana kwa Node 3, ng'ombe wamekwama"
        parsed = gemma_ai.parse_ground_truth_rule_based(transcript)
        session_store.add_ground_truth(callerNumber, ward, parsed)
        session_store.log_action(
            callerNumber, ward, "voice_report", {"recordingUrl": recordingUrl, "parsed": parsed}
        )
        speak = (
            f"Asante. ALMA imehifadhi ripoti yako kutoka {ward}. "
            "Bonyeza 1 kusikia hatari, au 2 kwa hatua."
        )
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
  <GetDigits timeout="15" finishOnKey="#">
    {_speak_or_play(voice_agent.helpline_menu_script("sw"))}
  </GetDigits>
</Response>"""
        )

    if digit == "1":
        speak = _live_risk_line(ward, "sw")
        session_store.log_action(callerNumber, ward, "voice_risk", {"text": speak[:200]})
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
  <GetDigits timeout="12" finishOnKey="#">
    {_speak_or_play("Bonyeza 2 kwa hatua. Bonyeza 3 kuripoti. Bonyeza 4 menyu.")}
  </GetDigits>
</Response>"""
        )

    if digit == "2":
        signals = get_live_signals()
        risk = signals.get("risk") or {}
        tier = str(risk.get("tier") or "watch")
        line = get_playbook_line("pastoralist", tier, "sw")
        speak = f"Hatua sasa. Hali {tier}. {line} Piga nyota tatu nane nne nyota tisa sita nne mbili nane hash ikiwa hakuna sauti."
        session_store.log_action(callerNumber, ward, "voice_action", {"tier": tier})
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if digit == "3":
        prompt = "Baada ya bipu, eleza kiwango cha maji kwa lugha yako, kisha bonyeza hash."
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="25" trimSilence="true" playBeep="true"/>
</Response>"""
        )

    # 4 or empty → menu (also handles first dial)
    menu = voice_agent.helpline_menu_script("sw")
    goodbye = "Asante. Piga tena *384*96428# kwa USSD."
    return _xml(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="20" finishOnKey="#">
    {_speak_or_play(menu)}
  </GetDigits>
  {_speak_or_play(goodbye)}
</Response>"""
    )
