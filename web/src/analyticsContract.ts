/** Privacy boundary: keep byte-identical in the web and backend repositories. */
export const JOURNEYS = {
  app_visit: ["app_opened", "editor_ready"],
  view_change: ["view_requested", "view_selected"],
  onboarding: ["empty_canvas", "editor_opened", "person_added"],
  import: ["file_selected", "file_decoded", "import_saved"],
  export: ["export_requested", "download_prepared"],
  share_create: ["create_requested", "encrypted", "uploaded", "link_ready"],
  share_open: ["unlock_requested", "tree_opened"],
  sign_in: ["proof_submitted", "authenticated"],
  family_discovery: ["paywall_opened", "continue_clicked", "checkout_ready", "access_confirmed"],
  checkout: ["checkout_requested", "payment_page_ready", "access_confirmed"],
  sync_enable: ["sync_enabled", "up_to_date"]
} as const;
export type Journey = keyof typeof JOURNEYS;
export const VARIANTS = ["default", "heritg", "gedcom", "json", "png", "pdf", "svg", "google", "email", "free", "six_month", "yearly", "three_year", "weekly", "monthly", "two_year", "full", "focus", "fan", "free_user", "existing_access"] as const;
export type Variant = typeof VARIANTS[number];
export const OUTCOMES = ["in_progress", "success", "failed", "cancelled"] as const;
export type Outcome = typeof OUTCOMES[number];
export interface JourneyEvent {
  schemaVersion: 1;
  attemptId: string;
  journey: Journey;
  variant: Variant;
  step: number;
  outcome: Outcome;
}
export const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
export function validVariant(journey: Journey, variant: Variant): boolean {
  if (variant === "default") return journey !== "checkout";
  if (journey === "import") return ["heritg", "gedcom", "json"].includes(variant);
  if (journey === "export") return ["heritg", "gedcom", "png", "pdf", "svg"].includes(variant);
  if (journey === "view_change") return ["full", "focus", "fan"].includes(variant);
  if (journey === "family_discovery") return ["free_user", "existing_access"].includes(variant);
  if (journey === "sign_in") return ["google", "email"].includes(variant);
  if (journey === "checkout") return ["free", "six_month", "yearly", "three_year", "weekly", "monthly", "two_year"].includes(variant);
  return false;
}
export function validEvent(value: unknown): value is JourneyEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const event = value as JourneyEvent;
  if (Object.keys(event).sort().join(",") !== "attemptId,journey,outcome,schemaVersion,step,variant") return false;
  return event.schemaVersion === 1 &&
    typeof event.attemptId === "string" && new RegExp(UUID_PATTERN).test(event.attemptId) &&
    typeof event.journey === "string" && Object.hasOwn(JOURNEYS, event.journey) && VARIANTS.includes(event.variant) &&
    OUTCOMES.includes(event.outcome) && validVariant(event.journey, event.variant) &&
    Number.isInteger(event.step) && event.step >= 0 && event.step < JOURNEYS[event.journey].length &&
    (event.outcome === "success" ? event.step === JOURNEYS[event.journey].length - 1 : event.step < JOURNEYS[event.journey].length - 1);
}
