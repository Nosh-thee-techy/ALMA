"""Farmer readiness portal APIs — phone + PIN (demo auth)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import farmer_readiness

router = APIRouter(tags=["farmer"])


class FarmerRegisterIn(BaseModel):
    phone: str
    pin: str = Field(..., min_length=4, max_length=4)
    community: str = "Kalokol"
    cropTypes: list[str] | None = None
    livestockTypes: list[str] | None = None
    fisheryTypes: list[str] | None = None
    sectorRoles: list[str] | None = None
    # Frontend readiness portal historically sent snake_case
    crop_types: list[str] | None = None
    livestock_types: list[str] | None = None
    fishery_types: list[str] | None = None
    sector_roles: list[str] | None = None


class FarmerLoginIn(BaseModel):
    phone: str
    pin: str = Field(..., min_length=4, max_length=4)


class FarmerCompleteIn(BaseModel):
    phone: str
    itemId: str | None = None
    item_id: str | None = None
    completed: bool = True


class FarmerRecoveryIn(BaseModel):
    phone: str


@router.get("/api/farmer/profile")
def farmer_profile(phone: str):
    return farmer_readiness.get_public_by_phone(phone)


@router.post("/api/farmer/register")
def farmer_register(body: FarmerRegisterIn):
    crops = body.cropTypes if body.cropTypes is not None else body.crop_types
    livestock = body.livestockTypes if body.livestockTypes is not None else body.livestock_types
    fishery = body.fisheryTypes if body.fisheryTypes is not None else body.fishery_types
    roles = body.sectorRoles if body.sectorRoles is not None else body.sector_roles
    result = farmer_readiness.register_farmer(
        body.phone,
        body.pin,
        body.community,
        crops,
        livestock,
        fishery,
        roles,
    )
    if isinstance(result, dict):
        result = {
            **result,
            "sos_speed_dial_guidance": (
                "Save this number as contact 9. In an emergency, hold down 9 "
                "to call/text instantly."
            ),
        }
    return result


@router.post("/api/farmer/login")
def farmer_login(body: FarmerLoginIn):
    return farmer_readiness.login_farmer(body.phone, body.pin)


@router.post("/api/farmer/complete")
def farmer_complete(body: FarmerCompleteIn):
    item_id = body.itemId or body.item_id
    if not item_id:
        return {"ok": False, "error": "item_id_required"}
    return farmer_readiness.complete_item(body.phone, item_id, body.completed)


class FarmerAlmaSpeakIn(BaseModel):
    phone: str
    topic: str = "home"
    taskId: str | None = None
    task_id: str | None = None
    lang: str = "en"
    include_audio: bool = True


@router.post("/api/farmer/alma-speak")
def farmer_alma_speak(body: FarmerAlmaSpeakIn):
    """Alma speaks After facts — Gemma/Featherless translate, ElevenLabs voice."""
    return farmer_readiness.alma_speak(
        body.phone,
        topic=body.topic or "home",
        task_id=body.taskId or body.task_id,
        lang=body.lang or "en",
        include_audio=body.include_audio,
    )
