import { FamilyPlusBenefits } from "./FamilyPlusBenefits";
import type { Translator } from "./i18n";
import { Modal } from "./ui";

// Display-only September 9 proposal. Never submit these values to Checkout or
// use them to grant access. DOKU subscriptions require a verified server catalog.
const previewPlans = [
  { label: "familyPreviewMonthly", period: "familyPreviewPerMonth", amount: 15_000, minutes: 10 },
  { label: "familyPreviewSixMonths", period: "familyPreviewPerSixMonths", amount: 49_000, minutes: 15 },
  { label: "familyPreviewYearly", period: "familyPreviewPerYear", amount: 79_000, minutes: 20 },
  { label: "familyPreviewThreeYears", period: "familyPreviewPerThreeYears", amount: 199_000, minutes: 30 }
] as const;

export function FamilyPlanPreview({ onClose, t }: { onClose: () => void; t: Translator }) {
  const price = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  return <Modal closeLabel={t("close")} onClose={onClose} size="medium" title={t("proPaywallTitle")}
    footer={<button className="button secondary" onClick={onClose} type="button">{t("familyPreviewBack")}</button>}>
    <FamilyPlusBenefits t={t} />
    <section className="family-price-preview" aria-labelledby="family-price-preview-title">
      <h3 id="family-price-preview-title">{t("familyPreviewTitle")}</h3>
      <p>{t("familyPreviewPublic")}</p>
      <dl className="family-price-list">
        {previewPlans.map(plan => <div className="family-price-row" key={plan.label}>
          <dt>{t(plan.label)}</dt>
          <dd><strong>{price.format(plan.amount)}</strong><span>{t(plan.period)}</span></dd>
        </div>)}
      </dl>
      <p>{t("familyPreviewManual")}</p>
      <div className="pro-availability" role="status">
        <strong>{t("familyPreviewUnavailable")}</strong>
        <span>{t("familyPreviewUnavailableDetail")}</span>
      </div>
      <details className="pro-plan-benefits"><summary>{t("familyPreviewTesting")}</summary>
        <p>{t("familyPreviewTestingDetail")}</p>
        <ul>{previewPlans.map(plan => <li key={plan.label}>{t("familyPreviewTestDuration", { plan: t(plan.label), count: plan.minutes })}</li>)}</ul>
      </details>
    </section>
  </Modal>;
}
