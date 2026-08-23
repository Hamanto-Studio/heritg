import { CheckCircle2, Link2Off } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountAuthError, type LoginResult } from "./accountAuth";
import type { Translator } from "./i18n";
import { ButtonLoader } from "./ui";

const TOKEN_FRAGMENT_PATTERN = /^#token=([A-Za-z0-9_-]{43})$/u;
const EMAIL_CALLBACK_PATH_PATTERN = /^\/auth\/email\/?$/u;

export interface EmailCallbackEntry {
  isCallback: boolean;
  token?: string;
}

export const prepareEmailCallback = (
  location: Pick<Location, "hash" | "pathname">,
  history: Pick<History, "replaceState" | "state">
): EmailCallbackEntry => {
  if (!EMAIL_CALLBACK_PATH_PATTERN.test(location.pathname)) {
    if (location.pathname.startsWith("/auth/email") && location.hash) {
      history.replaceState(history.state, "", location.pathname);
    }
    return { isCallback: false };
  }
  const match = TOKEN_FRAGMENT_PATTERN.exec(location.hash);
  history.replaceState(history.state, "", "/auth/email");
  return { isCallback: true, token: match?.[1] };
};

type CallbackStatus = "verifying" | "success" | "invalid" | "error";

export function EmailAuthCallback({
  verification,
  t,
  onContinue
}: {
  verification?: Promise<LoginResult>;
  t: Translator;
  onContinue(destination: "app" | "settings"): void;
}) {
  const [status, setStatus] = useState<CallbackStatus>(verification ? "verifying" : "invalid");

  useEffect(() => {
    if (!verification) return;
    let active = true;
    void verification.then(
      () => {
        if (active) setStatus("success");
      },
      (error: unknown) => {
        if (!active) return;
        const invalid = error instanceof AccountAuthError && error.status === 401;
        setStatus(invalid ? "invalid" : "error");
      }
    );
    return () => {
      active = false;
    };
  }, [verification]);

  return (
    <main className="email-callback-screen">
      <section aria-labelledby="email-callback-title" className="email-callback-card">
        <div className="welcome-brand">
          <img alt="" aria-hidden="true" className="brand-mark" height={192} src="/pwa-192.png" width={192} />
          <strong>Heritg</strong>
        </div>
        {status === "verifying" ? (
          <div aria-atomic="true" aria-live="polite" className="email-callback-message" role="status">
            <ButtonLoader size={28} />
            <h1 id="email-callback-title">{t("accountEmailVerifying")}</h1>
            <p>{t("accountEmailVerifyingDetail")}</p>
          </div>
        ) : null}
        {status === "success" ? (
          <div aria-atomic="true" aria-live="polite" className="email-callback-message" role="status">
            <CheckCircle2 aria-hidden="true" className="callback-success" size={32} />
            <h1 id="email-callback-title">{t("accountEmailVerified")}</h1>
            <p>{t("accountEmailVerifiedDetail")}</p>
            <div className="email-callback-actions">
              <button className="button primary" onClick={() => onContinue("app")} type="button">{t("accountEmailOpenApp")}</button>
              <button className="button secondary" onClick={() => onContinue("settings")} type="button">{t("accountEmailOpenSettings")}</button>
            </div>
          </div>
        ) : null}
        {status === "invalid" || status === "error" ? (
          <div aria-atomic="true" aria-live="assertive" className="email-callback-message" role="alert">
            <Link2Off aria-hidden="true" className="danger-text" size={32} />
            <h1 id="email-callback-title">{t(status === "invalid" ? "accountEmailInvalidLink" : "accountEmailVerifyError")}</h1>
            <p>{t(status === "invalid" ? "accountEmailInvalidLinkDetail" : "accountEmailVerifyErrorDetail")}</p>
            <button className="button secondary" onClick={() => onContinue("settings")} type="button">{t("accountEmailOpenSettings")}</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
