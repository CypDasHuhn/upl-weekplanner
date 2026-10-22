import { ref } from "vue";

export type SessionState = "checking" | "anonymous" | "authenticated" | "offline";

const state = ref<SessionState>("checking");
const error = ref<string | null>(null);

async function check(): Promise<void> {
  state.value = "checking";
  error.value = null;

  try {
    const response = await fetch("/auth/me", { credentials: "same-origin" });
    state.value = response.ok ? "authenticated" : "anonymous";
  } catch (caught) {
    state.value = "offline";
    error.value = message(caught);
  }
}

async function login(token: string): Promise<boolean> {
  error.value = null;

  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });

    if (!response.ok) {
      state.value = "anonymous";
      error.value = response.status === 401 ? "Invalid token" : `Login failed (${response.status})`;
      return false;
    }

    state.value = "authenticated";
    return true;
  } catch (caught) {
    state.value = "offline";
    error.value = message(caught);
    return false;
  }
}

async function logout(): Promise<void> {
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    state.value = "anonymous";
    error.value = null;
    return;
  }
  state.value = "anonymous";
  error.value = null;
}

function expire(): void {
  state.value = "anonymous";
  error.value = "Session expired. Sign in again.";
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export const session = { state, error, check, login, logout, expire };
