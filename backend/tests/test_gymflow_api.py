"""GymFlow backend API integration tests."""
import time
from datetime import date, timedelta

import pytest
import requests


# ───────── Health ─────────
class TestHealth:
    def test_health(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200


# ───────── Auth ─────────
class TestAuth:
    def test_signup_seeds_plans_and_returns_token(self, api_client, base_url):
        ts = int(time.time() * 1000)
        payload = {
            "gym_name": "TEST_Gym_Signup",
            "owner_name": "Alice",
            "mobile": "+15550100001",
            "email": f"TEST_signup_{ts}@test.com",
            "password": "TestPass123!",
        }
        r = api_client.post(f"{base_url}/api/auth/signup", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert data["user"]["email"] == payload["email"].lower()
        assert data["gym"]["name"] == payload["gym_name"]
        assert data["gym"]["onboarding_complete"] is False
        # verify 4 default plans seeded
        token = data["access_token"]
        plans = api_client.get(f"{base_url}/api/plans", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(plans) == 4
        names = {p["name"] for p in plans}
        assert names == {"Monthly", "Quarterly", "Half Yearly", "Annual"}

    def test_signup_duplicate_email_400(self, api_client, base_url, gym_a):
        r = api_client.post(f"{base_url}/api/auth/signup", json=gym_a["payload"])
        assert r.status_code == 400

    def test_login_success(self, api_client, base_url, gym_a):
        r = api_client.post(f"{base_url}/api/auth/login", json={
            "email": gym_a["payload"]["email"],
            "password": gym_a["payload"]["password"],
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_bad_password_401(self, api_client, base_url, gym_a):
        r = api_client.post(f"{base_url}/api/auth/login", json={
            "email": gym_a["payload"]["email"],
            "password": "WrongPassword!",
        })
        assert r.status_code == 401

    def test_me_requires_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token(self, api_client, base_url, gym_a):
        r = api_client.get(f"{base_url}/api/auth/me",
                           headers={"Authorization": f"Bearer {gym_a['token']}"})
        assert r.status_code == 200
        assert r.json()["user"]["email"] == gym_a["payload"]["email"].lower()


# ───────── Forgot/Reset ─────────
class TestPasswordReset:
    def test_forgot_password_generic_and_reset_flow(self, api_client, base_url, gym_a):
        import subprocess
        r = api_client.post(f"{base_url}/api/auth/forgot-password",
                            json={"email": gym_a["payload"]["email"]})
        assert r.status_code == 200
        assert "message" in r.json()
        # Grab token from backend log
        time.sleep(0.5)
        log = subprocess.run(
            ["tail", "-n", "200", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True,
        ).stdout
        token = None
        for line in reversed(log.splitlines()):
            if gym_a["payload"]["email"].lower() in line and "reset token" in line:
                token = line.rsplit(":", 1)[-1].strip()
                break
        assert token, "reset token not found in backend log"

        new_pw = "NewPass456!"
        rr = api_client.post(f"{base_url}/api/auth/reset-password",
                             json={"token": token, "new_password": new_pw})
        assert rr.status_code == 200, rr.text
        # Login with new password works
        lr = api_client.post(f"{base_url}/api/auth/login",
                             json={"email": gym_a["payload"]["email"], "password": new_pw})
        assert lr.status_code == 200

    def test_forgot_unknown_email_generic_response(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/forgot-password",
                            json={"email": "nobody-xyz@test.com"})
        assert r.status_code == 200

    def test_reset_invalid_token_400(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/reset-password",
                            json={"token": "garbage", "new_password": "abcdef"})
        assert r.status_code == 400


# ───────── Plans CRUD ─────────
class TestPlans:
    def test_list_default_plans(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/plans", headers=auth_headers)
        assert r.status_code == 200
        plans = r.json()
        assert len(plans) == 4
        assert all("active_members" in p for p in plans)

    def test_create_update_delete_plan(self, api_client, base_url, auth_headers):
        # Create
        r = api_client.post(f"{base_url}/api/plans", headers=auth_headers,
                            json={"name": "TEST_Weekly", "duration_days": 7, "price": 500})
        assert r.status_code == 201
        plan = r.json()
        pid = plan["id"]
        assert plan["name"] == "TEST_Weekly"
        # Update
        r2 = api_client.patch(f"{base_url}/api/plans/{pid}", headers=auth_headers,
                              json={"name": "TEST_Weekly2", "duration_days": 8, "price": 600})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Weekly2"
        # Delete
        r3 = api_client.delete(f"{base_url}/api/plans/{pid}", headers=auth_headers)
        assert r3.status_code == 200
        # Confirm gone
        r4 = api_client.delete(f"{base_url}/api/plans/{pid}", headers=auth_headers)
        assert r4.status_code == 404

    def test_delete_plan_in_use_400(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        plan = plans[0]
        # Create a member on this plan
        m = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Member_Inuse",
            "mobile": "+15550100099",
            "plan_id": plan["id"],
            "start_date": date.today().isoformat(),
            "amount_paid": plan["price"],
        })
        assert m.status_code == 201
        # Try to delete plan
        r = api_client.delete(f"{base_url}/api/plans/{plan['id']}", headers=auth_headers)
        assert r.status_code == 400


# ───────── Members ─────────
class TestMembers:
    def test_create_member_calculates_expiry(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")  # 30 days
        start = date.today()
        r = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Active_Member",
            "mobile": "+15550100002",
            "plan_id": monthly["id"],
            "start_date": start.isoformat(),
            "amount_paid": monthly["price"],
        })
        assert r.status_code == 201
        m = r.json()
        assert m["expiry_date"] == (start + timedelta(days=30)).isoformat()
        assert m["status"] == "active"

    def test_member_status_expiring_soon_and_expired(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")
        # expiring soon (5 days out) → start 25 days ago
        r = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Soon",
            "mobile": "+15550100003",
            "plan_id": monthly["id"],
            "start_date": (date.today() - timedelta(days=25)).isoformat(),
            "amount_paid": monthly["price"],
        })
        assert r.status_code == 201
        assert r.json()["status"] == "expiring_soon"
        # expired (start 40 days ago)
        r2 = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Expired",
            "mobile": "+15550100004",
            "plan_id": monthly["id"],
            "start_date": (date.today() - timedelta(days=40)).isoformat(),
            "amount_paid": monthly["price"],
        })
        assert r2.status_code == 201
        assert r2.json()["status"] == "expired"

    def test_list_search_and_filters(self, api_client, base_url, auth_headers):
        # search by name (TEST_Active_Member created earlier exists only if fixture-scoped,
        # but we use auth_headers session fixture which is function-scoped, so create one)
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        p = plans[0]
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Searchable_Bob",
            "mobile": "+15550100777",
            "plan_id": p["id"],
            "start_date": date.today().isoformat(),
            "amount_paid": 0,
        })
        r = api_client.get(f"{base_url}/api/members?q=Searchable", headers=auth_headers)
        assert r.status_code == 200
        results = r.json()
        assert any(m["full_name"] == "TEST_Searchable_Bob" for m in results)
        # filter plan_id
        r2 = api_client.get(f"{base_url}/api/members?plan_id={p['id']}", headers=auth_headers)
        assert r2.status_code == 200
        assert all(m["plan_id"] == p["id"] for m in r2.json())

    def test_get_member_detail_returns_payments(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        p = plans[0]
        c = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Detail",
            "mobile": "+15550100005",
            "plan_id": p["id"],
            "start_date": date.today().isoformat(),
            "amount_paid": p["price"],
        }).json()
        r = api_client.get(f"{base_url}/api/members/{c['id']}", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "member" in data and "payments" in data and "reminders" in data and "renewals" in data
        assert len(data["payments"]) == 1
        assert data["payments"][0]["kind"] == "new"

    def test_renew_active_extends_from_expiry(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")
        # Active member, expires 10 days from now
        m = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_RenewActive",
            "mobile": "+15550100006",
            "plan_id": monthly["id"],
            "start_date": (date.today() - timedelta(days=20)).isoformat(),
            "amount_paid": monthly["price"],
        }).json()
        cur_expiry = date.fromisoformat(m["expiry_date"])
        r = api_client.post(f"{base_url}/api/members/{m['id']}/renew", headers=auth_headers,
                            json={"plan_id": monthly["id"], "amount_paid": monthly["price"]})
        assert r.status_code == 200
        new_exp = date.fromisoformat(r.json()["new_expiry"])
        assert new_exp == cur_expiry + timedelta(days=30)

    def test_renew_expired_starts_today(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")
        m = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_RenewExpired",
            "mobile": "+15550100007",
            "plan_id": monthly["id"],
            "start_date": (date.today() - timedelta(days=40)).isoformat(),
            "amount_paid": monthly["price"],
        }).json()
        r = api_client.post(f"{base_url}/api/members/{m['id']}/renew", headers=auth_headers,
                            json={"plan_id": monthly["id"], "amount_paid": monthly["price"]})
        assert r.status_code == 200
        new_exp = date.fromisoformat(r.json()["new_expiry"])
        assert new_exp == date.today() + timedelta(days=30)

    def test_delete_member_cascades(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        p = plans[0]
        m = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_DeleteMe",
            "mobile": "+15550100008",
            "plan_id": p["id"],
            "start_date": date.today().isoformat(),
            "amount_paid": p["price"],
        }).json()
        # Add a reminder
        api_client.post(f"{base_url}/api/reminders/send", headers=auth_headers,
                        json={"member_id": m["id"], "reminder_type": "custom", "custom_message": "hi"})
        r = api_client.delete(f"{base_url}/api/members/{m['id']}", headers=auth_headers)
        assert r.status_code == 200
        # subsequent GET returns 404
        g = api_client.get(f"{base_url}/api/members/{m['id']}", headers=auth_headers)
        assert g.status_code == 404


