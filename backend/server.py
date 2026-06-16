"""GymFlow Backend - Gym Membership SaaS multi-tenant API."""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from typing import Any, List, Literal, Optional

import bcrypt
import httpx
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ───────────────────────── Config ─────────────────────────
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET_KEY"]
JWT_ALG = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
EMERGENT_PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
PUSH_BASE_URL = "https://integrations.emergentagent.com"

logger = logging.getLogger("gymflow")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

# ───────────────────────── Mongo ─────────────────────────
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

gyms = db["gyms"]
users = db["users"]
plans = db["membership_plans"]
members = db["members"]
payments = db["payments"]
renewals = db["renewals"]
reminders = db["reminders"]
settings_col = db["settings"]
reset_tokens = db["password_reset_tokens"]
push_tokens = db["push_tokens"]

# ───────────────────────── App ─────────────────────────
app = FastAPI(title="GymFlow API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": EMERGENT_PUSH_KEY},
    timeout=10.0,
)

# ───────────────────────── Helpers ─────────────────────────
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | date | None) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.replace(microsecond=0).isoformat()
    return dt.isoformat()


def parse_date(s: str) -> date:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).date()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, gym_id: str, roles: List[str]) -> str:
    payload = {
        "sub": user_id,
        "gym_id": gym_id,
        "roles": roles,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def calc_member_status(expiry_iso: str) -> Literal["active", "expiring_soon", "expired"]:
    today = date.today()
    expiry = parse_date(expiry_iso)
    if expiry < today:
        return "expired"
    if (expiry - today).days <= 7:
        return "expiring_soon"
    return "active"


def serialize_member(doc: dict) -> dict:
    """Strip Mongo _id and compute live status."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    if "expiry_date" in out:
        out["status"] = calc_member_status(out["expiry_date"])
    return out


def clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


# ───────────────────────── Auth dep ─────────────────────────
class CurrentUser(BaseModel):
    id: str
    gym_id: str
    email: str
    owner_name: str
    roles: List[str]


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> CurrentUser:
    if not creds or not creds.credentials:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")

    user_id = payload.get("sub")
    gym_id = payload.get("gym_id")
    if not user_id or not gym_id:
        raise HTTPException(401, "Invalid token payload")

    user = await users.find_one({"id": user_id, "gym_id": gym_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return CurrentUser(**user)


# ───────────────────────── Models ─────────────────────────
class SignupBody(BaseModel):
    gym_name: str = Field(min_length=2)
    owner_name: str = Field(min_length=2)
    mobile: str = Field(min_length=6)
    email: EmailStr
    password: str = Field(min_length=6)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenResp(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    gym: dict


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    new_password: str = Field(min_length=6)


class PlanBody(BaseModel):
    name: str
    duration_days: int = Field(gt=0)
    price: float = Field(ge=0)


class MemberBody(BaseModel):
    full_name: str
    mobile: str
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    plan_id: str
    joining_date: Optional[str] = None
    start_date: str  # ISO date
    amount_paid: float = Field(ge=0)
    notes: Optional[str] = None


class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    notes: Optional[str] = None


class RenewBody(BaseModel):
    plan_id: str
    amount_paid: float = Field(ge=0)
    start_date: Optional[str] = None  # if omitted, use today or current expiry+1


class GymUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    logo_base64: Optional[str] = None
    onboarding_complete: Optional[bool] = None


class SettingsBody(BaseModel):
    whatsapp_access_token: Optional[str] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_business_account_id: Optional[str] = None
    reminders_enabled: Optional[bool] = None
    reminder_days: Optional[List[int]] = None  # e.g. [7,2,1,0,-3]
    template_upcoming: Optional[str] = None
    template_today: Optional[str] = None
    template_expired: Optional[str] = None


class SendReminderBody(BaseModel):
    member_id: str
    reminder_type: Literal["upcoming", "today", "expired", "custom"] = "custom"
    custom_message: Optional[str] = None


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ───────────────────────── Defaults ─────────────────────────
DEFAULT_PLANS = [
    {"name": "Monthly", "duration_days": 30, "price": 1500},
    {"name": "Quarterly", "duration_days": 90, "price": 4000},
    {"name": "Half Yearly", "duration_days": 180, "price": 7500},
    {"name": "Annual", "duration_days": 365, "price": 14000},
]

DEFAULT_SETTINGS = {
    "reminders_enabled": True,
    "reminder_days": [7, 2, 1, 0, -3],
    "template_upcoming": (
        "Hello {member_name},\n\n"
        "Your membership at {gym_name} expires on {expiry_date}.\n"
        "Please renew to continue uninterrupted access.\n\n"
        "— {gym_name}"
    ),
    "template_today": (
        "Hi {member_name}, your membership at {gym_name} expires today ({expiry_date}). "
        "Please renew to keep training without a break."
    ),
    "template_expired": (
        "Hi {member_name}, your membership at {gym_name} expired on {expiry_date}. "
        "Please renew to continue your training."
    ),
    "whatsapp_access_token": "",
    "whatsapp_phone_number_id": "",
    "whatsapp_business_account_id": "",
}


# ───────────────────────── Auth routes ─────────────────────────
@api.get("/")
async def root():
    return {"name": "GymFlow API", "status": "ok"}


@api.post("/auth/signup", response_model=TokenResp, status_code=201)
async def signup(body: SignupBody):
    email = body.email.lower()
    if await users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")

    gym_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    ts = now_utc().isoformat()

    gym_doc = {
        "id": gym_id,
        "name": body.gym_name,
        "owner_name": body.owner_name,
        "phone": body.mobile,
        "address": "",
        "logo_base64": None,
        "onboarding_complete": False,
        "created_at": ts,
    }
    user_doc = {
        "id": user_id,
        "gym_id": gym_id,
        "email": email,
        "owner_name": body.owner_name,
        "mobile": body.mobile,
        "password_hash": hash_password(body.password),
        "roles": ["owner"],
        "created_at": ts,
    }
    settings_doc = {"gym_id": gym_id, **DEFAULT_SETTINGS, "updated_at": ts}

    # Seed default plans
    plan_docs = [
        {"id": str(uuid.uuid4()), "gym_id": gym_id, **p, "created_at": ts}
        for p in DEFAULT_PLANS
    ]

    await gyms.insert_one(gym_doc)
    await users.insert_one(user_doc)
    await settings_col.insert_one(settings_doc)
    await plans.insert_many(plan_docs)

    token = create_access_token(user_id, gym_id, ["owner"])
    user_pub = {k: v for k, v in user_doc.items() if k not in {"password_hash", "_id"}}
    return TokenResp(access_token=token, user=user_pub, gym=clean(gym_doc))


@api.post("/auth/login", response_model=TokenResp)
async def login(body: LoginBody):
    user = await users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    gym = await gyms.find_one({"id": user["gym_id"]}, {"_id": 0})
    token = create_access_token(user["id"], user["gym_id"], user.get("roles", ["owner"]))
    user_pub = {k: v for k, v in user.items() if k not in {"password_hash", "_id"}}
    return TokenResp(access_token=token, user=user_pub, gym=gym or {})


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotBody, background_tasks: BackgroundTasks):
    user = await users.find_one({"email": body.email.lower()})
    # Generic response either way
    if user:
        await reset_tokens.delete_many({"user_id": user["id"]})
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        await reset_tokens.insert_one({
            "user_id": user["id"],
            "token_hash": token_hash,
            "expires_at": (now_utc() + timedelta(minutes=30)).isoformat(),
            "created_at": now_utc().isoformat(),
        })
        logger.info(f"[FORGOT_PASSWORD] reset token for {user['email']}: {raw}")
        # In production, dispatch email here.
    return {"message": "If an account exists for that email, a reset link has been sent.", "dev_hint": "Check server logs for reset token (dev only)"}


@api.post("/auth/reset-password")
async def reset_password(body: ResetBody):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    rec = await reset_tokens.find_one({"token_hash": token_hash})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset token")
    if datetime.fromisoformat(rec["expires_at"]) < now_utc():
        await reset_tokens.delete_one({"token_hash": token_hash})
        raise HTTPException(400, "Invalid or expired reset token")
    await users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await reset_tokens.delete_many({"user_id": rec["user_id"]})
    return {"message": "Password reset successful"}


@api.get("/auth/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    gym = await gyms.find_one({"id": user.gym_id}, {"_id": 0})
    return {"user": user.model_dump(), "gym": gym}


# ───────────────────────── Gym/Settings ─────────────────────────
@api.patch("/gym")
async def update_gym(body: GymUpdate, user: CurrentUser = Depends(get_current_user)):
    payload = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if payload:
        await gyms.update_one({"id": user.gym_id}, {"$set": payload})
    gym = await gyms.find_one({"id": user.gym_id}, {"_id": 0})
    return gym


@api.get("/settings")
async def get_settings(user: CurrentUser = Depends(get_current_user)):
    s = await settings_col.find_one({"gym_id": user.gym_id}, {"_id": 0})
    if not s:
        s = {"gym_id": user.gym_id, **DEFAULT_SETTINGS}
        await settings_col.insert_one(s)
        s = await settings_col.find_one({"gym_id": user.gym_id}, {"_id": 0})
    return s


@api.patch("/settings")
async def patch_settings(body: SettingsBody, user: CurrentUser = Depends(get_current_user)):
    payload = body.model_dump(exclude_none=True)
    payload["updated_at"] = now_utc().isoformat()
    await settings_col.update_one({"gym_id": user.gym_id}, {"$set": payload}, upsert=True)
    return await settings_col.find_one({"gym_id": user.gym_id}, {"_id": 0})


# ───────────────────────── Plans ─────────────────────────
@api.get("/plans")
async def list_plans(user: CurrentUser = Depends(get_current_user)):
    docs = await plans.find({"gym_id": user.gym_id}, {"_id": 0}).sort("duration_days", 1).to_list(500)
    # Single aggregation to compute members-per-plan (avoids N+1)
    pipeline = [
        {"$match": {"gym_id": user.gym_id}},
        {"$group": {"_id": "$plan_id", "count": {"$sum": 1}}},
    ]
    counts = {row["_id"]: row["count"] async for row in members.aggregate(pipeline)}
    for d in docs:
        d["active_members"] = counts.get(d["id"], 0)
    return docs


@api.post("/plans", status_code=201)
async def create_plan(body: PlanBody, user: CurrentUser = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "gym_id": user.gym_id,
        "name": body.name,
        "duration_days": body.duration_days,
        "price": body.price,
        "created_at": now_utc().isoformat(),
    }
    await plans.insert_one(doc)
    return clean(doc)


@api.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanBody, user: CurrentUser = Depends(get_current_user)):
    res = await plans.update_one(
        {"id": plan_id, "gym_id": user.gym_id},
        {"$set": body.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Plan not found")
    return await plans.find_one({"id": plan_id}, {"_id": 0})


@api.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, user: CurrentUser = Depends(get_current_user)):
    in_use = await members.count_documents({"gym_id": user.gym_id, "plan_id": plan_id})
    if in_use > 0:
        raise HTTPException(400, f"Plan in use by {in_use} member(s)")
    res = await plans.delete_one({"id": plan_id, "gym_id": user.gym_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Plan not found")
    return {"ok": True}


# ───────────────────────── Members ─────────────────────────
async def _resolve_plan(gym_id: str, plan_id: str) -> dict:
    plan = await plans.find_one({"id": plan_id, "gym_id": gym_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    return plan


@api.post("/members", status_code=201)
async def create_member(body: MemberBody, user: CurrentUser = Depends(get_current_user)):
    plan = await _resolve_plan(user.gym_id, body.plan_id)
    start = parse_date(body.start_date)
    expiry = start + timedelta(days=plan["duration_days"])
    member_id = str(uuid.uuid4())
    ts = now_utc().isoformat()

    doc = {
        "id": member_id,
        "gym_id": user.gym_id,
        "full_name": body.full_name,
        "mobile": body.mobile,
        "gender": body.gender,
        "age": body.age,
        "address": body.address,
        "emergency_contact": body.emergency_contact,
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
        "joining_date": body.joining_date or iso(start),
        "start_date": iso(start),
        "expiry_date": iso(expiry),
        "amount_paid": body.amount_paid,
        "notes": body.notes,
        "created_at": ts,
        "updated_at": ts,
    }
    await members.insert_one(doc)

    # Record payment
    await payments.insert_one({
        "id": str(uuid.uuid4()),
        "gym_id": user.gym_id,
        "member_id": member_id,
        "amount": body.amount_paid,
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
        "kind": "new",
        "paid_at": ts,
    })
    return serialize_member(doc)


@api.get("/members")
async def list_members(
    user: CurrentUser = Depends(get_current_user),
    q: Optional[str] = None,
    status_filter: Optional[Literal["active", "expiring_soon", "expired", "all"]] = "all",
    plan_id: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
    skip: int = 0,
):
    query: dict[str, Any] = {"gym_id": user.gym_id}
    if plan_id:
        query["plan_id"] = plan_id
    if q:
        query["$or"] = [
            {"full_name": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q, "$options": "i"}},
        ]
    docs = await members.find(query, {"_id": 0}).sort("expiry_date", 1).skip(skip).limit(limit).to_list(limit)
    enriched = [serialize_member(d) for d in docs]
    if status_filter and status_filter != "all":
        enriched = [m for m in enriched if m["status"] == status_filter]
    return enriched


@api.get("/members/{member_id}")
async def get_member(member_id: str, user: CurrentUser = Depends(get_current_user)):
    doc = await members.find_one({"id": member_id, "gym_id": user.gym_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Member not found")
    pays = await payments.find({"gym_id": user.gym_id, "member_id": member_id}, {"_id": 0}).sort("paid_at", -1).to_list(200)
    rems = await reminders.find({"gym_id": user.gym_id, "member_id": member_id}, {"_id": 0}).sort("sent_at", -1).to_list(200)
    rens = await renewals.find({"gym_id": user.gym_id, "member_id": member_id}, {"_id": 0}).sort("renewed_at", -1).to_list(200)
    return {"member": serialize_member(doc), "payments": pays, "reminders": rems, "renewals": rens}


@api.patch("/members/{member_id}")
async def update_member(member_id: str, body: MemberUpdate, user: CurrentUser = Depends(get_current_user)):
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(400, "No fields to update")
    payload["updated_at"] = now_utc().isoformat()
    res = await members.update_one({"id": member_id, "gym_id": user.gym_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, "Member not found")
    doc = await members.find_one({"id": member_id, "gym_id": user.gym_id}, {"_id": 0})
    return serialize_member(doc)


@api.delete("/members/{member_id}")
async def delete_member(member_id: str, user: CurrentUser = Depends(get_current_user)):
    res = await members.delete_one({"id": member_id, "gym_id": user.gym_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Member not found")
    await payments.delete_many({"gym_id": user.gym_id, "member_id": member_id})
    await renewals.delete_many({"gym_id": user.gym_id, "member_id": member_id})
    await reminders.delete_many({"gym_id": user.gym_id, "member_id": member_id})
    return {"ok": True}


@api.post("/members/{member_id}/renew")
async def renew_member(member_id: str, body: RenewBody, user: CurrentUser = Depends(get_current_user)):
    member = await members.find_one({"id": member_id, "gym_id": user.gym_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")
    plan = await _resolve_plan(user.gym_id, body.plan_id)

    today = date.today()
    current_expiry = parse_date(member["expiry_date"])
    if body.start_date:
        start = parse_date(body.start_date)
    else:
        # If still active, extend from current expiry; if expired, start today
        start = current_expiry if current_expiry >= today else today
    new_expiry = start + timedelta(days=plan["duration_days"])
    ts = now_utc().isoformat()

    await members.update_one(
        {"id": member_id, "gym_id": user.gym_id},
        {"$set": {
            "plan_id": body.plan_id,
            "plan_name": plan["name"],
            "start_date": iso(start),
            "expiry_date": iso(new_expiry),
            "amount_paid": body.amount_paid,
            "updated_at": ts,
        }},
    )

    renewal_id = str(uuid.uuid4())
    await renewals.insert_one({
        "id": renewal_id,
        "gym_id": user.gym_id,
        "member_id": member_id,
        "member_name": member["full_name"],
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
        "amount": body.amount_paid,
        "previous_expiry": member["expiry_date"],
        "new_expiry": iso(new_expiry),
        "renewed_at": ts,
    })
    await payments.insert_one({
        "id": str(uuid.uuid4()),
        "gym_id": user.gym_id,
        "member_id": member_id,
        "amount": body.amount_paid,
        "plan_id": body.plan_id,
        "plan_name": plan["name"],
        "kind": "renewal",
        "paid_at": ts,
    })

    # Fire push (non-blocking)
    try:
        await _send_push([user.id], {
            "title": "Renewal completed",
            "message": f"{member['full_name']} renewed for {plan['name']}.",
        })
    except Exception as e:
        logger.warning(f"push failed (non-blocking): {e}")

    return {"ok": True, "renewal_id": renewal_id, "new_expiry": iso(new_expiry)}


# ───────────────────────── Expiring / Dashboard ─────────────────────────
@api.get("/expiring")
async def expiring(user: CurrentUser = Depends(get_current_user)):
    docs = await members.find({"gym_id": user.gym_id}, {"_id": 0}).to_list(5000)
    today = date.today()
    today_list, upcoming_list, expired_list = [], [], []
    for d in docs:
        m = serialize_member(d)
        exp = parse_date(m["expiry_date"])
        if exp == today:
            today_list.append(m)
        elif today < exp <= today + timedelta(days=7):
            upcoming_list.append(m)
        elif exp < today:
            expired_list.append(m)
    today_list.sort(key=lambda x: x["expiry_date"])
    upcoming_list.sort(key=lambda x: x["expiry_date"])
    expired_list.sort(key=lambda x: x["expiry_date"], reverse=True)
    return {"today": today_list, "upcoming_7d": upcoming_list, "expired": expired_list}


@api.get("/dashboard")
async def dashboard(user: CurrentUser = Depends(get_current_user)):
    docs = await members.find({"gym_id": user.gym_id}, {"_id": 0}).to_list(20000)
    today = date.today()
    total = len(docs)
    active = expiring_soon = expired = 0
    for d in docs:
        s = calc_member_status(d["expiry_date"])
        if s == "active":
            active += 1
        elif s == "expiring_soon":
            expiring_soon += 1
        else:
            expired += 1

    # Month windows
    first_of_month = today.replace(day=1)
    next_month = (first_of_month + timedelta(days=32)).replace(day=1)
    renewals_month = await renewals.count_documents({
        "gym_id": user.gym_id,
        "renewed_at": {"$gte": first_of_month.isoformat(), "$lt": next_month.isoformat()},
    })
    pays_month = await payments.find({
        "gym_id": user.gym_id,
        "paid_at": {"$gte": first_of_month.isoformat(), "$lt": next_month.isoformat()},
    }, {"_id": 0}).to_list(20000)
    monthly_revenue = sum(p.get("amount", 0) for p in pays_month)

    # Last 6 months series — single aggregation per collection (no N+1)
    # Build the 6 month ranges first
    months: list[tuple[str, str, str]] = []  # (label, start_iso, end_iso)
    for i in range(5, -1, -1):
        mo_idx = today.month - i
        y_adj = today.year
        while mo_idx <= 0:
            mo_idx += 12
            y_adj -= 1
        m_start = date(y_adj, mo_idx, 1)
        n_mo = mo_idx + 1
        n_y = y_adj
        if n_mo > 12:
            n_mo = 1
            n_y += 1
        m_end = date(n_y, n_mo, 1)
        months.append((m_start.strftime("%b"), m_start.isoformat(), m_end.isoformat()))

    window_start = months[0][1]
    window_end = months[-1][2]

    # One query for all 6 months of new members
    member_rows = await members.find(
        {"gym_id": user.gym_id, "created_at": {"$gte": window_start, "$lt": window_end}},
        {"_id": 0, "created_at": 1},
    ).to_list(20000)
    growth_buckets: dict[str, int] = {label: 0 for label, _, _ in months}
    for r in member_rows:
        ca = r.get("created_at", "")
        for label, s, e in months:
            if s <= ca < e:
                growth_buckets[label] += 1
                break

    # One query for all 6 months of payments
    pay_rows = await payments.find(
        {"gym_id": user.gym_id, "paid_at": {"$gte": window_start, "$lt": window_end}},
        {"_id": 0, "paid_at": 1, "amount": 1},
    ).to_list(20000)
    revenue_buckets: dict[str, float] = {label: 0 for label, _, _ in months}
    for r in pay_rows:
        pa = r.get("paid_at", "")
        for label, s, e in months:
            if s <= pa < e:
                revenue_buckets[label] += r.get("amount", 0)
                break

    growth = [{"month": label, "value": growth_buckets[label]} for label, _, _ in months]
    revenue_trend = [{"month": label, "value": revenue_buckets[label]} for label, _, _ in months]

    # Expiry trend next 4 weeks
    expiry_trend = []
    for w in range(4):
        start_w = today + timedelta(days=w * 7)
        end_w = start_w + timedelta(days=7)
        cnt = 0
        for d in docs:
            exp = parse_date(d["expiry_date"])
            if start_w <= exp < end_w:
                cnt += 1
        expiry_trend.append({"label": f"W{w + 1}", "value": cnt})

    # Revenue by plan (last 90 days)
    p90 = (today - timedelta(days=90)).isoformat()
    pays_90 = await payments.find({"gym_id": user.gym_id, "paid_at": {"$gte": p90}}, {"_id": 0}).to_list(20000)
    rev_by_plan: dict[str, float] = {}
    for p in pays_90:
        name = p.get("plan_name", "—")
        rev_by_plan[name] = rev_by_plan.get(name, 0) + p.get("amount", 0)

    # Reminder metrics
    sent = await reminders.count_documents({"gym_id": user.gym_id, "status": {"$in": ["sent", "delivered"]}})
    delivered = await reminders.count_documents({"gym_id": user.gym_id, "status": "delivered"})
    failed = await reminders.count_documents({"gym_id": user.gym_id, "status": "failed"})

    return {
        "metrics": {
            "total_members": total,
            "active_members": active,
            "expiring_soon": expiring_soon,
            "expired_members": expired,
            "renewals_this_month": renewals_month,
            "monthly_revenue": monthly_revenue,
        },
        "growth": growth,
        "revenue_trend": revenue_trend,
        "expiry_trend": expiry_trend,
        "revenue_by_plan": [{"plan": k, "value": v} for k, v in rev_by_plan.items()],
        "reminder_metrics": {"sent": sent, "delivered": delivered, "failed": failed},
    }


# ───────────────────────── Reminders (mocked WhatsApp) ─────────────────────────
async def _mock_whatsapp_send(phone: str, message: str) -> str:
    """Simulate WhatsApp Cloud API send. Returns delivery status."""
    logger.info(f"[MOCK_WA] -> {phone}: {message[:80]}…")
    # 90% delivered, 8% sent, 2% failed
    import random
    r = random.random()
    if r < 0.90:
        return "delivered"
    if r < 0.98:
        return "sent"
    return "failed"


def _render(template: str, member: dict, gym_name: str) -> str:
    return (template
            .replace("{member_name}", member.get("full_name", ""))
            .replace("{expiry_date}", member.get("expiry_date", ""))
            .replace("{gym_name}", gym_name))


@api.get("/reminders")
async def list_reminders(
    user: CurrentUser = Depends(get_current_user),
    limit: int = 200,
    status_filter: Optional[Literal["sent", "delivered", "failed", "all"]] = "all",
):
    q: dict = {"gym_id": user.gym_id}
    if status_filter and status_filter != "all":
        q["status"] = status_filter
    docs = await reminders.find(q, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    return docs


@api.post("/reminders/send")
async def send_reminder_manual(body: SendReminderBody, user: CurrentUser = Depends(get_current_user)):
    member = await members.find_one({"id": body.member_id, "gym_id": user.gym_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")
    gym = await gyms.find_one({"id": user.gym_id}, {"_id": 0})
    sett = await settings_col.find_one({"gym_id": user.gym_id}, {"_id": 0}) or DEFAULT_SETTINGS

    tpl_map = {
        "upcoming": sett.get("template_upcoming", DEFAULT_SETTINGS["template_upcoming"]),
        "today": sett.get("template_today", DEFAULT_SETTINGS["template_today"]),
        "expired": sett.get("template_expired", DEFAULT_SETTINGS["template_expired"]),
    }
    if body.reminder_type == "custom" and body.custom_message:
        message = _render(body.custom_message, member, gym["name"])
    else:
        message = _render(tpl_map.get(body.reminder_type, tpl_map["upcoming"]), member, gym["name"])

    status_val = await _mock_whatsapp_send(member["mobile"], message)
    log = {
        "id": str(uuid.uuid4()),
        "gym_id": user.gym_id,
        "member_id": member["id"],
        "member_name": member["full_name"],
        "phone": member["mobile"],
        "reminder_type": body.reminder_type,
        "message": message,
        "status": status_val,
        "sent_at": now_utc().isoformat(),
        "channel": "whatsapp_mock",
    }
    await reminders.insert_one(log)
    if status_val == "failed":
        try:
            await _send_push([user.id], {"title": "Reminder failed", "message": f"WhatsApp to {member['full_name']} failed."})
        except Exception:
            pass
    return clean(log)


@api.post("/reminders/run")
async def run_reminder_scan(user: CurrentUser = Depends(get_current_user)):
    """Scan members and send due reminders based on settings.reminder_days.
    Idempotency: skip if a reminder of same type for same member was sent today.
    """
    sett = await settings_col.find_one({"gym_id": user.gym_id}, {"_id": 0}) or DEFAULT_SETTINGS
    if not sett.get("reminders_enabled", True):
        return {"sent": 0, "skipped": "reminders disabled"}
    days_cfg = sett.get("reminder_days", DEFAULT_SETTINGS["reminder_days"])
    gym = await gyms.find_one({"id": user.gym_id}, {"_id": 0})
    docs = await members.find({"gym_id": user.gym_id}, {"_id": 0}).to_list(20000)
    today = date.today()
    sent_count = 0

    today_iso = today.isoformat()
    for m in docs:
        exp = parse_date(m["expiry_date"])
        delta = (exp - today).days  # positive = future
        if delta not in days_cfg:
            continue
        if delta > 0:
            r_type = "upcoming"
        elif delta == 0:
            r_type = "today"
        else:
            r_type = "expired"
        # idempotent for today
        existing = await reminders.find_one({
            "gym_id": user.gym_id,
            "member_id": m["id"],
            "reminder_type": r_type,
            "sent_at": {"$gte": today_iso},
        })
        if existing:
            continue
        tpl = sett.get(f"template_{r_type}", DEFAULT_SETTINGS[f"template_{r_type}"])
        message = _render(tpl, m, gym["name"])
        status_val = await _mock_whatsapp_send(m["mobile"], message)
        await reminders.insert_one({
            "id": str(uuid.uuid4()),
            "gym_id": user.gym_id,
            "member_id": m["id"],
            "member_name": m["full_name"],
            "phone": m["mobile"],
            "reminder_type": r_type,
            "message": message,
            "status": status_val,
            "sent_at": now_utc().isoformat(),
            "channel": "whatsapp_mock",
        })
        sent_count += 1
    return {"sent": sent_count}


# ───────────────────────── Push Notifications ─────────────────────────
async def _send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code == 401:
            logger.warning("EMERGENT_PUSH_KEY missing or invalid (push not sent)")
            return
        if resp.status_code >= 500:
            logger.warning(f"Push provider error {resp.status_code}")
            return
        resp.raise_for_status()
    except Exception as e:
        logger.warning(f"send_push exception (non-blocking): {e}")


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: CurrentUser = Depends(get_current_user)):
    # Persist locally for audit (token resolution happens via SuprSend)
    await push_tokens.update_one(
        {"user_id": body.user_id, "platform": body.platform},
        {"$set": {**body.model_dump(), "updated_at": now_utc().isoformat()}},
        upsert=True,
    )
    try:
        resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
        if resp.status_code == 401:
            # In dev the EMERGENT_PUSH_KEY is "placeholder" — upstream rejects with 401.
            # This is expected; locally upserted token remains, and we surface success.
            logger.warning("register-push upstream 401 (placeholder key); local token saved")
        elif resp.status_code >= 500:
            logger.warning(f"register-push upstream {resp.status_code} (non-blocking)")
        else:
            resp.raise_for_status()
    except Exception as e:
        logger.warning(f"register-push relay failed (non-blocking): {e}")
    return {"status": "registered"}


# ───────────────────────── Health & misc ─────────────────────────
@api.get("/health")
async def health():
    return {"status": "ok", "ts": now_utc().isoformat()}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_handler():
    client.close()
    await push_client.aclose()
