"""Shared fixtures for GymFlow backend tests."""
import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set in /app/frontend/.env"


@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture
def api_client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup(client: requests.Session, suffix: str = "") -> dict:
    ts = f"{int(time.time()*1000)}{suffix}"
    payload = {
        "gym_name": f"TEST_Gym_{ts}",
        "owner_name": "TEST Owner",
        "mobile": "+15550100000",
        "email": f"TEST_owner_{ts}@test.com",
        "password": "TestPass123!",
    }
    r = client.post(f"{BASE_URL}/api/auth/signup", json=payload)
    assert r.status_code == 201, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    return {"payload": payload, "token": data["access_token"], "user": data["user"], "gym": data["gym"]}


@pytest.fixture
def gym_a(api_client) -> dict:
    return _signup(api_client, "A")


@pytest.fixture
def gym_b(api_client) -> dict:
    return _signup(api_client, "B")


@pytest.fixture
def auth_headers(gym_a) -> dict:
    return {"Authorization": f"Bearer {gym_a['token']}", "Content-Type": "application/json"}
