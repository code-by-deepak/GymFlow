// Centralized API client with auth + tenant scoping.
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL!;
const TOKEN_KEY = "gymflow_token";
const USER_KEY = "gymflow_user";
const GYM_KEY = "gymflow_gym";

export interface User {
  id: string;
  gym_id: string;
  email: string;
  owner_name: string;
  mobile?: string;
  roles: string[];
}
export interface Gym {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  address?: string;
  logo_base64?: string | null;
  onboarding_complete?: boolean;
}

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await storage.secureGet<string>(TOKEN_KEY, "");
  return cachedToken || null;
}

export async function setSession(token: string, user: User, gym: Gym) {
  cachedToken = token;
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(USER_KEY, JSON.stringify(user));
  await storage.setItem(GYM_KEY, JSON.stringify(gym));
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await storage.getItem<string>(USER_KEY, "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getStoredGym(): Promise<Gym | null> {
  const raw = await storage.getItem<string>(GYM_KEY, "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setStoredGym(g: Gym) {
  await storage.setItem(GYM_KEY, JSON.stringify(g));
}

export async function clearSession() {
  cachedToken = null;
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(USER_KEY);
  await storage.removeItem(GYM_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.detail || body.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: any) => request<T>(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: any) => request<T>(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

// Typed helpers
export const authApi = {
  signup: (b: { gym_name: string; owner_name: string; mobile: string; email: string; password: string }) =>
    api.post<{ access_token: string; user: User; gym: Gym }>("/auth/signup", b),
  login: (b: { email: string; password: string }) =>
    api.post<{ access_token: string; user: User; gym: Gym }>("/auth/login", b),
  forgot: (email: string) => api.post<{ message: string; dev_hint?: string }>("/auth/forgot-password", { email }),
  reset: (token: string, new_password: string) => api.post<{ message: string }>("/auth/reset-password", { token, new_password }),
  me: () => api.get<{ user: User; gym: Gym }>("/auth/me"),
};
