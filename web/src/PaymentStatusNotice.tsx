import { Check, Clock3, X } from "lucide-react";
import type { Translator } from "./i18n";
import type { ProContextValue } from "./proTypes";

export function PaymentStatusNotice({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const payment = pro.payment;
  if (!payment) return null;
  const confirmed = payment.status === "confirmed";
  const title = confirmed ? t("paymentConfirmed") : payment.status === "signedOut" ? t("paymentSignIn") : t("paymentPending");
  const detail = confirmed ? t("paymentConfirmedDetail") : payment.status === "signedOut" ? t("paymentSignInDetail") :
    payment.status === "failed" || payment.status === "expired" ? t("paymentNotCompleted") :
    payment.status === "unavailable" ? t("paymentUnavailable") : t("paymentPendingDetail");
  return <section aria-label={t("paymentStatus")} className="payment-status-notice">
    {confirmed ? <Check aria-hidden="true" size={22} /> : <Clock3 aria-hidden="true" size={22} />}
    <div className="payment-status-copy" role="status" aria-live="polite"><strong>{title}</strong><p>{detail}</p>
      {!confirmed && payment.status !== "signedOut" ? <button className="button secondary" disabled={payment.checking} onClick={() => void pro.refreshPayment?.()} type="button">{payment.checking ? t("paymentChecking") : t("paymentCheckAgain")}</button> : null}
    </div>
    <button aria-label={t("close")} className="icon-button" onClick={pro.dismissPayment} type="button"><X aria-hidden="true" size={18} /></button>
  </section>;
}
