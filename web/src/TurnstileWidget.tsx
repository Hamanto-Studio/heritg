import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { Translator } from "./i18n";

export const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(element: HTMLElement, options: {
    sitekey: string;
    action: "email_login";
    language: "en" | "id";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstilePromise: Promise<TurnstileApi> | undefined;

const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstilePromise && document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)) return turnstilePromise;
  turnstilePromise = undefined;
  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
      window.clearTimeout(timeout);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error("Turnstile unavailable"));
    };
    const loaded = () => {
      cleanup();
      if (window.turnstile) resolve(window.turnstile);
      else failed();
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    const timeout = window.setTimeout(failed, 10_000);
    if (!existing) {
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  }).catch((error) => {
    turnstilePromise = undefined;
    throw error;
  });
  turnstilePromise = promise;
  return promise;
};

export function TurnstileWidget({
  language,
  onToken,
  siteKey,
  t
}: {
  language: "en" | "id";
  onToken: Dispatch<SetStateAction<string | undefined>>;
  siteKey: string;
  t: Translator;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(!siteKey);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let active = true;
    let widgetId: string | undefined;
    void loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return;
      widgetId = turnstile.render(container.current, {
        sitekey: siteKey,
        action: "email_login",
        language,
        callback: (token) => {
          setError(false);
          onToken(token);
        },
        "expired-callback": () => onToken(undefined),
        "error-callback": () => {
          onToken(undefined);
          setError(true);
        }
      });
    }).catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [language, onToken, siteKey]);

  return (
    <div className="account-turnstile">
      <div ref={container} />
      {error ? <p className="danger-text" role="alert">{t("accountBotError")}</p> : null}
    </div>
  );
}
