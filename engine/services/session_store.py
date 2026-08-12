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
            """
        )


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
    with _conn() as c:
        if include_resolved:
            rows = c.execute(
                "SELECT * FROM sos_queue ORDER BY last_received_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM sos_queue WHERE status!='resolved' ORDER BY last_received_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def set_sos_status(sos_id: int, status: str) -> dict[str, Any] | None:
    status = str(status or "").strip().lower()
    if status not in ("new", "being_handled", "resolved"):
        return None
    now = time.time()
    with _conn() as c:
        c.execute(
            "UPDATE sos_queue SET status=?, updated_at=? WHERE id=?",
            (status, now, int(sos_id)),
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