# ───────── Expiring buckets ─────────
class TestExpiring:
    def test_expiring_buckets(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")
        # today expiry → start 30 days ago
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Today", "mobile": "+15550100010",
            "plan_id": monthly["id"], "start_date": (date.today() - timedelta(days=30)).isoformat(),
            "amount_paid": 0,
        })
        # upcoming 5 days
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Upcoming", "mobile": "+15550100011",
            "plan_id": monthly["id"], "start_date": (date.today() - timedelta(days=25)).isoformat(),
            "amount_paid": 0,
        })
        # expired
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_ExpA", "mobile": "+15550100012",
            "plan_id": monthly["id"], "start_date": (date.today() - timedelta(days=45)).isoformat(),
            "amount_paid": 0,
        })
        r = api_client.get(f"{base_url}/api/expiring", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "today" in data and "upcoming_7d" in data and "expired" in data
        assert any(m["full_name"] == "TEST_Today" for m in data["today"])
        assert any(m["full_name"] == "TEST_Upcoming" for m in data["upcoming_7d"])
        assert any(m["full_name"] == "TEST_ExpA" for m in data["expired"])


# ───────── Dashboard ─────────
class TestDashboard:
    def test_dashboard_structure(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for key in ["metrics", "growth", "revenue_trend", "expiry_trend",
                    "revenue_by_plan", "reminder_metrics"]:
            assert key in d
        assert len(d["growth"]) == 6
        assert len(d["revenue_trend"]) == 6
        assert len(d["expiry_trend"]) == 4
        m = d["metrics"]
        for k in ["total_members", "active_members", "expiring_soon",
                  "expired_members", "renewals_this_month", "monthly_revenue"]:
            assert k in m


# ───────── Reminders ─────────
class TestReminders:
    def test_run_and_idempotent(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        monthly = next(p for p in plans if p["name"] == "Monthly")
        # Member expiring in exactly 7 days
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Due7", "mobile": "+15550100020",
            "plan_id": monthly["id"], "start_date": (date.today() - timedelta(days=23)).isoformat(),
            "amount_paid": 0,
        })
        # Member expiring in 2 days
        api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Due2", "mobile": "+15550100021",
            "plan_id": monthly["id"], "start_date": (date.today() - timedelta(days=28)).isoformat(),
            "amount_paid": 0,
        })
        r = api_client.post(f"{base_url}/api/reminders/run", headers=auth_headers)
        assert r.status_code == 200
        first_sent = r.json()["sent"]
        assert first_sent >= 2
        # Idempotent - second run skips
        r2 = api_client.post(f"{base_url}/api/reminders/run", headers=auth_headers)
        assert r2.json()["sent"] == 0

    def test_run_respects_reminders_disabled(self, api_client, base_url, auth_headers):
        api_client.patch(f"{base_url}/api/settings", headers=auth_headers,
                         json={"reminders_enabled": False})
        r = api_client.post(f"{base_url}/api/reminders/run", headers=auth_headers)
        assert r.status_code == 200
        assert r.json().get("sent") == 0
        # re-enable
        api_client.patch(f"{base_url}/api/settings", headers=auth_headers,
                         json={"reminders_enabled": True})

    def test_manual_send_and_status_filter(self, api_client, base_url, auth_headers):
        plans = api_client.get(f"{base_url}/api/plans", headers=auth_headers).json()
        p = plans[0]
        m = api_client.post(f"{base_url}/api/members", headers=auth_headers, json={
            "full_name": "TEST_Manual", "mobile": "+15550100030",
            "plan_id": p["id"], "start_date": date.today().isoformat(),
            "amount_paid": 0,
        }).json()
        for rtype in ["upcoming", "today", "expired"]:
            r = api_client.post(f"{base_url}/api/reminders/send", headers=auth_headers,
                                json={"member_id": m["id"], "reminder_type": rtype})
            assert r.status_code == 200
            assert r.json()["status"] in {"sent", "delivered", "failed"}
        r2 = api_client.post(f"{base_url}/api/reminders/send", headers=auth_headers,
                             json={"member_id": m["id"], "reminder_type": "custom",
                                   "custom_message": "Custom hi {member_name}"})
        assert r2.status_code == 200

        lr = api_client.get(f"{base_url}/api/reminders?status_filter=delivered", headers=auth_headers)
        assert lr.status_code == 200
        assert all(x["status"] == "delivered" for x in lr.json())


