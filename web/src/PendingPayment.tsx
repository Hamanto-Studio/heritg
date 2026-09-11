import { useState } from "react";
import type { Translator } from "./i18n";
import type { ProContextValue, ProOffer } from "./proTypes";
import { ButtonLoader } from "./ui";

export const planLabel = (plan: ProOffer["planId"], t: Translator) => t(plan === "six_month" ? "familyPreviewSixMonths" : plan === "three_year" ? "familyPreviewThreeYears" : plan === "yearly" ? "familyPreviewYearly" : plan === "monthly" ? "familyPlanMonthly" : plan === "weekly" ? "familyPlanWeekly" : "familyPlanTwoYear");

export function PendingPayment({ pro, t, selectedPlan }: { pro: ProContextValue; t: Translator; selectedPlan?: ProOffer["planId"] }) {
  const [confirming, setConfirming] = useState(false);
  const payment = pro.payment;
  if (!payment || !["pending", "unavailable", "signedOut"].includes(payment.status)) return null;
  const changing = selectedPlan && payment.planId && selectedPlan !== payment.planId;
  const busy = Boolean(pro.paymentAction) || payment.checking || pro.account.status !== "signedIn";
  const canResume = payment.resumable === true;
  const canCancel = payment.cancellable === true;
  const detail = payment.status === "signedOut" ? "paymentSignInDetail" : payment.status === "unavailable" ? "paymentUnavailable" :
    canResume ? "paymentAwaitingDetail" : payment.resumable === false ? "paymentLinkUnavailable" : "paymentRecoveryChecking";
  return <section className="pending-payment" aria-labelledby="pending-payment-title">
    <h3 id="pending-payment-title">{t("paymentAwaiting")}{payment.planId ? ` · ${planLabel(payment.planId, t)}` : ""}</h3>
    <p role="status">{t(detail)}</p>
    {payment.status !== "signedOut" && payment.cancellable === false ? <p>{t("paymentCancellationUnavailable")}</p> : null}
    {changing ? <p>{t(canCancel ? "paymentChangePlan" : "paymentChangePlanWait", { plan: planLabel(selectedPlan, t) })}</p> : null}
    {payment.status !== "signedOut" ? <div className="payment-actions">
      {canResume ? <button className="button primary" disabled={busy || !pro.resumePayment} onClick={() => void pro.resumePayment?.()} type="button">{pro.paymentAction === "resuming" ? <ButtonLoader /> : null}{t("paymentResume")}</button> : null}
      <button className="button secondary" disabled={busy} onClick={() => void pro.refreshPayment?.()} type="button">{payment.checking ? t("paymentChecking") : t("paymentCheckAgain")}</button>
      {canCancel && !confirming ? <button className="button secondary" disabled={busy || !pro.cancelPayment} onClick={() => { pro.clearError(); setConfirming(true); }} type="button">{t("paymentCancel")}</button> : null}
    </div> : null}
    {confirming && canCancel && payment.status !== "signedOut" ? <div className="payment-cancel-confirmation">
      <p>{t("paymentCancelConfirm")}</p>
      <div className="payment-actions">
        <button className="button danger" disabled={busy || !pro.cancelPayment} onClick={() => void pro.cancelPayment?.().finally(() => setConfirming(false))} type="button">{pro.paymentAction === "cancelling" ? <ButtonLoader /> : null}{t("paymentCancelConfirmAction")}</button>
        <button className="button secondary" disabled={busy} onClick={() => setConfirming(false)} type="button">{t("paymentKeep")}</button>
      </div>
    </div> : null}
  </section>;
}
