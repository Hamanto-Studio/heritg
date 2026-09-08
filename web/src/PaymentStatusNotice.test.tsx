import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createTranslator } from "./i18n";
import { PaymentStatusNotice } from "./PaymentStatusNotice";
import { unavailableProContext } from "./proTypes";

it("shows payment-pending guidance without asking the user to pay again", () => {
  const html = renderToStaticMarkup(<PaymentStatusNotice pro={{ ...unavailableProContext, payment: { status: "pending", checking: false } }} t={createTranslator("en")} />);
  expect(html).toContain("Checking your payment");
  expect(html).toContain("Please don’t pay again");
  expect(html).toContain("Check payment");
  expect(html).toContain('aria-live="polite"');
  expect(html).not.toContain('role="dialog"');
});
it("localizes confirmed access without displaying sensitive payment data", () => {
  const html = renderToStaticMarkup(<PaymentStatusNotice pro={{ ...unavailableProContext, payment: { status: "confirmed", checking: false } }} t={createTranslator("id")} />);
  expect(html).toContain("Pembayaran dikonfirmasi");
  expect(html).not.toContain("Cek pembayaran");
});
