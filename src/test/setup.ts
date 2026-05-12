import { vi } from "vitest";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en/translation.json";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Mock Tauri plugins for testing
vi.mock("@tauri-apps/plugin-sql", async () => {
  const actual = await vi.importActual("@tauri-apps/plugin-sql");
  return {
    ...actual,
    default: {
      load: vi.fn().mockResolvedValue({
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockResolvedValue([]),
      }),
    },
  };
});

vi.mock("@tauri-apps/api/notification", async () => {
  const actual = await vi.importActual("@tauri-apps/api/notification");
  return {
    ...actual,
    default: {
      notify: vi.fn().mockResolvedValue(undefined),
      requestPermission: vi.fn().mockResolvedValue("granted"),
      isPermissionGranted: vi.fn().mockResolvedValue(true),
    },
  };
});

vi.mock("@tauri-apps/api/window", async () => {
  const actual = await vi.importActual("@tauri-apps/api/window");
  return {
    ...actual,
    getCurrentWindow: vi.fn().mockReturnValue({
      setBadgeCount: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
      setSkipTaskbar: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

vi.mock("@tauri-apps/api/core", async () => {
  const actual = await vi.importActual("@tauri-apps/api/core");
  return {
    ...actual,
    invoke: vi.fn().mockResolvedValue(undefined),
  };
});

import "@testing-library/jest-dom/vitest";