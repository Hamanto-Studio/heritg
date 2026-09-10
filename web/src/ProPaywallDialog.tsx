import { useState } from "react";
import { AccountSettings } from "./AccountSettings";
import { PendingPayment } from "./PendingPayment";
import type { AppData } from "./types";
import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import type { Translator } from "./i18n";
import type { ProContextValue, ProOffer } from "./proTypes";
import { ButtonLoader, ErrorNotice, Modal } from "./ui";

const offerFor = (pro: ProContextValue) => "offer" in pro.subscription ? pro.subscription.offer : undefined;
const formattedPrice = (amount: number, currency: string) => new Intl.NumberFormat(
  currency === "IDR" ? "id-ID" : "en-US",
  { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 }
).format(amount);

const offerPrices = (offer: ProOffer | undefined, roundMonthly = false) => {
  if (!offer) return undefined;
  let monthly: string | undefined;
  if (Number.isFinite(offer.accessMonths) && offer.accessMonths > 0) {
    const amount = offer.price.amount / offer.accessMonths;
    // Only simplify the IDR comparison; never round the actual charge or
    // turn a small, nonzero monthly equivalent into a free-price claim.
    const comparison = roundMonthly && offer.price.currency === "IDR" && amount >= 100
      ? Math.round(amount / 100) * 100
      : amount;
    monthly = formattedPrice(comparison, offer.price.currency);
  }
  return { monthly, total: formattedPrice(offer.price.amount, offer.price.currency) };
};

