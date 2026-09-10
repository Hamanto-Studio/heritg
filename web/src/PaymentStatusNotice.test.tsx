import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createTranslator } from "./i18n";
import { PaymentStatusNotice } from "./PaymentStatusNotice";
import { unavailableProContext } from "./proTypes";

it("shows payment-pending guidance without asking the user to pay again", () => {
  const html = renderToStaticMarkup(<PaymentStatusNotice pro={{ ...unavailableProContext, payment: { status: "pending", checking: false } }} t={createTranslator("en")} />);
  expect(html).toContain("Payment not completed");
  expect(html).toContain("hide this reminder");
  expect(html).toContain("View pending payment");
  expect(html).toContain('aria-live="polite"');
  expect(html).not.toContain('role="dialog"');
});
it("does not cover the paywall or resurrect a hidden reminder", () => {
  for (const state of [{ paywallOpen: true }, { paymentNoticeHidden: true }]) {
    expect(renderToStaticMarkup(<PaymentStatusNotice pro={{ ...unavailableProContext, ...state, payment: { status: "pending", checking: false } }} t={createTranslator("en")} />)).toBe("");
  }
});
it("localizes confirmed access without displaying sensitive payment data", () => {
  const html = renderToStaticMarkup(<PaymentStatusNotice pro={{ ...unavailableProContext, payment: { status: "confirmed", checking: false } }} t={createTranslator("id")} />);
  expect(html).toContain("Pembayaran dikonfirmasi");
  expect(html).not.toContain("Cek pembayaran");
});
