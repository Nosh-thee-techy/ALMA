"""Africa's Talking Voice / IVR — ALMA farmer helpline + dedicated SOS line."""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response

from services import gemma_ai, session_store, sos_lifecycle, voice_agent
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


@router.post("/api/voice/sos")
async def voice_sos_webhook(
    request: Request,
    sessionId: str = Form(""),
    isActive: str = Form("1"),
    callerNumber: str = Form(""),
    recordingUrl: str = Form(""),
    clientRequestId: str = Form(""),
):
    """
    Dedicated SOS call-in — does NOT route through helpline Q&A.
    Immediate confirmation, then optional ~15s message after tone.
    """
    phone = (callerNumber or "").strip()
    lang = "sw"

    # Callback after optional recording
    if recordingUrl:
        note = f"Voice SOS recording: {recordingUrl[:180]}"
        open_items = [
            r
            for r in session_store.list_sos_queue(limit=20, include_resolved=False)
            if str(r.get("phone") or "") == phone
        ]
        if open_items:
            sid = int(open_items[0]["id"])
            session_store.log_action(
                phone,
                open_items[0].get("ward_id"),
                "sos_voice_recording",
                {"sos_id": sid, "recordingUrl": recordingUrl, "sessionId": sessionId},
            )
            session_store.log_sos_request(
                phone,
                channel="CALL",
                message_body=note,
                community=open_items[0].get("community"),
                ward_id=open_items[0].get("ward_id"),
            )
        thanks = (
            "Asante. Washirika wamearifiwa. Kaa salama."
            if lang == "sw"
            else "Thank you. Responders have been notified. Stay safe."
        )
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(thanks)}
</Response>"""
        )

    result = sos_lifecycle.ingest_sos(
        phone,
        channel="CALL",
        message_body="SOS (voice call-in)",
        lang=lang,
        send_confirm_sms=True,
    )
    confirm = str(result.get("confirm_message") or sos_lifecycle.confirm_message(lang))
    prompt = (
        "Baada ya bipu, unaweza kusema ujumbe mfupi sekunde kumi na tano, au funga simu."
        if lang == "sw"
        else "After the tone, you may leave a short 15-second message, or hang up."
    )
    return _xml(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(confirm)}
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="15" trimSilence="true" playBeep="true"/>
</Response>"""
    )


