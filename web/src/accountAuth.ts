const API_BASE = "/api/v1/auth";
export const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const EMAIL_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const SESSION_CHANGE_EVENT = "heritg:account-session-changed";
const SESSION_CHANGE_STORAGE_KEY = "heritg:account-session-change";
const ERROR_CODES = new Set([
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "service_unavailable"
]);

export interface LoginMaterial {
  nonce: string;
  state: string;
  expiresAt: string;
}

export interface AccountSession {
  accountId: string;
  name: string | null;
  email: string | null;
  expiresAt: string;
}

export interface LoginResult extends AccountSession {
  csrfToken: string;
}

export class AccountAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number
  ) {
    super("Account authentication failed");
    this.name = "AccountAuthError";
  }
}

interface GoogleCredentialResponse {
  credential?: string;
}

export interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        auto_select: false;
        ux_mode: "popup";
        use_fedcm_for_button: true;
        callback(response: GoogleCredentialResponse): void;
      }): void;
      renderButton(element: HTMLElement, options: {
        type: "standard";
        theme: "outline";
        size: "large";
        width: number;
        text: "continue_with";
        locale: "en" | "id";
      }): void;
      cancel?(): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let googleIdentityPromise: Promise<GoogleIdentity> | undefined;

const objectWithExactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const validDate = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const validNullableIdentity = (value: unknown, maximum: number): value is string | null =>
  value === null || (typeof value === "string" && value.length > 0 && value.length <= maximum &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));

const parseLoginMaterial = (value: unknown): LoginMaterial => {
  if (!objectWithExactKeys(value, ["nonce", "state", "expiresAt"]) ||
    typeof value.nonce !== "string" || !TOKEN_PATTERN.test(value.nonce) ||
    typeof value.state !== "string" || !TOKEN_PATTERN.test(value.state) ||
    !validDate(value.expiresAt)) {
    throw new AccountAuthError(502, "invalid_response");
  }
  return { nonce: value.nonce, state: value.state, expiresAt: value.expiresAt };
};

const parseSession = (value: unknown): AccountSession => {
  if (!objectWithExactKeys(value, ["accountId", "name", "email", "expiresAt"]) ||
    typeof value.accountId !== "string" || !ID_PATTERN.test(value.accountId) ||
    !validNullableIdentity(value.name, 200) ||
    !(value.email === null || (validNullableIdentity(value.email, 254) && isConservativeEmail(value.email))) ||
    !validDate(value.expiresAt)) {
    throw new AccountAuthError(502, "invalid_response");
  }
  return { accountId: value.accountId, name: value.name, email: value.email, expiresAt: value.expiresAt };
};

const parseLogin = (value: unknown): LoginResult => {
  if (!objectWithExactKeys(value, ["accountId", "name", "email", "csrfToken", "expiresAt"]) ||
    typeof value.accountId !== "string" || !ID_PATTERN.test(value.accountId) ||
    !validNullableIdentity(value.name, 200) ||
    !(value.email === null || (validNullableIdentity(value.email, 254) && isConservativeEmail(value.email))) ||
    typeof value.csrfToken !== "string" || !TOKEN_PATTERN.test(value.csrfToken) ||
    !validDate(value.expiresAt)) {
    throw new AccountAuthError(502, "invalid_response");
  }
  return { accountId: value.accountId, name: value.name, email: value.email, csrfToken: value.csrfToken, expiresAt: value.expiresAt };
};

const parseEmailRequest = (value: unknown): void => {
  if (!objectWithExactKeys(value, ["status"]) || value.status !== "accepted") {
    throw new AccountAuthError(502, "invalid_response");
  }
};

export const parseRetryAfterSeconds = (value: string | null, now = Date.now()): number | undefined => {
  if (!value) return undefined;
  if (/^\d+$/u.test(value)) return Number(value);
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline)) return undefined;
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
};

