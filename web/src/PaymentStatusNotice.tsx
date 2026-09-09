import { Check, Clock3, X } from "lucide-react";
import type { Translator } from "./i18n";
import type { ProContextValue } from "./proTypes";

export function PaymentStatusNotice({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const payment = pro.payment;
  if (!payment || pro.paymentNoticeHidden || pro.paywallOpen) return null;
  const confirmed = payment.status === "confirmed";
  const terminal = ["failed", "expired", "cancelled"].includes(payment.status);
  const title = confirmed ? t("paymentConfirmed") : payment.status === "cancelled" ? t("paymentCancelled") : terminal ? t("paymentEnded") : payment.status === "signedOut" ? t("paymentSignIn") : payment.checking ? t("paymentChecking") : t("paymentAwaiting");
  const detail = confirmed ? t("paymentConfirmedDetail") : payment.status === "signedOut" ? t("paymentSignInDetail") :
    payment.status === "cancelled" ? t("paymentCancelledDetail") : terminal ? t("paymentNotCompleted") :
    payment.status === "unavailable" ? t("paymentUnavailable") : t("paymentReminderDetail");
  return <section aria-label={t("paymentStatus")} className="payment-status-notice">
    {confirmed ? <Check aria-hidden="true" size={22} /> : <Clock3 aria-hidden="true" size={22} />}
    <div className="payment-status-copy" role="status" aria-live="polite"><strong>{title}</strong><p>{detail}</p>
      {!confirmed && !terminal ? <button className="button secondary" onClick={pro.openPaywall} type="button">{t("paymentView")}</button> : null}
    </div>
    <button aria-label={t("paymentHideReminder")} className="icon-button" onClick={pro.dismissPayment} type="button"><X aria-hidden="true" size={18} /></button>
  </section>;
}
