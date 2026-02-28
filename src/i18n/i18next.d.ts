import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    // Strict key checking disabled for Phase 1 to allow cross-namespace
    // t("ns:key") patterns and dynamic key lookups without type errors.
    // Re-enable resources typing in Phase 2 once all patterns are settled.
  }
}
