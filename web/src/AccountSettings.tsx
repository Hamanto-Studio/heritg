import { Cloud, LogOut, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AccountAuthError,
  deleteAccount,
  getAccountSession,
  getLoginMaterial,
  loadGoogleIdentity,
  loginWithGoogle,
  logoutAccount,
  readCsrfCookie,
  type AccountSession,
  type GoogleIdentity,
  type LoginMaterial
} from "./accountAuth";
import type { Translator } from "./i18n";
import type { AppData } from "./types";
import { ButtonLoader } from "./ui";

type Status = "checking" | "anonymous" | "preparing" | "ready" | "signingIn" | "authenticated" | "loggingOut" | "deleting" | "error";
type ActionError = "logout" | "delete";

interface AccountSettingsProps {
  language: AppData["language"];
  t: Translator;
  googleClientId?: string;
}

export function AccountSettings({ language, t, googleClientId = __GOOGLE_CLIENT_ID__ }: AccountSettingsProps) {
  const [initialCsrfToken] = useState(readCsrfCookie);
  const csrfToken = useRef<string | undefined>(initialCsrfToken);
  const [status, setStatus] = useState<Status>(initialCsrfToken ? "checking" : "anonymous");
  const [session, setSession] = useState<AccountSession>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<ActionError>();
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
      if (!mounted.current) return;
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
    if (status !== "ready" || !googleButton.current || !googleIdentity.current) return;
    googleButton.current.replaceChildren();
    googleIdentity.current.accounts.id.renderButton(googleButton.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      width: 260,
      locale: language === "id" ? "id" : "en"
    });
  }, [language, status]);

  const prepareGoogle = async () => {
    if (!googleClientId) {
      setStatus("error");
      return;
    }
    setStatus("preparing");
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
      setStatus("ready");
    } catch {
      if (mounted.current && !controller.signal.aborted) setStatus("error");
    }
  };

  const completeGoogleLogin = async (credential: string) => {
    if (!mounted.current) return;
    const material = loginMaterial.current;
    loginMaterial.current = undefined;
    if (!material) return;
    setStatus("signingIn");
    const controller = nextRequest();
    try {
      const result = await loginWithGoogle(credential, material, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      csrfToken.current = result.csrfToken;
      setSession({ accountId: result.accountId, expiresAt: result.expiresAt });
      setStatus("authenticated");
      window.dispatchEvent(new Event("heritg:account-session-changed"));
    } catch {
      if (mounted.current && !controller.signal.aborted) setStatus("error");
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
          <button className="button secondary" onClick={() => void prepareGoogle()} type="button">
            {t("accountPrepare")}
          </button>
        ) : null}
        {status === "preparing" || status === "ready" || status === "signingIn" ? (
          <div className="google-sign-in">
            <div aria-label={t("accountGoogleButton")} ref={googleButton} />
            {status === "preparing" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountPreparing")}</p> : null}
            {status === "signingIn" ? <p aria-live="polite" className="account-status" role="status"><ButtonLoader /> {t("accountSigningIn")}</p> : null}
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
            <p>{googleClientId ? t("accountError") : t("accountUnavailable")}</p>
            <button className="button secondary" onClick={() => void checkSession()} type="button">
              {t("accountRetry")}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
