"""Parse Africa's Talking Voice XML into JSON for the phone simulator UI."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any


def parse_voice_xml(xml_body: str) -> dict[str, Any]:
    """Extract spoken text and next IVR action from AT <Response> XML."""
    xml_body = (xml_body or "").strip()
    if not xml_body:
        return {
            "text": "",
            "segments": [],
            "needs_digit": False,
            "needs_record": False,
            "record_max_seconds": None,
            "dial_number": None,
            "end_call": True,
            "raw_xml": xml_body,
        }

    try:
        root = ET.fromstring(xml_body)
    except ET.ParseError:
        return {
            "text": "",
            "segments": [],
            "needs_digit": False,
            "needs_record": False,
            "record_max_seconds": None,
            "dial_number": None,
            "end_call": True,
            "raw_xml": xml_body,
            "parse_error": True,
        }

    segments: list[dict[str, str]] = []
    needs_digit = False
    needs_record = False
    record_max: str | None = None
    digit_timeout: str | None = None
    dial_number: str | None = None

    def _walk(node: ET.Element) -> None:
        nonlocal needs_digit, needs_record, record_max, digit_timeout, dial_number
        tag = node.tag.split("}")[-1] if "}" in node.tag else node.tag
        if tag == "Say":
            voice = node.get("voice") or ""
            text = (node.text or "").strip()
            if text:
                segments.append({"type": "say", "text": text, "voice": voice})
        elif tag == "Play":
            url = (node.text or "").strip()
            segments.append({"type": "play", "url": url, "text": "[Audio playback]"})
        elif tag == "GetDigits":
            needs_digit = True
            digit_timeout = node.get("timeout")
            for child in node:
                _walk(child)
        elif tag == "Record":
            needs_record = True
            record_max = node.get("maxLength")
        elif tag == "Dial":
            dial_number = node.get("phoneNumbers") or node.get("phoneNumber")
        for child in node:
            if child.tag.split("}")[-1] not in ("Say", "Play"):
                _walk(child)

    for child in root:
        _walk(child)

    spoken = " ".join(s["text"] for s in segments if s.get("text")).strip()
    spoken = re.sub(r"\s+", " ", spoken)

    end_call = not needs_digit and not needs_record and not dial_number and bool(spoken or not segments)

    return {
        "text": spoken,
        "segments": segments,
        "needs_digit": needs_digit,
        "needs_record": needs_record,
        "digit_timeout": digit_timeout,
        "record_max_seconds": int(record_max) if record_max and record_max.isdigit() else record_max,
        "dial_number": dial_number,
        "end_call": end_call and not needs_digit and not needs_record,
        "raw_xml": xml_body,
    }
