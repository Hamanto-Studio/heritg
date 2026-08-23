import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProProvider, usePro } from "./ProProvider";
import type { ProContextValue } from "./proTypes";
import { unavailableProContext } from "./proTypes";

const Probe = () => { const pro = usePro(); return <span>{`${pro.configured}:${pro.account.status}:${pro.subscription.status}:${pro.sync.phase}`}</span>; };
describe("ProProvider", () => {
  it("fails closed without deployment configuration", () => {
    expect(renderToStaticMarkup(<ProProvider><Probe /></ProProvider>)).toContain("false:signedOut:unavailable:unavailable");
  });
  it("accepts authoritative state injection without local entitlement persistence", () => {
    const value: ProContextValue = { ...unavailableProContext, configured: true, account: { status: "signedIn", user: { id: "account-1", expiresAt: "2026-09-23T10:10:00.000Z" } }, subscription: { status: "active", willRenew: true }, sync: { enabled: true, phase: "syncing", pendingChanges: 1 } };
    expect(renderToStaticMarkup(<ProProvider value={value}><Probe /></ProProvider>)).toContain("true:signedIn:active:syncing");
  });
});