const request = async (
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  expectedStatus?: number
): Promise<unknown> => {
  const response = await fetchImpl(path.startsWith("/api/") ? path : `${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer"
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const code = objectWithExactKeys(payload, ["error"]) &&
      objectWithExactKeys(payload.error, ["code", "message"]) &&
      typeof payload.error.code === "string" && ERROR_CODES.has(payload.error.code)
      ? payload.error.code
      : "service_unavailable";
    throw new AccountAuthError(
      response.status,
      code,
      response.status === 429 ? parseRetryAfterSeconds(response.headers.get("retry-after")) : undefined
    );
  }
  if (expectedStatus !== undefined &&
    (response.status !== expectedStatus || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")) {
    throw new AccountAuthError(502, "invalid_response");
  }
  return payload;
};

export const getLoginMaterial = async (
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<LoginMaterial> => parseLoginMaterial(await request("/login-nonce", {
  method: "GET",
  signal
}, fetchImpl));

export const loginWithGoogle = async (
  idToken: string,
  material: Pick<LoginMaterial, "nonce" | "state">,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<LoginResult> => {
  return parseLogin(await request("/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken, nonce: material.nonce, state: material.state }),
    signal
  }, fetchImpl));
};

export const isConservativeEmail = (value: string): boolean => {
  if (value.length > 254 || value !== value.trim() || /[\s\u0000-\u001f\u007f]/u.test(value)) return false;
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length > 64 || !EMAIL_LOCAL_PATTERN.test(local) || local.startsWith(".") ||
    local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => EMAIL_DOMAIN_LABEL_PATTERN.test(label));
};

export const maskEmail = (value: string): string | undefined => {
  if (!isConservativeEmail(value)) return undefined;
  const separator = value.indexOf("@");
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  return `${local[0]}${local.length > 1 ? "***" : "*"}@${domain}`;
};

export const requestEmailLogin = async (
  email: string,
  turnstileToken: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<void> => parseEmailRequest(await request("/email/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, turnstileToken }),
    signal
  }, fetchImpl, 202));

export const verifyEmailLogin = async (
  token: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<LoginResult> => {
  if (!TOKEN_PATTERN.test(token)) throw new AccountAuthError(400, "invalid_request");
  return parseLogin(await request("/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    signal
  }, fetchImpl, 200));
};

export const getAccountSession = async (
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<AccountSession> => parseSession(await request("/session", {
    method: "GET",
    signal
  }, fetchImpl));

export const logoutAccount = async (
  csrfToken: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<void> => {
  const payload = await request("/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: "{}",
    signal
  }, fetchImpl);
  if (!objectWithExactKeys(payload, ["status"]) || payload.status !== "logged_out") {
    throw new AccountAuthError(502, "invalid_response");
  }
};

export const deleteAccount = async (
  csrfToken: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<void> => {
  const payload = await request("/api/v1/account", {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: "{}",
    signal
  }, fetchImpl);
  if (!objectWithExactKeys(payload, ["status"]) || payload.status !== "deleted") {
    throw new AccountAuthError(502, "invalid_response");
  }
};

export const readCsrfCookie = (cookie = document.cookie): string | undefined => {
  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== "__Host-heritg_csrf" && name !== "heritg_csrf") continue;
    try {
      const value = decodeURIComponent(item.slice(separator + 1));
      if (TOKEN_PATTERN.test(value)) return value;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const notifyAccountSessionChanged = (): void => {
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  try {
    window.localStorage.setItem(SESSION_CHANGE_STORAGE_KEY, `${Date.now()}:${Math.random()}`);
  } catch {
    // The same-tab event still keeps this window consistent when storage is unavailable.
  }
};

export const subscribeToAccountSessionChanges = (listener: () => void): (() => void) => {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === SESSION_CHANGE_STORAGE_KEY) listener();
  };
  window.addEventListener(SESSION_CHANGE_EVENT, listener);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, listener);
    window.removeEventListener("storage", storageChanged);
  };
};

export const loadGoogleIdentity = (): Promise<GoogleIdentity> => {
  if (window.google) return Promise.resolve(window.google);
  if (googleIdentityPromise && document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)) {
    return googleIdentityPromise;
  }
  googleIdentityPromise = undefined;

  const promise = new Promise<GoogleIdentity>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      window.clearTimeout(timeout);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new AccountAuthError(503, "identity_unavailable"));
    };
    const loaded = () => {
      cleanup();
      if (window.google) resolve(window.google);
      else failed();
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    const timeout = window.setTimeout(failed, 20_000);
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      document.head.append(script);
    }
  }).catch((error) => {
    googleIdentityPromise = undefined;
    throw error;
  });
  googleIdentityPromise = promise;
  return promise;
};
