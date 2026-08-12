"""
Bounded multi-turn voice Q&A for the farmer helpline.

NOT an open-ended chatbot — scoped flood/drought Q&A capped at 4 turns per call.
Gemma reasoning runs server-side; the phone only sends/receives audio.
"""
from __future__ import annotations

from typing import Any

from services import gemma_ai, session_store, speech_to_text, voice_agent

MAX_TURNS = session_store.MAX_VOICE_QA_TURNS
RECORD_SECONDS = 20


def _risk_context(ward_id: str, lang: str = "sw") -> dict[str, Any]:
    """Reuse the same risk/guidance data as SMS/dashboard generation."""
    brief = voice_agent.brief_script(ward_id=ward_id, lang=lang, audience="farmer")
    region_id = "omo" if ward_id == "omorate" else "turkana"
    guidance_text = ""
    try:
        from services import ground_conditions as gc

        g = gc.channel_guidance(
            sector=str(brief.get("sector") or "pastoralist"),
            region_id=region_id,
            lang=lang if lang in ("en", "sw") else "en",
        )
        guidance_text = g.get("text") or ""
        brief["event_phase"] = g.get("event_phase") or brief.get("event_phase")
        brief["tier"] = g.get("tier") or brief.get("tier")
    except Exception:
        pass
    brief["guidance_text"] = guidance_text or brief.get("text") or ""
    brief["community"] = brief.get("place") or ward_id
    return brief


def scripted_guidance_for(ward_id: str, lang: str = "sw") -> str:
    """Known-good static briefing — safe fallback when STT/Gemma are uncertain."""
    ctx = _risk_context(ward_id, lang)
    return (ctx.get("guidance_text") or ctx.get("text") or "").strip()


def start_qa_session(
    session_id: str,
    phone: str,
    ward_id: str,
    *,
    lang: str = "sw",
) -> dict[str, Any]:
    ctx = _risk_context(ward_id, lang)
    return session_store.save_voice_conversation(
        session_id,
        phone=phone,
        ward_id=ward_id,
        lang=lang,
        sector=str(ctx.get("sector") or "pastoralist"),
        state="qa_recording",
        turn_count=0,
        conversation_context=[],
        scripted_guidance=scripted_guidance_for(ward_id, lang),
    )


def mark_report_recording(session_id: str, phone: str, ward_id: str, *, lang: str = "sw") -> None:
    """River report (digit 3) — separate from Q&A so recordingUrl routes correctly."""
    session_store.save_voice_conversation(
        session_id,
        phone=phone,
        ward_id=ward_id,
        lang=lang,
        sector="pastoralist",
        state="report_recording",
        turn_count=0,
        conversation_context=[],
        scripted_guidance=None,
    )


def process_question_text(conv: dict[str, Any], question: str) -> dict[str, Any]:
    """Phone simulator: skip STT and feed typed/spoken text into the bounded Q&A loop."""
    return _process_question_turn(
        conv,
        question=(question or "").strip(),
        stt_meta={"confidence": 1.0, "provider": "text_sim", "low_confidence": False},
        force_fallback=False,
    )


def process_question_recording(
    conv: dict[str, Any],
    recording_url: str,
) -> dict[str, Any]:
    """
    STT → Gemma (or fallback). Never let Gemma guess on unclear input during a live call —
    replaying the known-good scripted message is always safer than an uncertain generated
    answer in a life-safety context.
    """
    ward_id = conv.get("ward_id") or "kalokol"
    lang = conv.get("lang") or "sw"
    turn = int(conv.get("turn_count") or 0)

    if session_store.voice_call_duration_exceeded(conv):
        return {
            "speak": _closing_line(lang),
            "end_call": True,
            "reason": "max_duration",
        }

    if turn >= MAX_TURNS:
        return {
            "speak": _closing_line(lang),
            "end_call": True,
            "reason": "max_turns",
        }

    stt = speech_to_text.transcribe_url(recording_url, lang_hint=lang)
    question = (stt.get("text") or "").strip()
    use_fallback = speech_to_text.is_low_confidence(stt)

    return _process_question_turn(
        conv,
        question=question,
        stt_meta=stt,
        force_fallback=use_fallback,
    )