export function ProPaywallDialog({ pro, t, language = "en" }: { pro: ProContextValue; t: Translator; language?: AppData["language"] }) {
  const [selectedPlan, setSelectedPlan] = useState<ProOffer["planId"]>(pro.payment?.planId ?? "six_month");
  const staging = __DEPLOYMENT_ENV__ === "staging";
  const plans = pro.offers?.filter(item => item.planId && (!staging || ["six_month", "yearly", "three_year"].includes(item.planId)));
  const offer = plans?.length ? plans.find(item => item.planId === selectedPlan) ?? plans[0] : staging ? undefined : offerFor(pro);
  const prices = offerPrices(offer);
  const freeAccess = offer?.price.amount === 0 || (!offer && pro.configured && __DEPLOYMENT_ENV__ === "production");
  const purchasing = pro.subscription.status === "purchasing";
  const alreadyActive = freeAccess && (pro.subscription.status === "active" || pro.subscription.status === "readOnly");
  const signedIn = pro.account.status === "signedIn";
  const pending = pro.payment && ["pending", "unavailable", "signedOut"].includes(pro.payment.status);
  const purchaseButton = !signedIn && pro.configured
    ? <AccountSettings language={language} t={t} variant="checkout" />
    : <button aria-busy={purchasing || undefined} className="button primary pro-purchase-button" disabled={!pro.configured || !signedIn || !offer || purchasing || alreadyActive || (staging && !plans?.length) || Boolean(pending) || Boolean(pro.paymentAction)} onClick={() => void pro.purchase(offer?.planId)} type="button">{purchasing ? <ButtonLoader /> : null}{purchasing ? freeAccess ? t("activatingFreeAccess") : t("openingCheckout") : pending ? t("paymentResolveFirst") : alreadyActive ? t("familyPlusActive") : !pro.configured ? t("subscriptionsComingSoon") : freeAccess ? t("claimFreeAccess") : plans?.length && prices ? t("testPaymentTotal", { price: prices.total }) : t("subscribeToPro")}</button>;
  const footer = plans?.length ? <div className="pro-plan-checkout">
    <span>{t("stagingPlanDuration", { count: offer?.stagingAccessMinutes ?? 0 })} · {t("manualRenewalShort")}</span>
    {purchaseButton}
  </div> : undefined;
  return <Modal closeLabel={t("close")} onClose={pro.closePaywall} size="medium" title={t("proPaywallTitle")} footer={footer}>
    <FamilyPlusBenefits t={t} />
    <PendingPayment pro={pro} t={t} selectedPlan={offer?.planId} />
    {pro.payment?.status === "cancelled" ? <p role="status">{t("paymentCancelledDetail")}</p> : null}
    <section className="pro-plan-picker" aria-labelledby="family-offer-title"><h3 id="family-offer-title">{t("choosePlan")}</h3>
      {plans?.length ? <>
        <p className="payment-provider-note">{t("stagingPlanNotice")}</p>
        <p className="pro-plan-price-explanation">{t("planMonthlyExplanation")}</p>
        <div className="pro-plan-choices" role="radiogroup" aria-label={t("choosePlan")}>
          {plans.map(plan => {
            const planPrices = offerPrices(plan, true)!;
            return <label key={plan.planId} className={`pro-plan-option ${offer?.planId === plan.planId ? "selected" : ""}`}>
              <input type="radio" name="family-plan" value={plan.planId} checked={offer?.planId === plan.planId} disabled={purchasing} onChange={() => setSelectedPlan(plan.planId)} />
              <span className="pro-plan-copy">
                <span className="pro-plan-details"><strong>{t(plan.planId === "six_month" ? "familyPreviewSixMonths" : plan.planId === "three_year" ? "familyPreviewThreeYears" : plan.planId === "yearly" ? "familyPreviewYearly" : plan.planId === "weekly" ? "familyPlanWeekly" : plan.planId === "monthly" ? "familyPlanMonthly" : "familyPlanTwoYear")}</strong><span>{t("stagingPlanDuration", { count: plan.stagingAccessMinutes ?? 0 })}</span></span>
                <span className="pro-plan-pricing">
                  <strong className="pro-plan-total">{planPrices.total}</strong>
                  <span className="pro-plan-payment-kind">{t("oneTimePayment")}</span>
                  {planPrices.monthly ? <span className="pro-plan-monthly"><span aria-hidden="true">{t("planMonthlyApproximate", { price: planPrices.monthly })}</span><span className="sr-only">{t("planMonthlyAccessible", { price: planPrices.monthly })}</span></span> : null}
                </span>
              </span>
            </label>;
          })}
        </div>
        <p className="payment-provider-note">{t("manualRenewalNotice")}</p>
      </> : <div className={`pro-plan-option ${offer ? "selected" : ""}`}><span className="pro-plan-copy"><span><strong>{freeAccess ? t("oneMonthFreeAccess") : offer ? t("familyAccessMonths", { count: offer.accessMonths }) : t("familyAccessOffer")}</strong><em>{freeAccess ? t("noPaymentRequired") : t("oneTimePayment")}</em></span><small>{freeAccess ? t("freeAccessPrice") : prices?.total ?? t("priceAtLaunch")}<span>{freeAccess ? t("freeAccessRenewal") : prices?.monthly ? t("monthlyEquivalent", { price: prices.monthly }) : t("signInForPrice")}</span></small></span></div>}
    </section>
    {!pro.configured ? <div className="pro-availability" role="status"><strong>{t("proComingSoon")}</strong><span>{t("proComingSoonDetail")}</span></div> : null}
    {pro.configured && !signedIn ? <div className="pro-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
    {staging && !plans?.length ? <p role="status">{t("prepaidPlansUnavailable")}</p> : null}
    <p className="payment-provider-note">{freeAccess ? t("freeAccessDetail") : t("secureCheckoutDetail")}</p>
    <ErrorNotice message={pro.error} />
    {!plans?.length ? purchaseButton : null}
    <p className="pro-legal-links">{t("purchaseAgreementPrefix")} <a href="/terms/" rel="noopener noreferrer" target="_blank">{t("termsOfUse")}</a> {t("purchaseAgreementAnd")} <a href="https://family.heritg.us/privacy/" rel="noopener noreferrer" target="_blank">{t("privacyPolicy")}</a>.</p>
    <p className="pro-legal">{plans?.length ? t("stagingPlanLegal") : freeAccess ? t("freeAccessLegal") : t("subscriptionLegal")}</p>
  </Modal>;
}