# ───────── Gym & Settings ─────────
class TestGymSettings:
    def test_patch_gym(self, api_client, base_url, auth_headers):
        r = api_client.patch(f"{base_url}/api/gym", headers=auth_headers,
                             json={"address": "TEST Address 1", "onboarding_complete": True})
        assert r.status_code == 200
        assert r.json()["address"] == "TEST Address 1"
        assert r.json()["onboarding_complete"] is True

    def test_settings_roundtrip(self, api_client, base_url, auth_headers):
        new_days = [7, 3, 1, 0, -2]
        r = api_client.patch(f"{base_url}/api/settings", headers=auth_headers, json={
            "reminder_days": new_days,
            "template_upcoming": "TPL UP {member_name}",
            "whatsapp_access_token": "TEST_TOKEN",
        })
        assert r.status_code == 200
        g = api_client.get(f"{base_url}/api/settings", headers=auth_headers).json()
        assert g["reminder_days"] == new_days
        assert g["template_upcoming"] == "TPL UP {member_name}"
        assert g["whatsapp_access_token"] == "TEST_TOKEN"


# ───────── Push ─────────
class TestPush:
    def test_register_push_returns_201(self, api_client, base_url, auth_headers, gym_a):
        r = api_client.post(f"{base_url}/api/register-push", headers=auth_headers, json={
            "user_id": gym_a["user"]["id"],
            "platform": "ios",
            "device_token": "TEST_DEVICE_TOKEN_ABC",
        })
        # placeholder upstream may 401, but our endpoint should still return 201
        assert r.status_code == 201, r.text


