import { LogOut, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AccountAuthError,
  deleteAccount,
  getAccountSession,
  getLoginMaterial,
  loadGoogleIdentity,
  loginWithGoogle,
  logoutAccount,
  notifyAccountSessionChanged,
  readCsrfCookie,
  type AccountSession,
  type GoogleIdentity,
  type LoginMaterial
} from "./accountAuth";
import type { Translator } from "./i18n";
import type { AppData } from "./types";
import { ButtonLoader } from "./ui";

type Status = "checking" | "anonymous" | "authenticated" | "loggingOut" | "deleting" | "error";
type GoogleStatus = "idle" | "preparing" | "ready" | "signingIn" | "error";
type ActionError = "logout" | "delete";

const GOOGLE_REQUEST_TIMEOUT_MS = 20_000;

interface AccountSettingsProps {
  language: AppData["language"];
  t: Translator;
  googleClientId?: string;
}

export function AccountSettings({
  language,
  t,
  googleClientId = __GOOGLE_CLIENT_ID__
}: AccountSettingsProps) {
  const [initialCsrfToken] = useState(readCsrfCookie);
  const csrfToken = useRef<string | undefined>(initialCsrfToken);
  const [status, setStatus] = useState<Status>(initialCsrfToken ? "checking" : "anonymous");
  const [session, setSession] = useState<AccountSession>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<ActionError>();
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>("idle");
  const [googleAttempt, setGoogleAttempt] = useState(0);
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

  const checkSession = async () => {
    setStatus("checking");
    const controller = nextRequest();
    try {
      const current = await getAccountSession(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      csrfToken.current = readCsrfCookie();
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
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      void getAccountSession(controller.signal)
        .then((current) => {
          if (!mounted.current || controller.signal.aborted) return;
          csrfToken.current = readCsrfCookie();
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

  const retryGoogle = () => {
    activeRequest.current?.abort();
    activeRequest.current = undefined;
    loginMaterial.current = undefined;
    googleIdentity.current?.accounts.id.cancel?.();
    googleIdentity.current?.accounts.id.disableAutoSelect();
    googleIdentity.current = undefined;
    googleButton.current?.replaceChildren();
    setGoogleAttempt((current) => current + 1);
    setGoogleStatus("idle");
  };

  useEffect(() => {
    if (status !== "anonymous" || googleStatus !== "idle") return;
    const prepare = async () => {
      if (!googleClientId) {
        setGoogleStatus("error");
        return;
      }
      setGoogleStatus("preparing");
      const controller = nextRequest();
      const timeout = window.setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
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
            if (!credential || !mounted.current) return;
            const currentMaterial = loginMaterial.current;
            loginMaterial.current = undefined;
            if (!currentMaterial) return;
            setGoogleStatus("signingIn");
            const loginController = nextRequest();
            const loginTimeout = window.setTimeout(() => loginController.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
            void loginWithGoogle(credential, currentMaterial, loginController.signal)
              .then((result) => {
                if (!mounted.current || loginController.signal.aborted) return;
                csrfToken.current = result.csrfToken;
                setSession(result);
                setStatus("authenticated");
                notifyAccountSessionChanged();
              })
              .catch(() => {
                if (mounted.current && activeRequest.current === loginController) setGoogleStatus("error");
              })
              .finally(() => window.clearTimeout(loginTimeout));
          }
        });
        setGoogleStatus("ready");
      } catch {
        if (mounted.current && activeRequest.current === controller) setGoogleStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    const timer = window.setTimeout(() => void prepare(), 0);
    return () => window.clearTimeout(timer);
  }, [googleClientId, googleStatus, status]);

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
      setGoogleStatus("idle");
      setStatus("anonymous");
      notifyAccountSessionChanged();
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
      setGoogleStatus("idle");
      setStatus("anonymous");
      notifyAccountSessionChanged();
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
          <UserRound aria-hidden="true" size={23} />
          <div>
            <strong>{t("accountOptional")}</strong>
            <p className="settings-detail">{t("accountDescription")}</p>
          </div>
        </div>

        {status === "checking" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountChecking")}</p> : null}
        {status === "anonymous" ? (
          <div className="account-sign-in">
            <div className="account-google-primary">
              {googleStatus !== "error" ? (
                <div className="google-sign-in">
                  <div aria-label={t("accountGoogleButton")} key={googleAttempt} ref={googleButton} />
                  {googleStatus === "idle" || googleStatus === "preparing" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountPreparing")}</p> : null}
                  {googleStatus === "signingIn" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountSigningIn")}</p> : null}
                </div>
              ) : null}
              {googleStatus === "error" ? <div className="account-google-error">
                <p className="danger-text" role="alert">{googleClientId ? t("accountGoogleError") : t("accountUnavailable")}</p>
                {googleClientId ? <button className="button secondary" onClick={retryGoogle} type="button">{t("accountRetry")}</button> : null}
              </div> : null}
            </div>
          </div>
        ) : null}
        {status === "authenticated" && session ? (
          <div className="account-session">
            {session.name || session.email ? (
              <div className="account-identity">
                {session.name ? <strong>{session.name}</strong> : null}
                {session.email ? <span>{session.email}</span> : null}
              </div>
            ) : null}
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
                  <button className="button secondary" onClick={() => setConfirmingDelete(false)} type="button">{t("cancel")}</button>
                  <button className="button danger" onClick={() => void removeAccount()} type="button">{t("accountDeleteConfirm")}</button>
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
            <button className="button secondary" onClick={() => void checkSession()} type="button">{t("accountRetry")}</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
