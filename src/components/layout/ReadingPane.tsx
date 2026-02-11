import { ThreadView } from "../email/ThreadView";
import { useThreadStore } from "@/stores/threadStore";
import { MailOpen } from "lucide-react";

export function ReadingPane() {
  const { threads, selectedThreadId } = useThreadStore();
  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  if (!selectedThread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary/50 text-text-tertiary glass-panel">
        <div className="text-center">
          <MailOpen size={40} className="mb-4 text-text-tertiary" />
          <h2 className="text-lg font-medium text-text-secondary">
            Velo
          </h2>
          <p className="text-sm mt-1">Select an email to read</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-bg-primary/50 overflow-hidden glass-panel">
      <ThreadView thread={selectedThread} />
    </div>
  );
}
