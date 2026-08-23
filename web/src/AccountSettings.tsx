import { Cloud, LogOut, Mail, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AccountAuthError,
  deleteAccount,
  getAccountSession,
  getLoginMaterial,
  isConservativeEmail,
  loadGoogleIdentity,
  loginWithGoogle,
  logoutAccount,
  maskEmail,
  readCsrfCookie,
  requestEmailLogin,
  type AccountSession,
  type GoogleIdentity,
  type LoginMaterial
} from "./accountAuth";
import type { Translator } from "./i18n";
import type { AppData } from "./types";
import { ButtonLoader } from "./ui";

type Status = "checking" | "anonymous" | "authenticated" | "loggingOut" | "deleting" | "error";
type EmailStatus = "idle" | "sending" | "sent" | "error";
type GoogleStatus = "idle" | "preparing" | "ready" | "signingIn" | "error";
type ActionError = "logout" | "delete";
const EMAIL_RESEND_SECONDS = 60;
class EmailCooldownState {
  private deadline = 0;

  remaining() {
    return Math.max(0, Math.ceil((this.deadline - Date.now()) / 1_000));
  }

  start(seconds: number) {
    this.deadline = Math.max(this.deadline, Date.now() + seconds * 1_000);
    return this.remaining();
  }
}

export const createEmailCooldownState = () => new EmailCooldownState();
const sharedEmailCooldown = createEmailCooldownState();

interface AccountSettingsProps {
  language: AppData["language"];
  t: Translator;
  googleClientId?: string;
  cooldownState?: EmailCooldownState;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 18 18">
      <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.258c-.806.54-1.836.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.169.281-1.707V4.961H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.039l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.579c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.961l3.007 2.332C4.672 5.164 6.656 3.579 9 3.579Z" fill="#EA4335" />
    </svg>
  );
}

