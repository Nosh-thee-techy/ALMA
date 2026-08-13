"""ALMA SOS lifecycle — route and escalate; humans respond.

Philosophy: SOS is a routing/escalation system, not a rescue service.
ALMA notifies real responders fast and escalates if they do not act.
It cannot guarantee a human arrives in time — state that honestly.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any

from services import africastalking, session_store, sos_dispatch
# voice_outbound imported lazily in reopen_not_safe to avoid circular import issues

# Verified English + Swahili only for SOS keywords/prompts (native-reviewed).
# Do not add more languages without fluent-speaker verification.
SOS_KEYWORDS = frozenset(
    {
        "sos",
        "help",
        "msaada",  # Swahili — verified common emergency ask
        "nisaidie",
    }
)

ACK_WINDOW_S = float(os.getenv("ALMA_SOS_ACK_WINDOW_S", str(12 * 60)))  # 12 min
CHECKIN_WINDOW_S = float(os.getenv("ALMA_SOS_CHECKIN_WINDOW_S", str(15 * 60)))
ESCALATE_WINDOW_S = float(os.getenv("ALMA_SOS_ESCALATE_WINDOW_S", str(15 * 60)))
MAX_ESCALATIONS = int(os.getenv("ALMA_SOS_MAX_ESCALATIONS", "3"))
DEDUPE_WINDOW_S = float(os.getenv("ALMA_SOS_DEDUPE_WINDOW_S", "300"))

# PLACEHOLDER — replace with a real Kenya Red Cross / county DMU line before live demo.
BACKUP_EMERGENCY_NUMBER = os.getenv(
    "ALMA_SOS_BACKUP_EMERGENCY_NUMBER",
    "[CONFIRM REAL NUMBER — Kenya Red Cross / county disaster office]",
)
ONCALL_LEAD_PHONE = os.getenv("ALMA_SOS_ONCALL_LEAD_PHONE", "").strip()


def is_sos_keyword(text: str) -> bool:
    raw = (text or "").strip().lower()
    if not raw:
        return False
    # Whole-message keyword or leading keyword (e.g. "SOS flood")
    first = re.split(r"[\s,!.]+", raw, maxsplit=1)[0]
    return first in SOS_KEYWORDS or raw in SOS_KEYWORDS


def confirm_message(lang: str = "en") -> str:
    if lang == "sw":
        return (
            "ALMA: Ombi la msaada limetekelezwa. Washirika wamearifiwa. "
            "Kaa salama; nenda sehemu ya juu ikiwezekana."
        )
    return (
        "ALMA: Help request received. Responders notified. "
        "Stay safe, move to higher ground if possible."
    )


def checkin_message(org: str | None = None, lang: str = "en") -> str:
    who = org or "responders"
    if lang == "sw":
        return (
            f"Dharura yako imewekwa kuwa imetatuliwa na {who}. "
            "Je, uko salama? Jibu NDIYO au HAPANA."
        )
    return (
        f"Your emergency has been marked resolved by {who}. "
        "Are you safe? Reply YES or NO."
    )


def reopen_voice_script(lang: str = "en") -> str:
    backup = BACKUP_EMERGENCY_NUMBER
    if lang == "sw":
        return (
            "Habari, mimi ni Alma. Washirika wamearifiwa tena. "
            f"Ikiwa bado uko hatarini, piga moja kwa moja {backup}. "
            "Hiyo nambari haipiti kupitia ALMA."
        )
    return (
        "Hello, this is Alma. Responders have been re-notified. "
        f"If you are still in danger, call {backup} directly — "
        "that line does not go through ALMA."
    )


def _farmer_community(phone: str) -> tuple[str | None, str | None]:
    try:
        row = session_store.get_farmer(phone)
    except Exception:
        row = None
    if not row:
        return None, None
    community = str(row.get("community") or "").strip() or None
    ward = community.lower().replace(" ", "_") if community else None
    return community, ward


def _lang_for_phone(phone: str) -> str:
    try:
        row = session_store.get_farmer(phone)
        if row and str(row.get("lang") or "").lower().startswith("sw"):
            return "sw"
    except Exception:
        pass
    return "en"


def ingest_sos(
    phone: str,
    *,
    channel: str,
    message_body: str = "",
    lang: str | None = None,
    community: str | None = None,
    ward_id: str | None = None,
    send_confirm_sms: bool = True,
) -> dict[str, Any]:
    """
    Stage 1: log + confirm + notify responders.
    Always confirm even when dashboard entry is deduped (SMS every time unless
    the channel already replies in-band, e.g. TwiML / USSD END text).
    """
    phone = (phone or "").strip()
    channel = str(channel or "SMS").strip().upper()
    if channel in ("CALL", "VOICE"):
        channel = "CALL"
    lang = lang or _lang_for_phone(phone)
    if not community or not ward_id:
        c2, w2 = _farmer_community(phone)
        community = community or c2
        ward_id = ward_id or w2

    entry = session_store.log_sos_request(
        phone,
        channel=channel,
        message_body=message_body or "SOS",
        community=community,
        ward_id=ward_id,
        dedupe_window_s=DEDUPE_WINDOW_S,
    )

    confirm = confirm_message(lang)
    sms_result: dict[str, Any] | None = None
    if send_confirm_sms:
        sms_result = africastalking.send_sms(phone, confirm)

    notify = sos_dispatch.notify_sos_responders(
        entry=entry,
        channel=channel,
        message_body=message_body or "SOS",
        escalation=False,
    )

    session_store.log_action(
        phone,
        ward_id,
        "sos_received",
        {
            "sos_id": entry.get("id"),
            "channel": channel,
            "resent_count": entry.get("resent_count"),
            "confirm_sent": bool(send_confirm_sms) or True,
            "confirm_in_band": not send_confirm_sms,
            "notify": notify,
        },
    )

    return {
        "ok": True,
        "entry": entry,
        "confirm_message": confirm,
        "sms": sms_result,
        "notify": notify,
        "honesty": (
            "ALMA routes and escalates to real responders — it does not itself "
            "dispatch a rescue team."
        ),
    }


def handle_inbound_sms_text(
    phone: str,
    body: str,
    *,
    channel: str = "SMS",
    send_confirm_sms: bool = True,
) -> dict[str, Any] | None:
    """
    Returns a handled result if this SMS is SOS or SOS check-in; else None.
    """
    text = (body or "").strip()
    lower = text.lower()

    # Check-in replies for open check-ins
    pending = session_store.get_sos_pending_checkin(phone)
    if pending and lower in ("yes", "y", "ndiyo", "ndyo", "sawa", "safe"):
        return close_checkin_safe(int(pending["id"]), phone)
    if pending and lower in ("no", "n", "hapana", "si salama", "not safe"):
        return reopen_not_safe(int(pending["id"]), phone, reason="no")

    if is_sos_keyword(text):
        return ingest_sos(
            phone,
            channel=channel,
            message_body=text,
            send_confirm_sms=send_confirm_sms,
        )

    return None


def mark_being_handled(sos_id: int, *, acknowledged_by: str | None = None) -> dict[str, Any] | None:
    return session_store.set_sos_status(
        sos_id,
        "being_handled",
        acknowledged_by=acknowledged_by or "desk_operator",
    )


def mark_resolved(sos_id: int, *, resolved_by: str | None = None) -> dict[str, Any] | None:
    """Stage 4: mark resolved + send safety check-in SMS."""
    row = session_store.set_sos_status(
        sos_id,
        "resolved",
        acknowledged_by=resolved_by,
        trigger_checkin=True,
    )
    if not row:
        return None
    phone = str(row.get("phone") or "")
    lang = _lang_for_phone(phone)
    org = resolved_by or "responders"
    msg = checkin_message(org, lang)
    africastalking.send_sms(phone, msg)
    session_store.log_action(
        phone,
        row.get("ward_id"),
        "sos_checkin_sent",
        {"sos_id": sos_id, "message": msg[:200]},
    )
    return row


def close_checkin_safe(sos_id: int, phone: str) -> dict[str, Any]:
    row = session_store.set_sos_checkin(sos_id, "yes")
    session_store.log_action(phone, None, "sos_confirmed_safe", {"sos_id": sos_id})
    return {
        "ok": True,
        "path": "checkin_yes",
        "entry": row,
        "reply": (
            "ALMA: Thank you. Stay safe."
            if _lang_for_phone(phone) == "en"
            else "ALMA: Asante. Kaa salama."
        ),
    }


def reopen_not_safe(sos_id: int, phone: str, *, reason: str) -> dict[str, Any]:
    """Stage 5 NO / silence: reopen, re-notify, outbound voice + backup number."""
    row = session_store.reopen_sos(sos_id, reason=reason)
    if not row:
        return {"ok": False, "error": "not_found"}

    lang = _lang_for_phone(phone)
    notify = sos_dispatch.notify_sos_responders(
        entry=row,
        channel=str(row.get("channels") or "SMS"),
        message_body=(
            f"RE-OPENED — Person reports NOT safe (reason={reason}). "
            f"Original SOS id={sos_id}."
        ),
        escalation=True,
        reopened=True,
    )

    # Outbound voice with backup human number (best-effort)
    from services import voice_outbound

    voice: dict[str, Any]
    try:
        voice = voice_outbound.trigger_outbound_alert(
            phone,
            community=str(row.get("community") or "basin"),
            ward_id=str(row.get("ward_id") or "basin"),
            sector="health",
            region_id="turkana",
            lang=lang,
            tier="severe",
            compound_active=True,
            voice_enabled=True,
            custom_script=reopen_voice_script(lang),
        )
    except Exception as exc:
        africastalking.send_sms(phone, reopen_voice_script(lang))
        voice = {"ok": False, "error": str(exc), "note": "fell back to SMS script"}

    session_store.log_action(
        phone,
        row.get("ward_id"),
        "sos_reopened",
        {"sos_id": sos_id, "reason": reason, "notify": notify, "voice": voice},
    )

    reply = (
        "ALMA: Responders re-notified. If still in danger, call "
        f"{BACKUP_EMERGENCY_NUMBER} directly (not through ALMA)."
        if lang == "en"
        else (
            "ALMA: Washirika wamearifiwa tena. Ikiwa bado uko hatarini, piga "
            f"{BACKUP_EMERGENCY_NUMBER} moja kwa moja (si kupitia ALMA)."
        )
    )
    return {"ok": True, "path": "reopened", "entry": row, "reply": reply, "notify": notify, "voice": voice}


def tick_escalations() -> dict[str, Any]:
    """
    Stages 3 + 5 timers — call on desk poll / SOS list.
    - No ack within ACK_WINDOW → escalate WhatsApp + bump urgency
    - Resolved with pending check-in past CHECKIN_WINDOW → treat as NO
    - Reopened past ESCALATE_WINDOW → escalate again up to MAX
    """
    now = time.time()
    actions: list[dict[str, Any]] = []
    open_items = session_store.list_sos_queue(limit=100, include_resolved=True)

    for it in open_items:
        sid = int(it["id"])
        status = str(it.get("status") or "new")
        esc = int(it.get("escalation_count") or 0)
        last = float(it.get("last_received_at") or it.get("updated_at") or now)
        phone = str(it.get("phone") or "")

        # Stage 3: no acknowledgment
        if status == "new" and (now - last) >= ACK_WINDOW_S and esc < MAX_ESCALATIONS:
            updated = session_store.bump_sos_escalation(sid)
            if updated:
                sos_dispatch.notify_sos_responders(
                    entry=updated,
                    channel=str(updated.get("channels") or "SMS"),
                    message_body="RE-ESCALATION — no desk acknowledgment yet.",
                    escalation=True,
                )
                if esc + 1 >= MAX_ESCALATIONS and ONCALL_LEAD_PHONE:
                    africastalking.send_sms(
                        ONCALL_LEAD_PHONE,
                        f"ALMA SOS FINAL ESCALATION id={sid} phone={phone} — no ack after {MAX_ESCALATIONS} rounds.",
                    )
                actions.append({"sos_id": sid, "action": "ack_escalate", "count": esc + 1})

        # Stage 5 silence after resolve check-in
        if (
            status == "resolved"
            and str(it.get("check_in_response") or "") == "pending"
            and it.get("check_in_sent_at")
            and (now - float(it["check_in_sent_at"])) >= CHECKIN_WINDOW_S
        ):
            reopen_not_safe(sid, phone, reason="no_reply")
            actions.append({"sos_id": sid, "action": "checkin_silence_reopen"})

        # Reopened still stuck
        if status == "reopened" and (now - float(it.get("reopened_at") or last)) >= ESCALATE_WINDOW_S:
            if esc < MAX_ESCALATIONS:
                updated = session_store.bump_sos_escalation(sid)
                if updated:
                    sos_dispatch.notify_sos_responders(
                        entry=updated,
                        channel=str(updated.get("channels") or "SMS"),
                        message_body="RE-ESCALATION — reopened case still unresolved.",
                        escalation=True,
                        reopened=True,
                    )
                    actions.append({"sos_id": sid, "action": "reopened_escalate", "count": esc + 1})

    return {"ok": True, "actions": actions, "honesty": "Routing/escalation only — humans respond."}


def public_entry(row: dict[str, Any], now: float | None = None) -> dict[str, Any]:
    now = now or time.time()
    last = float(row.get("last_received_at") or row.get("created_at") or now)
    return {
        "id": int(row["id"]),
        "phone": row.get("phone"),
        "community": row.get("community"),
        "ward_id": row.get("ward_id"),
        "channel": row.get("channels"),
        "message_body": row.get("message_body"),
        "status": row.get("status"),
        "resent_count": int(row.get("resent_count") or 0),
        "escalation_count": int(row.get("escalation_count") or 0),
        "acknowledged_by": row.get("acknowledged_by"),
        "acknowledged_at": row.get("acknowledged_at"),
        "resolved_at": row.get("resolved_at"),
        "check_in_response": row.get("check_in_response"),
        "reopened_at": row.get("reopened_at"),
        "first_received_at": float(row.get("first_received_at") or last),
        "last_received_at": last,
        "received_at_label": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(last)),
        "time_since_received_s": int(max(0, now - last)),
        "ack_overdue": str(row.get("status")) == "new"
        and (now - last) >= ACK_WINDOW_S,
        "backup_emergency_number": BACKUP_EMERGENCY_NUMBER,
    }
