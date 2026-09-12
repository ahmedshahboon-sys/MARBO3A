// UI version switch.
// Keep the legacy interface loaded underneath so reverting is a one-line change.
export const UI_MODE = "v3";
export const UI_BODY_CLASS = UI_MODE === "v3" ? "ui-v3" : "ui-legacy";
