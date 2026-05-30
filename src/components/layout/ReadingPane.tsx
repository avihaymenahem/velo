import { ThreadView } from "../email/ThreadView";
import { useThreadStore } from "@/stores/threadStore";
import { useUIStore } from "@/stores/uiStore";
import { useSelectedThreadId } from "@/hooks/useRouteNavigation";
import { EmptyState } from "../ui/EmptyState";
import { ReadingPaneIllustration } from "../ui/illustrations";
import { ScheduledEmailDetailView } from "./ScheduledEmailDetailView";
import { t } from "@/i18n";

export function ReadingPane() {
  const selectedThreadId = useSelectedThreadId();
  const selectedThread = useThreadStore((s) => selectedThreadId ? s.threadMap.get(selectedThreadId) ?? null : null);
  const selectedScheduledEmail = useUIStore((s) => s.selectedScheduledEmail);

  if (selectedScheduledEmail) {
    return (
      <div className="flex-1 bg-bg-primary/50 overflow-hidden glass-panel">
        <ScheduledEmailDetailView />
      </div>
    );
  }

  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary/50 glass-panel">
        <EmptyState illustration={ReadingPaneIllustration} title={t("layout.titleBar.appName")} subtitle={t("layout.readingPane.selectEmail")} />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-bg-primary/50 overflow-hidden glass-panel">
      <ThreadView thread={selectedThread} />
    </div>
  );
}
