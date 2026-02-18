import { lazy, Suspense } from "react";
import {
  createRootRoute,
  createRoute,
  redirect,
} from "@tanstack/react-router";
import App from "@/App";
import { MailLayout } from "@/components/layout/MailLayout";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// Lazy-load heavy pages — these include many sub-components and service imports
const SettingsPage = lazy(() => import("@/components/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const HelpPage = lazy(() => import("@/components/help/HelpPage").then((m) => ({ default: m.HelpPage })));
const CalendarPage = lazy(() => import("@/components/calendar/CalendarPage").then((m) => ({ default: m.CalendarPage })));

// ---------- Search param validation ----------
const VALID_CATEGORIES = ["Primary", "Updates", "Promotions", "Social", "Newsletters"] as const;

type MailSearch = {
  q?: string;
  category?: (typeof VALID_CATEGORIES)[number];
};

function validateMailSearch(search: Record<string, unknown>): MailSearch {
  const result: MailSearch = {};
  if (typeof search["q"] === "string" && search["q"]) {
    result.q = search["q"];
  }
  const cat = search["category"];
  if (typeof cat === "string" && (VALID_CATEGORIES as readonly string[]).includes(cat)) {
    result.category = cat as MailSearch["category"];
  }
  return result;
}

// ---------- Root (shell: TitleBar, Sidebar, overlays) ----------
export const rootRoute = createRootRoute({
  component: App,
});

// ---------- / (index) → redirect to /mail/inbox ----------
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/mail/$label", params: { label: "inbox" } });
  },
});

// ---------- Mail routes: render MailLayout for all mail views ----------
function MailPage() {
  return (
    <ErrorBoundary name="MailLayout">
      <MailLayout />
    </ErrorBoundary>
  );
}

function SettingsTabPage() {
  return (
    <ErrorBoundary name="SettingsPage">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">Loading settings...</div>}>
        <SettingsPage />
      </Suspense>
    </ErrorBoundary>
  );
}

function CalendarPageWrapper() {
  return (
    <ErrorBoundary name="CalendarPage">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">Loading calendar...</div>}>
        <CalendarPage />
      </Suspense>
    </ErrorBoundary>
  );
}

function HelpPageWrapper() {
  return (
    <ErrorBoundary name="HelpPage">
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">Loading help...</div>}>
        <HelpPage />
      </Suspense>
    </ErrorBoundary>
  );
}

// ---------- /mail/$label ----------
export const mailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "mail/$label",
  validateSearch: validateMailSearch,
  component: MailPage,
});

// ---------- /mail/$label/thread/$threadId ----------
export const mailThreadRoute = createRoute({
  getParentRoute: () => mailRoute,
  path: "thread/$threadId",
});

// ---------- /label/$labelId ----------
export const labelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "label/$labelId",
  validateSearch: validateMailSearch,
  component: MailPage,
});

// ---------- /label/$labelId/thread/$threadId ----------
export const labelThreadRoute = createRoute({
  getParentRoute: () => labelRoute,
  path: "thread/$threadId",
});

// ---------- /smart-folder/$folderId ----------
export const smartFolderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "smart-folder/$folderId",
  validateSearch: validateMailSearch,
  component: MailPage,
});

// ---------- /smart-folder/$folderId/thread/$threadId ----------
export const smartFolderThreadRoute = createRoute({
  getParentRoute: () => smartFolderRoute,
  path: "thread/$threadId",
});

// ---------- /settings (redirect to /settings/general) ----------
const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  beforeLoad: () => {
    throw redirect({ to: "/settings/$tab", params: { tab: "general" } });
  },
});

// ---------- /settings/$tab ----------
export const settingsTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/$tab",
  component: SettingsTabPage,
});

// ---------- /calendar ----------
export const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "calendar",
  component: CalendarPageWrapper,
});

// ---------- /help (redirect to /help/getting-started) ----------
const helpIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "help",
  beforeLoad: () => {
    throw redirect({ to: "/help/$topic", params: { topic: "getting-started" } });
  },
});

// ---------- /help/$topic ----------
export const helpTopicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "help/$topic",
  component: HelpPageWrapper,
});

// ---------- Route tree ----------
export const routeTree = rootRoute.addChildren([
  indexRoute,
  mailRoute.addChildren([mailThreadRoute]),
  labelRoute.addChildren([labelThreadRoute]),
  smartFolderRoute.addChildren([smartFolderThreadRoute]),
  settingsIndexRoute,
  settingsTabRoute,
  calendarRoute,
  helpIndexRoute,
  helpTopicRoute,
]);