export function AccountSettings({
  language,
  t,
  googleClientId = __GOOGLE_CLIENT_ID__,
  cooldownState = sharedEmailCooldown
}: AccountSettingsProps) {
  const [initialCsrfToken] = useState(readCsrfCookie);
  const csrfToken = useRef<string | undefined>(initialCsrfToken);
  const [status, setStatus] = useState<Status>(initialCsrfToken ? "checking" : "anonymous");
  const [session, setSession] = useState<AccountSession>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<ActionError>();
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string>();
  const [cooldown, setCooldown] = useState(() => cooldownState.remaining());
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>("idle");
  const requestedEmail = useRef<string | undefined>(undefined);
  const loginMaterial = useRef<LoginMaterial | undefined>(undefined);
  const googleIdentity = useRef<GoogleIdentity | undefined>(undefined);
  const googleButton = useRef<HTMLDivElement>(null);
  const deleteConfirmation = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);

  const nextRequest = () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return controller;
  };

  const clearEmailMemory = () => {
    requestedEmail.current = undefined;
    setEmail("");
    setMaskedEmail(undefined);
    setEmailInvalid(false);
    setEmailStatus("idle");
  };

  const startCooldown = (seconds: number) => {
    setCooldown(cooldownState.start(seconds));
  };

  const checkSession = async () => {
    setStatus("checking");
    const controller = nextRequest();
    try {
      const current = await getAccountSession(controller.signal);
      if (!mounted.current) return;
      csrfToken.current = readCsrfCookie();
      clearEmailMemory();
      setSession(current);
      setStatus("authenticated");
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (error instanceof AccountAuthError && error.status === 401) {
        setSession(undefined);
        setStatus("anonymous");
      } else {
        setStatus("error");
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    const token = csrfToken.current;
    if (token) {
      const controller = new AbortController();
      activeRequest.current = controller;
      void getAccountSession(controller.signal)
        .then((current) => {
          if (!mounted.current || controller.signal.aborted) return;
          csrfToken.current = readCsrfCookie();
          clearEmailMemory();
          setSession(current);
          setStatus("authenticated");
        })
        .catch((error: unknown) => {
          if (!mounted.current || controller.signal.aborted) return;
          if (error instanceof AccountAuthError && error.status === 401) {
            setSession(undefined);
            setStatus("anonymous");
          } else {
            setStatus("error");
          }
        });
    }
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      loginMaterial.current = undefined;
      requestedEmail.current = undefined;
      csrfToken.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (confirmingDelete) deleteConfirmation.current?.focus();
  }, [confirmingDelete]);

  useEffect(() => {
    if (googleStatus !== "ready" || !googleButton.current || !googleIdentity.current) return;
    googleButton.current.replaceChildren();
    googleIdentity.current.accounts.id.renderButton(googleButton.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      width: 300,
      text: "continue_with",
      locale: language === "id" ? "id" : "en"
    });
  }, [googleStatus, language]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const update = () => setCooldown(cooldownState.remaining());
    const timer = window.setInterval(update, 1_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [cooldown, cooldownState]);

  const sendEmail = async (address: string) => {
    setEmailStatus("sending");
    setEmailInvalid(false);
    const controller = nextRequest();
    try {
      await requestEmailLogin(address, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      requestedEmail.current = address;
      setMaskedEmail(maskEmail(address));
      setEmail("");
      startCooldown(EMAIL_RESEND_SECONDS);
      setEmailStatus("sent");
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      if (error instanceof AccountAuthError && error.status === 429 && error.retryAfterSeconds !== undefined) {
        startCooldown(error.retryAfterSeconds);
      }
      setEmailStatus("error");
    }
  };

  const submitEmail = () => {
    if (cooldownState.remaining() > 0) {
      setCooldown(cooldownState.remaining());
      return;
    }
    const address = email.trim();
    if (!isConservativeEmail(address)) {
      setEmailInvalid(true);
      setEmailStatus("idle");
      return;
    }
    void sendEmail(address);
  };

  const resendEmail = () => {
    const address = requestedEmail.current;
    if (!address || cooldownState.remaining() > 0 || emailStatus === "sending") return;
    void sendEmail(address);
  };

  const prepareGoogle = async () => {
    if (!googleClientId) {
      setGoogleStatus("error");
      return;
    }
    setGoogleStatus("preparing");
    const controller = nextRequest();
    try {
      const [material, google] = await Promise.all([
        getLoginMaterial(controller.signal),
        loadGoogleIdentity()
      ]);
      if (!mounted.current || controller.signal.aborted) return;
      loginMaterial.current = material;
      googleIdentity.current = google;
      google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: material.nonce,
        auto_select: false,
        ux_mode: "popup",
        use_fedcm_for_button: true,
        callback: ({ credential }) => {
          if (credential) void completeGoogleLogin(credential);
        }
      });
      setGoogleStatus("ready");
    } catch {
      if (mounted.current && !controller.signal.aborted) setGoogleStatus("error");
    }
  };

  const completeGoogleLogin = async (credential: string) => {
    if (!mounted.current) return;
    const material = loginMaterial.current;
    loginMaterial.current = undefined;
    if (!material) return;
    setGoogleStatus("signingIn");
    const controller = nextRequest();
    try {
      const result = await loginWithGoogle(credential, material, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      csrfToken.current = result.csrfToken;
      clearEmailMemory();
      setSession({ accountId: result.accountId, expiresAt: result.expiresAt });
      setStatus("authenticated");
      window.dispatchEvent(new Event("heritg:account-session-changed"));
    } catch {
      if (mounted.current && !controller.signal.aborted) setGoogleStatus("error");
    }
  };

  const logout = async () => {
    const token = csrfToken.current ?? readCsrfCookie();
    if (!token) {
      setStatus("error");
      return;
    }
    setActionError(undefined);
    setStatus("loggingOut");
    const controller = nextRequest();
    try {
      await logoutAccount(token, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      googleIdentity.current?.accounts.id.disableAutoSelect();
      csrfToken.current = undefined;
      setSession(undefined);
      clearEmailMemory();
      setGoogleStatus("idle");
      setStatus("anonymous");
      window.dispatchEvent(new Event("heritg:account-session-changed"));
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setActionError("logout");
        setStatus("authenticated");
      }
    }
  };

  const removeAccount = async () => {
    const token = csrfToken.current ?? readCsrfCookie();
    if (!token) {
      setStatus("error");
      return;
    }
    setActionError(undefined);
    setConfirmingDelete(false);
    setStatus("deleting");
    const controller = nextRequest();
    try {
      await deleteAccount(token, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      googleIdentity.current?.accounts.id.disableAutoSelect();
      csrfToken.current = undefined;
      setSession(undefined);
      clearEmailMemory();
      setGoogleStatus("idle");
      setStatus("anonymous");
      window.dispatchEvent(new Event("heritg:account-session-changed"));
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        setActionError("delete");
        setStatus("authenticated");
      }
    }
  };

  return (
    <div className="settings-group">
      <h3>{t("account")}</h3>
      <section className="settings-card account-settings">
        <div className="settings-card-header">
          <Cloud aria-hidden="true" size={23} />
          <div>
            <strong>{t("accountOptional")}</strong>
            <p className="settings-detail">{t("accountDescription")}</p>
          </div>
        </div>

        {status === "checking" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountChecking")}</p> : null}
        {status === "anonymous" ? (
          <div className="account-sign-in">
            <div className="account-google-primary">
              {googleStatus === "idle" ? (
                <button className="button account-google-button" onClick={() => void prepareGoogle()} type="button">
                  <GoogleMark /> {t("accountPrepare")}
                </button>
              ) : null}
              {googleStatus === "preparing" || googleStatus === "ready" || googleStatus === "signingIn" ? (
                <div className="google-sign-in">
                  <div aria-label={t("accountGoogleButton")} ref={googleButton} />
                  {googleStatus === "preparing" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountPreparing")}</p> : null}
                  {googleStatus === "signingIn" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountSigningIn")}</p> : null}
                </div>
              ) : null}
              {googleStatus === "error" ? <p className="danger-text" role="alert">{googleClientId ? t("accountGoogleError") : t("accountUnavailable")}</p> : null}
            </div>
            <div className="account-method-divider"><span>{t("accountEmailAlternative")}</span></div>
            <form onSubmit={(event) => {
              event.preventDefault();
              submitEmail();
            }}>
              <label className="field" htmlFor="account-email">
                <span>{t("accountEmail")}</span>
                <input
                  aria-describedby={emailInvalid ? "account-email-error" : undefined}
                  aria-invalid={emailInvalid || undefined}
                  autoComplete="email"
                  disabled={emailStatus === "sending"}
                  id="account-email"
                  inputMode="email"
                  maxLength={254}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailInvalid(false);
                  }}
                  required
                  type="email"
                  value={email}
                />
              </label>
              {emailInvalid ? <p className="danger-text" id="account-email-error" role="alert">{t("accountEmailInvalid")}</p> : null}
              <button className="button primary" disabled={emailStatus === "sending" || cooldown > 0} type="submit">
                {emailStatus === "sending" ? <ButtonLoader /> : <Mail aria-hidden="true" size={16} />}
                {cooldown > 0 && emailStatus !== "sent"
                  ? t("accountEmailRetryWait", { seconds: cooldown })
                  : t("accountEmailContinue")}
              </button>
            </form>
            <div aria-atomic="true" aria-live="polite" className="account-email-status" role="status">
              {emailStatus === "sending" ? <p>{t("accountEmailSending")}</p> : null}
              {emailStatus === "sent" ? <p>{maskedEmail
                ? t("accountEmailSentMasked", { email: maskedEmail })
                : t("accountEmailSent")}</p> : null}
              {emailStatus === "error" ? <p className="danger-text">{t("accountEmailError")}</p> : null}
            </div>
            {emailStatus === "sent" ? (
              <button className="button secondary" disabled={cooldown > 0} onClick={resendEmail} type="button">
                {cooldown > 0 ? t("accountEmailResendWait", { seconds: cooldown }) : t("accountEmailResend")}
              </button>
            ) : null}
            <p className="settings-detail account-provider-note">{t("accountProvidersSeparate")}</p>
          </div>
        ) : null}
        {status === "authenticated" && session ? (
          <div className="account-session">
            <p><strong>{t("accountSignedIn")}</strong><br />{t("accountSessionExpiry", {
              date: new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en", { dateStyle: "medium" })
                .format(new Date(session.expiresAt))
            })}</p>
            {actionError ? <p className="danger-text" role="alert">{t(actionError === "logout" ? "accountLogoutError" : "accountDeleteError")}</p> : null}
            <div className="account-session-actions">
              <button className="button secondary" onClick={() => void logout()} type="button">
                <LogOut aria-hidden="true" size={16} /> {t("accountLogout")}
              </button>
              <button className="button secondary danger-text" onClick={() => setConfirmingDelete(true)} type="button">
                <Trash2 aria-hidden="true" size={16} /> {t("accountDelete")}
              </button>
            </div>
            {confirmingDelete ? (
              <div aria-label={t("accountDelete")} className="account-delete-confirmation" ref={deleteConfirmation} role="alertdialog" tabIndex={-1}>
                <p>{t("accountDeleteWarning")}</p>
                <div className="account-session-actions">
                  <button className="button secondary" onClick={() => setConfirmingDelete(false)} type="button">
                    {t("cancel")}
                  </button>
                  <button className="button danger" onClick={() => void removeAccount()} type="button">
                    {t("accountDeleteConfirm")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {status === "loggingOut" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountLoggingOut")}</p> : null}
        {status === "deleting" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountDeleting")}</p> : null}
        {status === "error" ? (
          <div className="account-error" role="alert">
            <p>{t("accountError")}</p>
            <button className="button secondary" onClick={() => void checkSession()} type="button">
              {t("accountRetry")}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
