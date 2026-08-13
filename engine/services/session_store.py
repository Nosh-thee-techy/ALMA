"""SQLite session store for USSD sessions, ground-truth, vouchers, and actions."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

DB_PATH = Path(os.getenv("ALMA_SESSION_DB", Path(__file__).resolve().parent.parent / "data" / "alma_sessions.sqlite3"))


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS ussd_sessions (
              session_id TEXT PRIMARY KEY,
              phone TEXT NOT NULL,
              state TEXT NOT NULL,
              payload TEXT NOT NULL DEFAULT '{}',
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ground_truth (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT,
              ward_id TEXT,
              parsed_json TEXT NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS community_scores (
              ward_id TEXT PRIMARY KEY,
              verification_score REAL NOT NULL DEFAULT 0.5,
              reports INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ussd_actions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT,
              ward_id TEXT,
              action_type TEXT NOT NULL,
              details_json TEXT NOT NULL DEFAULT '{}',
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS vouchers (
              code TEXT PRIMARY KEY,
              phone TEXT NOT NULL,
              ward_id TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'issued',
              created_at REAL NOT NULL,
              redeemed_at REAL
            );
            CREATE TABLE IF NOT EXISTS cash_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ref TEXT UNIQUE NOT NULL,
              phone TEXT NOT NULL,
              amount_kes INTEGER NOT NULL,
              status TEXT NOT NULL DEFAULT 'stk_queued',
              details_json TEXT NOT NULL DEFAULT '{}',
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sos_queue (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              community TEXT,
              ward_id TEXT,
              channels TEXT NOT NULL,
              message_body TEXT,
              first_received_at REAL NOT NULL,
              last_received_at REAL NOT NULL,
              resent_count INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'new',
              escalation_count INTEGER NOT NULL DEFAULT 0,
              acknowledged_by TEXT,
              acknowledged_at REAL,
              resolved_at REAL,
              check_in_response TEXT,
              check_in_sent_at REAL,
              reopened_at REAL,
              reopen_reason TEXT,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dam_observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reporter TEXT,
              release_m3s REAL,
              fill_percent REAL,
              spillway_status TEXT,
              notes TEXT,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS farmers (
              phone TEXT PRIMARY KEY,
              profile_json TEXT NOT NULL DEFAULT '{}',
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS community_reach (
              ward_id TEXT PRIMARY KEY,
              last_reached_via TEXT NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS recovery_interest (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              ward_id TEXT,
              community TEXT,
              region_id TEXT,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tier_history (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              region_id TEXT NOT NULL,
              tier TEXT NOT NULL,
              compound INTEGER NOT NULL DEFAULT 0,
              at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ground_observers (
              phone TEXT PRIMARY KEY,
              profile_json TEXT NOT NULL DEFAULT '{}',
              verified INTEGER NOT NULL DEFAULT 0,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ground_observer_reports (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              organization_id TEXT,
              report_type TEXT NOT NULL,
              value TEXT NOT NULL,
              verified_observer INTEGER NOT NULL DEFAULT 0,
              source TEXT,
              raw_text TEXT,
              needs_review INTEGER NOT NULL DEFAULT 0,
              registered_location TEXT,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL DEFAULT '{}',
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ground_checks (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              channel TEXT NOT NULL,
              sent_at REAL,
              responded_at REAL,
              timely INTEGER,
              created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ground_checks_phone ON ground_checks(phone);
            CREATE TABLE IF NOT EXISTS recovery_eligibility_audit (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              region_id TEXT,
              flag INTEGER NOT NULL,
              audit_json TEXT NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_eligibility_phone ON recovery_eligibility_audit(phone);
            """
        )
        _ensure_sos_columns(c)


def _ensure_sos_columns(c: sqlite3.Connection) -> None:
    """Migrate older sos_queue schemas forward without wiping data."""
    cols = {str(r[1]) for r in c.execute("PRAGMA table_info(sos_queue)").fetchall()}
    alters = [
        ("escalation_count", "INTEGER NOT NULL DEFAULT 0"),
        ("acknowledged_by", "TEXT"),
        ("acknowledged_at", "REAL"),
        ("resolved_at", "REAL"),
        ("check_in_response", "TEXT"),
        ("check_in_sent_at", "REAL"),
        ("reopened_at", "REAL"),
        ("reopen_reason", "TEXT"),
    ]
    for name, typ in alters:
        if name not in cols:
            c.execute(f"ALTER TABLE sos_queue ADD COLUMN {name} {typ}")


