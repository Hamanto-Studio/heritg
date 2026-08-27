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
  monthly: formattedPrice(offer.price.amount / offer.accessMonths, offer.price.currency),
  total: formattedPrice(offer.price.amount, offer.price.currency)
} : undefined;

export function ProPaywallDialog({ pro, t }: { pro: ProContextValue; t: Translator }) {
  const offer = offerFor(pro);
  const prices = offerPrices(offer);
  const freeAccess = offer?.price.amount === 0 || (!offer && pro.configured && __DEPLOYMENT_ENV__ === "production");
  const purchasing = pro.subscription.status === "purchasing";
  const alreadyActive = pro.subscription.status === "active" || pro.subscription.status === "readOnly";
  const signedIn = pro.account.status === "signedIn";
  return <Modal closeLabel={t("close")} onClose={pro.closePaywall} size="medium" title={t("proPaywallTitle")}>
    <FamilyPlusBenefits t={t} />
    <section className="pro-plan-picker" aria-labelledby="family-offer-title"><h3 id="family-offer-title">{t("choosePlan")}</h3>
      <div className={`pro-plan-option ${offer ? "selected" : ""}`}><span className="pro-plan-copy"><span><strong>{freeAccess ? t("oneMonthFreeAccess") : offer ? t("familyAccessMonths", { count: offer.accessMonths }) : t("familyAccessOffer")}</strong><em>{freeAccess ? t("noPaymentRequired") : t("oneTimePayment")}</em></span><small>{freeAccess ? t("freeAccessPrice") : prices?.total ?? t("priceAtLaunch")}<span>{freeAccess ? t("freeAccessRenewal") : prices ? t("monthlyEquivalent", { price: prices.monthly }) : t("signInForPrice")}</span></small></span></div>
    </section>
    {!pro.configured ? <div className="pro-availability" role="status"><strong>{t("proComingSoon")}</strong><span>{t("proComingSoonDetail")}</span></div> : null}
    {pro.configured && !signedIn ? <div className="pro-availability" role="status"><strong>{t("signInRequired")}</strong><span>{t("signInBeforePurchase")}</span></div> : null}
    <p className="payment-provider-note">{freeAccess ? t("freeAccessDetail") : t("secureCheckoutDetail")}</p>
    <ErrorNotice message={pro.error} />
    <button aria-busy={purchasing || undefined} className="button primary pro-purchase-button" disabled={!pro.configured || !signedIn || !offer || purchasing || alreadyActive} onClick={() => void pro.purchase()} type="button">{purchasing ? <ButtonLoader /> : null}{purchasing ? freeAccess ? t("activatingFreeAccess") : t("openingCheckout") : alreadyActive ? t("familyPlusActive") : !pro.configured ? t("subscriptionsComingSoon") : freeAccess ? t("claimFreeAccess") : t("subscribeToPro")}</button>
    <p className="pro-legal-links">{t("purchaseAgreementPrefix")} <a href="/terms/" rel="noopener noreferrer" target="_blank">{t("termsOfUse")}</a> {t("purchaseAgreementAnd")} <a href="https://family.heritg.us/privacy/" rel="noopener noreferrer" target="_blank">{t("privacyPolicy")}</a>.</p>
    <p className="pro-legal">{freeAccess ? t("freeAccessLegal") : t("subscriptionLegal")}</p>
  </Modal>;
}
