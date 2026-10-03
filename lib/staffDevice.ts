// "Remember this device" for the staff login. Supabase keeps the session in
// persistent cookies either way, so a shift that should NOT be remembered is
// marked instead: a flag in localStorage plus a browser-session cookie (no
// expiry - it survives new tabs but not closing the browser). When the flag
// is there and the cookie is gone, the browser was closed since sign-in and
// the panel signs out.

const EPHEMERAL_KEY = "tf-staff-ephemeral";
const ALIVE_COOKIE = "tf-staff-alive";

export function markStaffDevice(remember: boolean) {
  try {
    if (remember) {
      window.localStorage.removeItem(EPHEMERAL_KEY);
    } else {
      window.localStorage.setItem(EPHEMERAL_KEY, "1");
      document.cookie = `${ALIVE_COOKIE}=1; path=/; SameSite=Lax`;
    }
  } catch {
    // Storage disabled - the session simply stays remembered.
  }
}

/** True when the last sign-in asked not to be remembered and the browser
 * has been closed since. */
export function staffDeviceExpired(): boolean {
  try {
    if (window.localStorage.getItem(EPHEMERAL_KEY) !== "1") return false;
    return !document.cookie.split("; ").some((c) => c === `${ALIVE_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function clearStaffDevice() {
  try {
    window.localStorage.removeItem(EPHEMERAL_KEY);
    document.cookie = `${ALIVE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Nothing to clear.
  }
}
