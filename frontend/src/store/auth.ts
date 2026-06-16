// Tiny auth state singleton (no zustand needed).
import { useEffect, useSyncExternalStore } from "react";
import { authApi, clearSession, getStoredGym, getStoredUser, getToken, setSession, setStoredGym, type Gym, type User } from "@/src/api/client";
import { registerForPush } from "@/src/utils/push";

type State = {
  initialized: boolean;
  authenticated: boolean;
  user: User | null;
  gym: Gym | null;
};

let state: State = { initialized: false, authenticated: false, user: null, gym: null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;

async function bootstrap() {
  const [token, user, gym] = await Promise.all([getToken(), getStoredUser(), getStoredGym()]);
  if (token && user && gym) {
    state = { initialized: true, authenticated: true, user, gym };
    registerForPush(user.id);
    // Refresh in the background
    authApi.me().then(({ user: u, gym: g }) => {
      state = { ...state, user: u, gym: g };
      setStoredGym(g);
      notify();
    }).catch(() => { /* token may have expired */ });
  } else {
    state = { initialized: true, authenticated: false, user: null, gym: null };
  }
  notify();
}

export async function signup(body: { gym_name: string; owner_name: string; mobile: string; email: string; password: string }) {
  const res = await authApi.signup(body);
  await setSession(res.access_token, res.user, res.gym);
  state = { initialized: true, authenticated: true, user: res.user, gym: res.gym };
  notify();
  registerForPush(res.user.id);
}
export async function login(email: string, password: string) {
  const res = await authApi.login({ email, password });
  await setSession(res.access_token, res.user, res.gym);
  state = { initialized: true, authenticated: true, user: res.user, gym: res.gym };
  notify();
  registerForPush(res.user.id);
}
export async function logout() {
  await clearSession();
  state = { initialized: true, authenticated: false, user: null, gym: null };
  notify();
}
export function updateGymInState(g: Gym) {
  state = { ...state, gym: g };
  setStoredGym(g);
  notify();
}

export function useAuth(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

let started = false;
export function useAuthBootstrap() {
  useEffect(() => {
    if (!started) { started = true; bootstrap(); }
  }, []);
}
