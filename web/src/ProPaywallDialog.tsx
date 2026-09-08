import { useState } from "react";
import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import type { Translator } from "./i18n";
import type { ProContextValue, ProOffer } from "./proTypes";
import { ButtonLoader, ErrorNotice, Modal } from "./ui";

const offerFor = (pro: ProContextValue) => "offer" in pro.subscription ? pro.subscription.offer : undefined;
const formattedPrice = (amount: number, currency: string) => new Intl.NumberFormat(
  currency === "IDR" ? "id-ID" : "en-US",
  { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 }
).format(amount);

const offerPrices = (offer: ProOffer | undefined) => offer ? {
  monthly: offer.accessMonths > 0 ? formattedPrice(offer.price.amount / offer.accessMonths, offer.price.currency) : undefined,
  total: formattedPrice(offer.price.amount, offer.price.currency)
} : undefined;

export function ProPaywallDialog({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const [selectedPlan, setSelectedPlan] = useState<ProOffer["planId"]>("two_year");
  const plans = pro.offers?.filter(item => item.planId);
  const offer = plans?.length ? plans.find(item => item.planId === selectedPlan) ?? plans[0] : offerFor(pro);
  const prices = offerPrices(offer);
  const freeAccess = offer?.price.amount === 0 || (!offer && pro.configured && __DEPLOYMENT_ENV__ === "production");
  const purchasing = pro.subscription.status === "purchasing";
  const alreadyActive = freeAccess && (pro.subscription.status === "active" || pro.subscription.status === "readOnly");
  const signedIn = pro.account.status === "signedIn";
  const purchaseButton = <button aria-busy={purchasing || undefined} className="button primary pro-purchase-button" disabled={!pro.configured || !signedIn || !offer || purchasing || alreadyActive} onClick={() => void pro.purchase(offer?.planId)} type="button">{purchasing ? <ButtonLoader /> : null}{purchasing ? freeAccess ? t("activatingFreeAccess") : t("openingCheckout") : alreadyActive ? t("familyPlusActive") : !pro.configured ? t("subscriptionsComingSoon") : freeAccess ? t("claimFreeAccess") : plans?.length && prices ? t("testPaymentTotal", { price: prices.total }) : t("subscribeToPro")}</button>;
  const footer = plans?.length ? <div className="pro-plan-checkout">
    <span>{t("stagingPlanDuration", { count: offer?.stagingAccessMinutes ?? 0 })} · {t("manualRenewalShort")}</span>
    {purchaseButton}
  </div> : undefined;
  return <Modal closeLabel={t("close")} onClose={pro.closePaywall} size="medium" title={t("proPaywallTitle")} footer={footer}>
    {!plans?.length ? <FamilyPlusBenefits t={t} /> : null}
    <section className="pro-plan-picker" aria-labelledby="family-offer-title"><h3 id="family-offer-title">{t("choosePlan")}</h3>
      {plans?.length ? <>
        <p className="payment-provider-note">{t("stagingPlanNotice")}</p>
        <div className="pro-plan-choices" role="radiogroup" aria-label={t("choosePlan")}>
          {plans.map(plan => <label key={plan.planId} className={`pro-plan-option ${offer?.planId === plan.planId ? "selected" : ""}`}>
            <input type="radio" name="family-plan" value={plan.planId} checked={offer?.planId === plan.planId} disabled={purchasing} onChange={() => setSelectedPlan(plan.planId)} />
            <span className="pro-plan-copy"><span><strong>{t(plan.planId === "weekly" ? "familyPlanWeekly" : plan.planId === "monthly" ? "familyPlanMonthly" : plan.planId === "yearly" ? "familyPlanYearly" : "familyPlanTwoYear")}</strong><span>{t("stagingPlanDuration", { count: plan.stagingAccessMinutes ?? 0 })}</span></span><small>{formattedPrice(plan.price.amount, plan.price.currency)}<span>{t("oneTimePayment")}</span></small></span>
          </label>)}
        </div>
        <p className="payment-provider-note">{t("manualRenewalNotice")}</p>
      </> : <div className={`pro-plan-option ${offer ? "selected" : ""}`}><span className="pro-plan-copy"><span><strong>{freeAccess ? t("oneMonthFreeAccess") : offer ? t("familyAccessMonths", { count: offer.accessMonths }) : t("familyAccessOffer")}</strong><em>{freeAccess ? t("noPaymentRequired") : t("oneTimePayment")}</em></span><small>{freeAccess ? t("freeAccessPrice") : prices?.total ?? t("priceAtLaunch")}<span>{freeAccess ? t("freeAccessRenewal") : prices?.monthly ? t("monthlyEquivalent", { price: prices.monthly }) : t("signInForPrice")}</span></small></span></div>}
    </section>
    {!pro.configured ? <div className="pro-availability" role="status"><strong>{t("proComingSoon")}</strong><span>{t("proComingSoonDetail")}</span></div> : null}
    {pro.configured && !signedIn ? <div className="pro-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
    <p className="payment-provider-note">{freeAccess ? t("freeAccessDetail") : t("secureCheckoutDetail")}</p>
    <ErrorNotice message={pro.error} />
    {!plans?.length ? purchaseButton : null}
    <p className="pro-legal-links">{t("purchaseAgreementPrefix")} <a href="/terms/" rel="noopener noreferrer" target="_blank">{t("termsOfUse")}</a> {t("purchaseAgreementAnd")} <a href="https://family.heritg.us/privacy/" rel="noopener noreferrer" target="_blank">{t("privacyPolicy")}</a>.</p>
    <p className="pro-legal">{plans?.length ? t("stagingPlanLegal") : freeAccess ? t("freeAccessLegal") : t("subscriptionLegal")}</p>
    {plans?.length ? <details className="pro-plan-benefits"><summary>{t("familyPlanBenefits")}</summary><FamilyPlusBenefits t={t} /></details> : null}
  </Modal>;
}