def get_session(session_id: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM ussd_sessions WHERE session_id=?", (session_id,)).fetchone()
    if not row:
        return None
    return {
        "session_id": row["session_id"],
        "phone": row["phone"],
        "state": row["state"],
        "payload": json.loads(row["payload"] or "{}"),
        "updated_at": row["updated_at"],
    }


def save_session(session_id: str, phone: str, state: str, payload: dict[str, Any] | None = None) -> None:
    with _conn() as c:
        c.execute(
            """
            INSERT INTO ussd_sessions(session_id, phone, state, payload, updated_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(session_id) DO UPDATE SET
              phone=excluded.phone,
              state=excluded.state,
              payload=excluded.payload,
              updated_at=excluded.updated_at
            """,
            (session_id, phone, state, json.dumps(payload or {}), time.time()),
        )


def clear_session(session_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM ussd_sessions WHERE session_id=?", (session_id,))


def add_ground_truth(phone: str | None, ward_id: str | None, parsed: dict[str, Any]) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO ground_truth(phone, ward_id, parsed_json, created_at) VALUES(?,?,?,?)",
            (phone, ward_id, json.dumps(parsed), time.time()),
        )
        if ward_id:
            row = c.execute(
                "SELECT verification_score, reports FROM community_scores WHERE ward_id=?",
                (ward_id,),
            ).fetchone()
            weight = float(parsed.get("confidence_weight") or 0.5)
            if row:
                n = row["reports"] + 1
                score = (row["verification_score"] * row["reports"] + weight) / n
                c.execute(
                    "UPDATE community_scores SET verification_score=?, reports=?, updated_at=? WHERE ward_id=?",
                    (score, n, time.time(), ward_id),
                )
            else:
                c.execute(
                    "INSERT INTO community_scores(ward_id, verification_score, reports, updated_at) VALUES(?,?,?,?)",
                    (ward_id, weight, 1, time.time()),
                )
    log_action(phone, ward_id, "ground_truth", parsed)
    if phone:
        try:
            record_ground_check_response(str(phone), "ground_truth")
        except Exception:
            pass


def community_score(ward_id: str) -> dict[str, Any]:
    with _conn() as c:
        row = c.execute("SELECT * FROM community_scores WHERE ward_id=?", (ward_id,)).fetchone()
    if not row:
        return {"ward_id": ward_id, "verification_score": 0.5, "reports": 0}
    return {
        "ward_id": row["ward_id"],
        "verification_score": row["verification_score"],
        "reports": row["reports"],
        "updated_at": row["updated_at"],
    }


def log_action(
    phone: str | None,
    ward_id: str | None,
    action_type: str,
    details: dict[str, Any] | None = None,
) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO ussd_actions(phone, ward_id, action_type, details_json, created_at) VALUES(?,?,?,?,?)",
            (phone, ward_id, action_type, json.dumps(details or {}), time.time()),
        )
        return int(cur.lastrowid)


def issue_voucher(phone: str, ward_id: str) -> dict[str, Any]:
    code = f"ALMA-{ward_id[:3].upper()}-{secrets.token_hex(3).upper()}"
    now = time.time()
    with _conn() as c:
        c.execute(
            "INSERT INTO vouchers(code, phone, ward_id, status, created_at) VALUES(?,?,?,?,?)",
            (code, phone, ward_id, "issued", now),
        )
    log_action(phone, ward_id, "voucher_issued", {"code": code, "status": "issued"})
    return {"code": code, "phone": phone, "ward_id": ward_id, "status": "issued", "created_at": now}