# ───────── Multi-tenant isolation ─────────
class TestMultiTenantIsolation:
    def test_gym_a_cannot_see_gym_b_members(self, api_client, base_url, gym_a, gym_b):
        a_hdr = {"Authorization": f"Bearer {gym_a['token']}", "Content-Type": "application/json"}
        b_hdr = {"Authorization": f"Bearer {gym_b['token']}", "Content-Type": "application/json"}
        # B creates a member
        b_plans = api_client.get(f"{base_url}/api/plans", headers=b_hdr).json()
        b_member = api_client.post(f"{base_url}/api/members", headers=b_hdr, json={
            "full_name": "TEST_B_Secret",
            "mobile": "+15559999999",
            "plan_id": b_plans[0]["id"],
            "start_date": date.today().isoformat(),
            "amount_paid": 0,
        }).json()
        # A lists members - should NOT see B's
        a_list = api_client.get(f"{base_url}/api/members", headers=a_hdr).json()
        assert all(m["full_name"] != "TEST_B_Secret" for m in a_list)
        # A direct GET on B's member ID → 404
        g = api_client.get(f"{base_url}/api/members/{b_member['id']}", headers=a_hdr)
        assert g.status_code == 404
        # A trying to delete B's member → 404
        d = api_client.delete(f"{base_url}/api/members/{b_member['id']}", headers=a_hdr)
        assert d.status_code == 404
        # A trying to renew B's member → 404
        rn = api_client.post(f"{base_url}/api/members/{b_member['id']}/renew", headers=a_hdr,
                             json={"plan_id": b_plans[0]["id"], "amount_paid": 0})
        assert rn.status_code == 404

    def test_plan_isolation(self, api_client, base_url, gym_a, gym_b):
        a_hdr = {"Authorization": f"Bearer {gym_a['token']}", "Content-Type": "application/json"}
        b_hdr = {"Authorization": f"Bearer {gym_b['token']}", "Content-Type": "application/json"}
        b_plans = api_client.get(f"{base_url}/api/plans", headers=b_hdr).json()
        # A tries to update B's plan → 404
        r = api_client.patch(f"{base_url}/api/plans/{b_plans[0]['id']}", headers=a_hdr,
                             json={"name": "HACKED", "duration_days": 1, "price": 0})
        assert r.status_code == 404
        # A tries to delete B's plan → 404
        d = api_client.delete(f"{base_url}/api/plans/{b_plans[0]['id']}", headers=a_hdr)
        assert d.status_code == 404