def _process_question_turn(
    conv: dict[str, Any],
    *,
    question: str,
    stt_meta: dict[str, Any],
    force_fallback: bool,
) -> dict[str, Any]:
    ward_id = conv.get("ward_id") or "kalokol"
    lang = conv.get("lang") or "sw"
    turn = int(conv.get("turn_count") or 0)

    if session_store.voice_call_duration_exceeded(conv):
        return {"speak": _closing_line(lang), "end_call": True, "reason": "max_duration"}
    if turn >= MAX_TURNS:
        return {"speak": _closing_line(lang), "end_call": True, "reason": "max_turns"}

    risk = _risk_context(ward_id, lang)
    scripted = (conv.get("scripted_guidance") or scripted_guidance_for(ward_id, lang)).strip()
    use_fallback = force_fallback or not question

    if use_fallback:
        answer = scripted
        source = "stt_low_confidence" if force_fallback else "empty_question"
    else:
        gemma = gemma_ai.voice_qa_answer(
            question,
            community=str(risk.get("community") or ward_id),
            risk_context=risk,
            conversation_context=conv.get("conversation_context") or [],
            lang=lang,
        )
        answer = str(gemma.get("answer") or "").strip()
        understood = bool(gemma.get("understood", True))
        source = gemma.get("source") or "gemma"
        if not understood or _is_unclear_answer(answer):
            answer = scripted
            source = "gemma_unclear_fallback"

    ctx = list(conv.get("conversation_context") or [])
    if question and not use_fallback:
        ctx.append({"q": question[:200], "a": answer[:300]})
    ctx = ctx[-2:]

    new_turn = turn + 1
    session_store.save_voice_conversation(
        conv["session_id"],
        phone=conv.get("phone") or "",
        ward_id=ward_id,
        lang=lang,
        sector=conv.get("sector"),
        state="qa_continue",
        turn_count=new_turn,
        conversation_context=ctx,
        scripted_guidance=scripted,
        started_at=conv.get("started_at"),
    )

    session_store.log_action(
        conv.get("phone"),
        ward_id,
        "voice_qa_turn",
        {
            "turn": new_turn,
            "question": question[:200],
            "answer": answer[:200],
            "stt_confidence": stt_meta.get("confidence"),
            "stt_low_confidence": force_fallback,
            "source": source,
        },
    )

    if new_turn >= MAX_TURNS:
        speak = f"{answer} {_closing_line(lang)}"
        return {"speak": speak, "end_call": True, "reason": "max_turns_after_answer"}

    follow = _continue_prompt(lang)
    return {
        "speak": f"{answer} {follow}",
        "end_call": False,
        "await_digit": True,
        "reason": source,
        "question": question,
        "answer": answer,
    }


def handle_continue_digit(conv: dict[str, Any], digit: str) -> dict[str, Any]:
    lang = conv.get("lang") or "sw"

    if session_store.voice_call_duration_exceeded(conv):
        return {"speak": _closing_line(lang), "end_call": True, "reason": "max_duration"}

    d = (digit or "").strip()
    if d == "1":
        session_store.save_voice_conversation(
            conv["session_id"],
            phone=conv.get("phone") or "",
            ward_id=conv.get("ward_id"),
            lang=lang,
            sector=conv.get("sector"),
            state="qa_recording",
            turn_count=int(conv.get("turn_count") or 0),
            conversation_context=conv.get("conversation_context") or [],
            scripted_guidance=conv.get("scripted_guidance"),
            started_at=conv.get("started_at"),
        )
        return {
            "speak": _ask_prompt(lang),
            "record": True,
            "end_call": False,
        }

    # 2, silence, or unknown → polite end
    return {"speak": _goodbye_clear(lang), "end_call": True, "reason": "caller_done"}


def _is_unclear_answer(text: str) -> bool:
    t = text.lower()
    return any(
        phrase in t
        for phrase in (
            "didn't quite catch",
            "did not quite catch",
            "could you ask again",
            "couldn't understand",
            "could not understand",
        )
    )


def _ask_prompt(lang: str) -> str:
    if lang == "en":
        return "What would you like me to explain?"
    return "Ungependa nieleze nini kuhusu hali yako?"


def _continue_prompt(lang: str) -> str:
    if lang == "en":
        return (
            "Do you have another question, or are you clear on what to do? "
            "Press 1 for another question. Press 2 if you are clear."
        )
    return (
        "Una swali lingine, au unaelewa hatua za kuchukua? "
        "Bonyeza 1 kwa swali lingine. Bonyeza 2 ukiwa tayari."
    )


def _closing_line(lang: str) -> str:
    if lang == "en":
        return "You're set for now. Call back or wait for an SMS if anything changes."
    return "Uko tayari kwa sasa. Piga tena au subiri SMS ikiwa kuna mabadiliko."


def closing_line(lang: str) -> str:
    return _closing_line(lang)


def _goodbye_clear(lang: str) -> str:
    if lang == "en":
        return "Good. Stay safe. Goodbye."
    return "Sawa. Kuwa salama. Kwaheri."


def qa_record_prompt(lang: str = "sw") -> str:
    return _ask_prompt(lang)