def _inbound_helpline(
    *,
    session_id: str = "",
    caller_number: str = "",
    ward: str = "kalokol",
    digit: str = "",
    recording_url: str = "",
    lang: str = "sw",
) -> Response:
    """Sync helper for phone_simulator — mirrors /api/voice decision tree."""
    if recording_url:
        transcript = "Maji iko juu sana kwa Node 3, ng'ombe wamekwama"
        parsed = gemma_ai.parse_ground_truth_rule_based(transcript)
        session_store.add_ground_truth(caller_number, ward, parsed)
        session_store.log_action(
            caller_number, ward, "voice_report", {"recordingUrl": recording_url, "parsed": parsed}
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
    {_speak_or_play(voice_agent.helpline_menu_script(lang))}
  </GetDigits>
</Response>"""
        )

    if digit == "1":
        speak = _live_risk_line(ward, lang)
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if digit == "2":
        signals = get_live_signals()
        risk = signals.get("risk") or {}
        tier = str(risk.get("tier") or "watch")
        try:
            from services import ground_conditions as gc

            g = gc.channel_guidance(
                sector="pastoralist",
                region_id="omo" if ward == "omorate" else "turkana",
                lang=lang if lang in ("en", "sw") else "en",
            )
            line = str(g.get("text") or get_playbook_line("pastoralist", tier, lang))
        except Exception:
            line = get_playbook_line("pastoralist", tier, lang)
        speak = f"Hatua sasa. Hali {tier}. {line}" if lang == "sw" else f"What to do now. Level {tier}. {line}"
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if digit == "3":
        prompt = (
            "Baada ya bipu, eleza kiwango cha maji, kisha bonyeza hash."
            if lang == "sw"
            else "After the beep, describe water levels, then press hash."
        )
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="25" trimSilence="true" playBeep="true"/>
</Response>"""
        )

    if digit == "6":
        from services import farmer_readiness as fr

        speak = fr.voice_readiness_script(caller_number, ward=ward, lang=lang)
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    menu = voice_agent.helpline_menu_script(lang)
    return _xml(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="20" finishOnKey="#">
    {_speak_or_play(menu)}
  </GetDigits>
</Response>"""
    )


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
    Farmer helpline IVR — Alma is the voice.
    1 = live flood risk · 2 = actions · 3 = river report · 6 = after-event readiness · 5 = talk to Alma · 4 = menu
    """
    from services import alma_agent, speech_to_text, voice_conversation

    lac = request.headers.get("lac")
    cid = request.headers.get("cid")
    ward = cell_to_ward(lac, cid) or "kalokol"
    digit = (dtmfDigits or "").strip()
    conv = session_store.get_voice_conversation(sessionId) if sessionId else None

    if recordingUrl:
        # Free-talk with Alma
        if conv and conv.get("state") == "alma_talk":
            stt = speech_to_text.transcribe_url(recordingUrl)
            said = str((stt or {}).get("text") or "").strip()
            if not said:
                said = "Hello Alma"
            result = alma_agent.chat(said, lang="sw", include_audio=True, mode="phone")
            speak = str(result.get("reply") or "Habari, mimi ni Alma.")
            session_store.log_action(
                callerNumber,
                ward,
                "alma_voice_chat",
                {"said": said[:200], "reply": speak[:200], "sessionId": sessionId},
            )
            return _xml(
                f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
  <GetDigits timeout="12" finishOnKey="#">
    {_speak_or_play("Bonyeza 5 kuzungumza tena, 1 kwa hatari, au 2 kwa hatua.")}
  </GetDigits>
</Response>"""
            )

        transcript = "Maji iko juu sana kwa Node 3, ng'ombe wamekwama"
        parsed = gemma_ai.parse_ground_truth_rule_based(transcript)
        session_store.add_ground_truth(callerNumber, ward, parsed)
        session_store.log_action(
            callerNumber, ward, "voice_report", {"recordingUrl": recordingUrl, "parsed": parsed}
        )
        speak = (
            f"Asante. Alma imehifadhi ripoti yako kutoka {ward}. "
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
    {_speak_or_play("Bonyeza 2 kwa hatua. Bonyeza 5 kuzungumza na Alma. Bonyeza 4 menyu.")}
  </GetDigits>
</Response>"""
        )

    if digit == "2":
        signals = get_live_signals()
        risk = signals.get("risk") or {}
        tier = str(risk.get("tier") or "watch")
        line = get_playbook_line("pastoralist", tier, "sw")
        speak = (
            f"Hatua sasa. Hali {tier}. {line} "
            "Piga nyota tatu nane nne nyota tisa sita nne mbili nane hash ikiwa hakuna sauti."
        )
        session_store.log_action(callerNumber, ward, "voice_action", {"tier": tier})
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
</Response>"""
        )

    if digit == "3":
        voice_conversation.mark_report_recording(sessionId, callerNumber, ward, lang="sw")
        prompt = "Baada ya bipu, eleza kiwango cha maji kwa lugha yako, kisha bonyeza hash."
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="25" trimSilence="true" playBeep="true"/>
</Response>"""
        )

    if digit == "5":
        session_store.save_voice_conversation(
            sessionId,
            phone=callerNumber,
            ward_id=ward,
            lang="sw",
            sector="pastoralist",
            state="alma_talk",
            turn_count=0,
            conversation_context=[],
            scripted_guidance=None,
        )
        prompt = (
            "Habari, mimi ni Alma. Baada ya bipu, sema unachotaka — "
            "kwa mfano Habari Alma, au uliza kuhusu mvua — kisha bonyeza hash."
        )
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(prompt)}
  <Record finishOnKey="#" maxLength="20" trimSilence="true" playBeep="true"/>
</Response>"""
        )

    if digit == "6":
        from services import farmer_readiness as fr

        speak = fr.voice_readiness_script(callerNumber, ward=ward, lang="sw")
        session_store.log_action(callerNumber, ward, "voice_readiness", {"text": speak[:200]})
        return _xml(
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(speak)}
  <GetDigits timeout="12" finishOnKey="#">
    {_speak_or_play("Bonyeza 5 kuzungumza na Alma. Bonyeza 4 menyu.")}
  </GetDigits>
</Response>"""
        )

    # First dial / 4 — Alma greets, then menu
    greet = (
        "Habari, mimi ni Alma, wakala wako wa Early Action. "
        "Ninaweza kueleza hatari na nini ufanye sasa."
    )
    menu = voice_agent.helpline_menu_script("sw")
    goodbye = "Asante. Piga tena *384*96428# kwa USSD. Kwa dharura piga nambari ya SOS."
    return _xml(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  {_speak_or_play(greet)}
  <GetDigits timeout="20" finishOnKey="#">
    {_speak_or_play(menu)}
  </GetDigits>
  {_speak_or_play(goodbye)}
</Response>"""
    )
