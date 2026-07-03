/**
 * active-theme — the resolved ThemeContract this company wears.
 * Written by provisioning (_step_substrate_install): an approved mood
 * board's derived theme wins, else the CMO's authored ThemeContract
 * (company-theme-authoring-001 / visual phase 3b). Do NOT hand-edit.
 */
import type { ThemeContract } from "./contract";

export const activeTheme: ThemeContract = {
  "type": {
    "fontBody": "inter",
    "fontHeading": "inter"
  },
  "color": {
    "bg": "#f8f9fb",
    "text": "#1a2535",
    "accent": "#1b4f8a",
    "border": "#dde3ec",
    "danger": "#b52d2d",
    "success": "#1a6b42",
    "surface": "#ffffff",
    "textMuted": "#52637a",
    "accentText": "#ffffff",
    "surfaceAlt": "#eef1f6",
    "borderStrong": "#b8c4d4"
  },
  "shape": {
    "radius": 6
  }
};