def get_voucher(code: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM vouchers WHERE code=?", (code.upper(),)).fetchone()
    if not row:
        # try exact
        with _conn() as c:
            row = c.execute("SELECT * FROM vouchers WHERE code=?", (code,)).fetchone()
    if not row:
        return None
    return dict(row)


def redeem_voucher(code: str) -> dict[str, Any]:
    v = get_voucher(code)
    if not v:
        return {"ok": False, "error": "not_found"}
    if v["status"] == "redeemed":
        return {"ok": False, "error": "already_redeemed", "voucher": v}
    now = time.time()
    with _conn() as c:
        c.execute(
            "UPDATE vouchers SET status='redeemed', redeemed_at=? WHERE code=?",
            (now, v["code"]),
        )
    v["status"] = "redeemed"
    v["redeemed_at"] = now
    log_action(v.get("phone"), v.get("ward_id"), "voucher_redeemed", {"code": v["code"]})
    return {"ok": True, "voucher": v}


def list_vouchers(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM vouchers ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_cash_request(phone: str, amount_kes: int = 2000, details: dict[str, Any] | None = None) -> dict[str, Any]:
    ref = f"CASH-{secrets.token_hex(4).upper()}"
    now = time.time()
    payload = {
        "mode": "stk_demo",
        "note": "Logged for demo — wire AT M-Pesa STK/B2C for live payouts",
        **(details or {}),
    }
    with _conn() as c:
        c.execute(
            "INSERT INTO cash_requests(ref, phone, amount_kes, status, details_json, created_at) VALUES(?,?,?,?,?,?)",
            (ref, phone, amount_kes, "stk_queued", json.dumps(payload), now),
        )
    log_action(phone, details.get("ward_id") if details else None, "cash_stk_queued", {
        "ref": ref,
        "amount_kes": amount_kes,
        **payload,
    })
    return {
        "ref": ref,
        "phone": phone,
        "amount_kes": amount_kes,
        "status": "stk_queued",
        "created_at": now,
        "details": payload,
    }


def list_actions(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM ussd_actions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["details"] = json.loads(d.pop("details_json") or "{}")
        out.append(d)
    return out


def list_ground_truth(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM ground_truth ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["parsed"] = json.loads(d.pop("parsed_json") or "{}")
        out.append(d)
    return out


def list_cash_requests(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM cash_requests ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["details"] = json.loads(d.pop("details_json") or "{}")
        out.append(d)
    return out


def log_sos_request(
    phone: str,
    *,
    channel: str,
    message_body: str,
    community: str | None = None,
    ward_id: str | None = None,
    dedupe_window_s: float = 300.0,
) -> dict[str, Any]:
    """
    Log SOS with 5-minute de-duplication per phone.
    Confirmation replies are sent by the caller on every inbound SOS;
    this only manages dashboard queue entries.
    """
    now = time.time()
    cutoff = now - float(dedupe_window_s)
    channel = str(channel or "unknown").strip().upper()
    message_body = str(message_body or "")[:500]
    community = str(community).strip() if community else None
    ward_id = str(ward_id).strip() if ward_id else None

    with _conn() as c:
        existing = c.execute(
            """
            SELECT * FROM sos_queue
            WHERE phone=? AND status!='resolved' AND last_received_at>=?
            ORDER BY last_received_at DESC
            LIMIT 1
            """,
            (phone, cutoff),
        ).fetchone()

        if existing:
            row = dict(existing)
            existing_id = int(row["id"])
            existing_channels = {p for p in str(row.get("channels") or "").split(",") if p}
            existing_channels.add(channel)
            merged_channels = ",".join(sorted(existing_channels))
            resent_count = int(row.get("resent_count") or 0) + 1
            c.execute(
                """
                UPDATE sos_queue
                SET community=?, ward_id=?, channels=?, message_body=?,
                    last_received_at=?, resent_count=?, updated_at=?
                WHERE id=?
                """,
                (
                    community or row.get("community"),
                    ward_id or row.get("ward_id"),
                    merged_channels,
                    message_body,
                    now,
                    resent_count,
                    now,
                    existing_id,
                ),
            )
            updated = c.execute("SELECT * FROM sos_queue WHERE id=?", (existing_id,)).fetchone()
            return dict(updated)

        c.execute(
            """
            INSERT INTO sos_queue(
              phone, community, ward_id, channels, message_body,
              first_received_at, last_received_at, resent_count, status,
              created_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,0,'new',?,?)
            """,
            (phone, community, ward_id, channel, message_body, now, now, now, now),
        )
        new_id = int(c.execute("SELECT last_insert_rowid()").fetchone()[0])
        created = c.execute("SELECT * FROM sos_queue WHERE id=?", (new_id,)).fetchone()
        return dict(created)


def list_sos_queue(limit: int = 50, *, include_resolved: bool = False) -> list[dict[str, Any]]:
    """
    Default open queue excludes resolved (including pending check-in).
    Escalation tick uses include_resolved=True to see check-in silence.
    """
    order = """
      ORDER BY
        CASE status
          WHEN 'reopened' THEN 0
          WHEN 'new' THEN 1
          WHEN 'being_handled' THEN 2
          ELSE 3
        END,
        last_received_at DESC
      LIMIT ?
    """
    with _conn() as c:
        if include_resolved:
            rows = c.execute(f"SELECT * FROM sos_queue {order}", (limit,)).fetchall()
        else:
            rows = c.execute(
                f"SELECT * FROM sos_queue WHERE status!='resolved' {order}",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def get_sos(sos_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
    return dict(row) if row else None


def get_sos_pending_checkin(phone: str) -> dict[str, Any] | None:
    phone = (phone or "").strip()
    if not phone:
        return None
    with _conn() as c:
        row = c.execute(
            """
            SELECT * FROM sos_queue
            WHERE phone=? AND status='resolved' AND check_in_response='pending'
            ORDER BY check_in_sent_at DESC
            LIMIT 1
            """,
            (phone,),
        ).fetchone()
    return dict(row) if row else None


def set_sos_status(
    sos_id: int,
    status: str,
    *,
    acknowledged_by: str | None = None,
    trigger_checkin: bool = False,
) -> dict[str, Any] | None:
    status = str(status or "").strip().lower()
    if status not in ("new", "being_handled", "resolved", "reopened"):
        return None
    now = time.time()
    with _conn() as c:
        row = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
        if not row:
            return None
        existing = dict(row)
        ack_by = acknowledged_by or existing.get("acknowledged_by")
        ack_at = existing.get("acknowledged_at")
        resolved_at = existing.get("resolved_at")
        check_in = existing.get("check_in_response")
        check_in_sent = existing.get("check_in_sent_at")

        if status == "being_handled":
            ack_by = acknowledged_by or "desk_operator"
            ack_at = now
        if status == "resolved":
            resolved_at = now
            if trigger_checkin:
                check_in = "pending"
                check_in_sent = now

        c.execute(
            """
            UPDATE sos_queue
            SET status=?, updated_at=?, acknowledged_by=?, acknowledged_at=?,
                resolved_at=?, check_in_response=?, check_in_sent_at=?
            WHERE id=?
            """,
            (
                status,
                now,
                ack_by,
                ack_at,
                resolved_at,
                check_in,
                check_in_sent,
                int(sos_id),
            ),
        )
        updated = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
    return dict(updated) if updated else None


def set_sos_checkin(sos_id: int, response: str) -> dict[str, Any] | None:
    """response: yes | no | no_reply"""
    response = str(response or "").strip().lower()
    if response not in ("yes", "no", "no_reply"):
        return None
    now = time.time()
    with _conn() as c:
        # YES closes the case; NO/silence reopen is handled by reopen_sos
        status = "resolved" if response == "yes" else None
        if status:
            c.execute(
                """
                UPDATE sos_queue
                SET check_in_response=?, updated_at=?, status=?
                WHERE id=?
                """,
                (response, now, status, int(sos_id)),
            )
        else:
            c.execute(
                """
                UPDATE sos_queue
                SET check_in_response=?, updated_at=?
                WHERE id=?
                """,
                (response, now, int(sos_id)),
            )
        row = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
    return dict(row) if row else None


def reopen_sos(sos_id: int, *, reason: str) -> dict[str, Any] | None:
    now = time.time()
    reason = str(reason or "no")[:80]
    check_in = "no_reply" if reason == "no_reply" else "no"
    with _conn() as c:
        c.execute(
            """
            UPDATE sos_queue
            SET status='reopened', reopened_at=?, reopen_reason=?,
                check_in_response=?, updated_at=?, last_received_at=?
            WHERE id=?
            """,
            (now, reason, check_in, now, now, int(sos_id)),
        )
        row = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
    return dict(row) if row else None


def bump_sos_escalation(sos_id: int) -> dict[str, Any] | None:
    now = time.time()
    with _conn() as c:
        c.execute(
            """
            UPDATE sos_queue
            SET escalation_count=COALESCE(escalation_count,0)+1, updated_at=?
            WHERE id=?
            """,
            (now, int(sos_id)),
        )
        row = c.execute("SELECT * FROM sos_queue WHERE id=?", (int(sos_id),)).fetchone()
    return dict(row) if row else None


def add_dam_observation(
    *,
    reporter: str | None = None,
    release_m3s: float | None = None,
    fill_percent: float | None = None,
    spillway_status: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    now = time.time()
    spill = (spillway_status or "").strip().lower() or None
    if spill not in (None, "closed", "partial", "open"):
        spill = None
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO dam_observations(reporter, release_m3s, fill_percent, spillway_status, notes, created_at)
            VALUES(?,?,?,?,?,?)
            """,
            (reporter, release_m3s, fill_percent, spill, notes, now),
        )
        row_id = int(cur.lastrowid)
        row = c.execute("SELECT * FROM dam_observations WHERE id=?", (row_id,)).fetchone()
    out = dict(row) if row else {"id": row_id, "created_at": now}
    return out


def latest_dam_observation() -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM dam_observations ORDER BY created_at DESC LIMIT 1",
        ).fetchone()
    return dict(row) if row else None


def list_dam_observations(limit: int = 20) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM dam_observations ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# --- Farmer readiness / NGO dispatch helpers ---

def upsert_farmer(profile: dict[str, Any]) -> dict[str, Any]:
    phone = str(profile.get("phoneNumber") or profile.get("phone") or "").strip()
    if not phone:
        raise ValueError("farmer phone required")
    now = time.time()
    profile = {**profile, "phoneNumber": phone, "updatedAt": now}
    with _conn() as c:
        c.execute(
            """
            INSERT INTO farmers(phone, profile_json, updated_at) VALUES(?,?,?)
            ON CONFLICT(phone) DO UPDATE SET profile_json=excluded.profile_json, updated_at=excluded.updated_at
            """,
            (phone, json.dumps(profile), now),
        )
    return profile


def get_farmer(phone: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute("SELECT profile_json FROM farmers WHERE phone=?", (phone,)).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["profile_json"])
    except json.JSONDecodeError:
        return None


def list_farmers() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT profile_json FROM farmers ORDER BY updated_at DESC").fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            out.append(json.loads(r["profile_json"]))
        except json.JSONDecodeError:
            continue
    return out


def set_last_reached_via(ward_id: str, via: str) -> None:
    with _conn() as c:
        c.execute(
            """
            INSERT INTO community_reach(ward_id, last_reached_via, updated_at) VALUES(?,?,?)
            ON CONFLICT(ward_id) DO UPDATE SET last_reached_via=excluded.last_reached_via, updated_at=excluded.updated_at
            """,
            (ward_id, via, time.time()),
        )


def list_community_reach() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT ward_id, last_reached_via, updated_at FROM community_reach ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def record_risk_tier(region_id: str, tier: str, compound_active: bool) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO tier_history(region_id, tier, compound, at) VALUES(?,?,?,?)",
            (region_id, tier, 1 if compound_active else 0, time.time()),
        )


def had_severe_or_compound(region_id: str, within_s: float = 72 * 3600) -> bool:
    cutoff = time.time() - within_s
    with _conn() as c:
        row = c.execute(
            """
            SELECT 1 FROM tier_history
            WHERE region_id=? AND at>=? AND (compound=1 OR tier='severe')
            LIMIT 1
            """,
            (region_id, cutoff),
        ).fetchone()
    return bool(row)


def severe_or_compound_hours(region_id: str, within_s: float = 72 * 3600) -> float:
    cutoff = time.time() - within_s
    now = time.time()
    with _conn() as c:
        rows = c.execute(
            "SELECT tier, compound, at FROM tier_history WHERE region_id=? AND at>=? ORDER BY at ASC",
            (region_id, cutoff),
        ).fetchall()
    if not rows:
        return 0.0
    hours = 0.0
    for i, row in enumerate(rows):
        start = float(row["at"])
        end = float(rows[i + 1]["at"]) if i + 1 < len(rows) else now
        if int(row["compound"]) == 1 or row["tier"] == "severe":
            hours += max(0.0, (end - start) / 3600.0)
    return round(hours, 2)


def recovery_eligible(region_id: str) -> bool:
    return severe_or_compound_hours(region_id) >= 6.0


def mark_post_risk_transition(region_id: str, event_phase: str) -> bool:
    # Demo stub — real transition tracking can be layered later.
    _ = (region_id, event_phase)
    return False


def log_recovery_interest(
    phone: str,
    ward_id: str,
    *,
    community: str | None = None,
    region_id: str | None = None,
) -> None:
    with _conn() as c:
        c.execute(
            """
            INSERT INTO recovery_interest(phone, ward_id, community, region_id, created_at)
            VALUES(?,?,?,?,?)
            """,
            (phone, ward_id, community, region_id, time.time()),
        )


def list_recovery_interest(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM recovery_interest ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


ACK_WINDOW_S = 24 * 3600


def record_ground_check_sent(phone: str, channel: str = "sms") -> int:
    """IVR/SMS ground check dispatched to a community member."""
    now = time.time()
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO ground_checks(phone, channel, sent_at, created_at)
            VALUES(?,?,?,?)
            """,
            (phone, channel, now, now),
        )
        return int(cur.lastrowid)


def record_ground_check_response(phone: str, channel: str = "ussd", within_s: float = ACK_WINDOW_S) -> bool:
    """Mark the latest unmatched check as responded (timely if within window)."""
    now = time.time()
    with _conn() as c:
        row = c.execute(
            """
            SELECT id, sent_at FROM ground_checks
            WHERE phone=? AND responded_at IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (phone,),
        ).fetchone()
        if not row:
            return False
        sent_at = float(row["sent_at"] or now)
        timely = 1 if (now - sent_at) <= within_s else 0
        c.execute(
            """
            UPDATE ground_checks
            SET responded_at=?, timely=?
            WHERE id=?
            """,
            (now, timely, row["id"]),
        )
        return True


def verification_stats(phone: str) -> dict[str, int]:
    with _conn() as c:
        sent = c.execute(
            "SELECT COUNT(*) AS n FROM ground_checks WHERE phone=? AND sent_at IS NOT NULL",
            (phone,),
        ).fetchone()["n"]
        timely = c.execute(
            "SELECT COUNT(*) AS n FROM ground_checks WHERE phone=? AND timely=1",
            (phone,),
        ).fetchone()["n"]
        responded = c.execute(
            "SELECT COUNT(*) AS n FROM ground_checks WHERE phone=? AND responded_at IS NOT NULL",
            (phone,),
        ).fetchone()["n"]
    return {
        "checks_sent": int(sent or 0),
        "timely_responses": int(timely or 0),
        "responded": int(responded or 0),
    }


def count_ground_truth_for_phone(phone: str) -> int:
    with _conn() as c:
        row = c.execute(
            "SELECT COUNT(*) AS n FROM ground_truth WHERE phone=?",
            (phone,),
        ).fetchone()
    return int(row["n"] or 0) if row else 0


def save_eligibility_audit(phone: str, audit: dict[str, Any]) -> None:
    with _conn() as c:
        c.execute(
            """
            INSERT INTO recovery_eligibility_audit(phone, region_id, flag, audit_json, created_at)
            VALUES(?,?,?,?,?)
            """,
            (
                phone,
                audit.get("region_id"),
                1 if audit.get("recovery_eligibility_flag") else 0,
                json.dumps(audit),
                time.time(),
            ),
        )


def latest_eligibility_audit(phone: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            """
            SELECT audit_json FROM recovery_eligibility_audit
            WHERE phone=? ORDER BY created_at DESC LIMIT 1
            """,
            (phone,),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["audit_json"])
    except json.JSONDecodeError:
        return None


# --- Ground observers + ICPAC settings ---

def upsert_ground_observer(profile: dict[str, Any]) -> dict[str, Any]:
    phone = str(profile.get("phoneNumber") or profile.get("phone") or "").strip()
    if not phone:
        raise ValueError("observer phone required")
    now = time.time()
    existing = get_ground_observer(phone)
    merged = {**(existing or {}), **profile, "phoneNumber": phone, "updatedAt": now}
    if "createdAt" not in merged:
        merged["createdAt"] = now
    verified = 1 if merged.get("verified") else 0
    with _conn() as c:
        c.execute(
            """
            INSERT INTO ground_observers(phone, profile_json, verified, updated_at) VALUES(?,?,?,?)
            ON CONFLICT(phone) DO UPDATE SET
              profile_json=excluded.profile_json,
              verified=excluded.verified,
              updated_at=excluded.updated_at
            """,
            (phone, json.dumps(merged), verified, now),
        )
    return merged


def get_ground_observer(phone: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            "SELECT profile_json, verified FROM ground_observers WHERE phone=?",
            (phone,),
        ).fetchone()
    if not row:
        return None
    try:
        data = json.loads(row["profile_json"] or "{}")
    except json.JSONDecodeError:
        return None
    data["verified"] = bool(row["verified"] or data.get("verified"))
    return data


def set_ground_observer_verified(phone: str, verified: bool) -> dict[str, Any] | None:
    row = get_ground_observer(phone)
    if not row:
        return None
    row["verified"] = bool(verified)
    return upsert_ground_observer(row)


def list_ground_observers() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT profile_json, verified FROM ground_observers ORDER BY updated_at DESC"
        ).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        try:
            data = json.loads(r["profile_json"] or "{}")
            data["verified"] = bool(r["verified"] or data.get("verified"))
            out.append(data)
        except json.JSONDecodeError:
            continue
    return out


def add_ground_observer_report(payload: dict[str, Any]) -> dict[str, Any]:
    now = time.time()
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO ground_observer_reports(
              phone, organization_id, report_type, value, verified_observer,
              source, raw_text, needs_review, registered_location, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?)
            """,
            (
                payload.get("phoneNumber"),
                payload.get("organizationId"),
                payload.get("reportType"),
                payload.get("value"),
                1 if payload.get("verifiedObserver") else 0,
                payload.get("source"),
                payload.get("rawText"),
                1 if payload.get("needsReview") else 0,
                payload.get("registeredLocation"),
                now,
            ),
        )
        row_id = int(cur.lastrowid)
    return {
        "id": row_id,
        "phoneNumber": payload.get("phoneNumber"),
        "organizationId": payload.get("organizationId"),
        "reportType": payload.get("reportType"),
        "value": payload.get("value"),
        "verifiedObserver": bool(payload.get("verifiedObserver")),
        "source": payload.get("source"),
        "rawText": payload.get("rawText"),
        "needsReview": bool(payload.get("needsReview")),
        "registeredLocation": payload.get("registeredLocation"),
        "createdAt": now,
    }


def list_ground_observer_reports(limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """
            SELECT * FROM ground_observer_reports
            ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "phoneNumber": r["phone"],
                "organizationId": r["organization_id"],
                "reportType": r["report_type"],
                "value": r["value"],
                "verifiedObserver": bool(r["verified_observer"]),
                "source": r["source"],
                "rawText": r["raw_text"],
                "needsReview": bool(r["needs_review"]),
                "registeredLocation": r["registered_location"],
                "createdAt": r["created_at"],
            }
        )
    return out


def get_app_setting(key: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            "SELECT value_json FROM app_settings WHERE key=?",
            (key,),
        ).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["value_json"] or "{}")
    except json.JSONDecodeError:
        return None


def set_app_setting(key: str, value: dict[str, Any]) -> None:
    with _conn() as c:
        c.execute(
            """
            INSERT INTO app_settings(key, value_json, updated_at) VALUES(?,?,?)
            ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
            """,
            (key, json.dumps(value), time.time()),
        )


# --- Voice / Alma conversation sessions (IVR + desk sim) ---

MAX_VOICE_QA_TURNS = 4


def _ensure_voice_conv_table(c: sqlite3.Connection) -> None:
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS voice_conversations (
          session_id TEXT PRIMARY KEY,
          phone TEXT,
          ward_id TEXT,
          lang TEXT,
          sector TEXT,
          state TEXT NOT NULL,
          turn_count INTEGER NOT NULL DEFAULT 0,
          conversation_json TEXT NOT NULL DEFAULT '[]',
          scripted_guidance TEXT,
          started_at REAL NOT NULL,
          updated_at REAL NOT NULL
        )
        """
    )


def save_voice_conversation(
    session_id: str,
    *,
    phone: str = "",
    ward_id: str | None = None,
    lang: str = "sw",
    sector: str | None = None,
    state: str = "menu",
    turn_count: int = 0,
    conversation_context: list | None = None,
    scripted_guidance: str | None = None,
    started_at: float | None = None,
) -> dict[str, Any]:
    now = time.time()
    sid = (session_id or "").strip() or f"voice-{secrets.token_hex(6)}"
    with _conn() as c:
        _ensure_voice_conv_table(c)
        existing = c.execute(
            "SELECT started_at FROM voice_conversations WHERE session_id=?", (sid,)
        ).fetchone()
        start = float(started_at or (existing["started_at"] if existing else now))
        c.execute(
            """
            INSERT INTO voice_conversations(
              session_id, phone, ward_id, lang, sector, state, turn_count,
              conversation_json, scripted_guidance, started_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(session_id) DO UPDATE SET
              phone=excluded.phone,
              ward_id=excluded.ward_id,
              lang=excluded.lang,
              sector=excluded.sector,
              state=excluded.state,
              turn_count=excluded.turn_count,
              conversation_json=excluded.conversation_json,
              scripted_guidance=excluded.scripted_guidance,
              updated_at=excluded.updated_at
            """,
            (
                sid,
                phone,
                ward_id,
                lang,
                sector,
                state,
                int(turn_count),
                json.dumps(conversation_context or []),
                scripted_guidance,
                start,
                now,
            ),
        )
    return get_voice_conversation(sid) or {
        "session_id": sid,
        "phone": phone,
        "ward_id": ward_id,
        "lang": lang,
        "sector": sector,
        "state": state,
        "turn_count": turn_count,
        "conversation_context": conversation_context or [],
        "scripted_guidance": scripted_guidance,
        "started_at": start,
    }


def get_voice_conversation(session_id: str) -> dict[str, Any] | None:
    sid = (session_id or "").strip()
    if not sid:
        return None
    with _conn() as c:
        _ensure_voice_conv_table(c)
        row = c.execute(
            "SELECT * FROM voice_conversations WHERE session_id=?", (sid,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    try:
        ctx = json.loads(d.pop("conversation_json") or "[]")
    except json.JSONDecodeError:
        ctx = []
    return {
        "session_id": d["session_id"],
        "phone": d.get("phone"),
        "ward_id": d.get("ward_id"),
        "lang": d.get("lang"),
        "sector": d.get("sector"),
        "state": d.get("state"),
        "turn_count": int(d.get("turn_count") or 0),
        "conversation_context": ctx,
        "scripted_guidance": d.get("scripted_guidance"),
        "started_at": d.get("started_at"),
        "updated_at": d.get("updated_at"),
    }


def clear_voice_conversation(session_id: str) -> None:
    sid = (session_id or "").strip()
    if not sid:
        return
    with _conn() as c:
        _ensure_voice_conv_table(c)
        c.execute("DELETE FROM voice_conversations WHERE session_id=?", (sid,))


def create_voice_outbound(
    *,
    phone: str,
    ward_id: str,
    community: str,
    message: str,
    sector: str,
    lang: str,
    tier: str,
    client_request_id: str,
) -> dict[str, Any]:
    """Minimal outbound call queue row for voice_outbound service."""
    now = time.time()
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS voice_outbound (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              phone TEXT NOT NULL,
              ward_id TEXT,
              community TEXT,
              message TEXT,
              sector TEXT,
              lang TEXT,
              tier TEXT,
              client_request_id TEXT,
              at_session_id TEXT,
              created_at REAL NOT NULL
            )
            """
        )
        c.execute(
            """
            INSERT INTO voice_outbound(
              phone, ward_id, community, message, sector, lang, tier, client_request_id, created_at
            ) VALUES(?,?,?,?,?,?,?,?,?)
            """,
            (phone, ward_id, community, message, sector, lang, tier, client_request_id, now),
        )
        oid = int(c.execute("SELECT last_insert_rowid()").fetchone()[0])
    return {"id": oid, "client_request_id": client_request_id, "phone": phone}


def bind_voice_session(outbound_id: int, at_session_id: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE voice_outbound SET at_session_id=? WHERE id=?",
            (at_session_id, int(outbound_id)),
        )
