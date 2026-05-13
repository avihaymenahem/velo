import { useState, useEffect, useMemo } from "react";
import { Search, CheckSquare, Square, Users, Clock, Send, FileText, Eye, Calendar, Repeat, ChevronLeft, SplitSquareHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampaignTemplatePicker } from "./CampaignTemplatePicker";
import { campaignTemplates } from "@/constants/campaignTemplates";
import { getContactSegments } from "@/services/db/contactSegments";
import { getContactGroups } from "@/services/db/contactGroups";
import { createCampaign as svcCreateCampaign } from "@/services/campaigns/campaignService";
import { queryWithRetry } from "@/services/db/connection";

interface CampaignComposerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

type Step = "audience" | "template" | "schedule" | "review";

interface ContactGroup {
  id: string;
  name: string;
}

interface ContactSegment {
  id: string;
  name: string;
}

type AudienceMode = "contacts" | "group" | "segment";

type ScheduleMode = "immediate" | "scheduled" | "recurring";

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface ABVariantContent {
  subject: string;
  body: string;
}

export function CampaignComposer({ isOpen, onClose, accountId }: CampaignComposerProps) {

  const [step, setStep] = useState<Step>("audience");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("contacts");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [abEnabled, setAbEnabled] = useState(false);
  const [variantA, setVariantA] = useState<ABVariantContent>({ subject: "", body: "" });
  const [variantB, setVariantB] = useState<ABVariantContent>({ subject: "", body: "" });
  const [splitRatio, setSplitRatio] = useState(50);
  const [testDuration, setTestDuration] = useState(24);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactsLoading, setContactsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setTemplateId("");
    setSelectedContactIds([]);
    setSelectedGroupId("");
    setSelectedSegmentId("");
    setAudienceMode("contacts");
    setScheduleMode("immediate");
    setScheduledDate("");
    setScheduledTime("");
    setRecurringFrequency("weekly");
    setTrackingEnabled(false);
    setGdprConsent(false);
    setAbEnabled(false);
    setVariantA({ subject: "", body: "" });
    setVariantB({ subject: "", body: "" });
    setSplitRatio(50);
    setTestDuration(24);
    setStep("audience");
    setCreating(false);
    setContactSearch("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accountId) return;
    let cancelled = false;
    async function load() {
      try {
        const [contactsRows, groupsRows, segmentsRows] = await Promise.all([
          queryWithRetry(async (db) =>
            db.select<Contact[]>(
              "SELECT id, name, email FROM contacts WHERE account_id = $1 ORDER BY name ASC",
              [accountId],
            ),
          ),
          getContactGroups(accountId),
          getContactSegments(accountId),
        ]);
        if (!cancelled) {
          setContacts(contactsRows);
          setGroups(groupsRows);
          setSegments(segmentsRows);
        }
      } catch (err) {
        console.error("Failed to load audience data:", err);
      } finally {
        if (!cancelled) setContactsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [isOpen, accountId]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [contacts, contactSearch]);

  const allSelected = filteredContacts.length > 0 && filteredContacts.every((c) => selectedContactIds.includes(c.id));

  function toggleContact(id: string) {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function toggleAllContacts() {
    if (allSelected) {
      setSelectedContactIds((prev) => prev.filter((s) => !filteredContacts.some((c) => c.id === s)));
    } else {
      const newIds = new Set(selectedContactIds);
      for (const c of filteredContacts) newIds.add(c.id);
      setSelectedContactIds([...newIds]);
    }
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId);
  const selectedTemplate = templateId ? campaignTemplates.find((t) => t.id === templateId) : null;

  function canProceed(): boolean {
    if (step === "audience") {
      if (audienceMode === "contacts") return selectedContactIds.length > 0;
      if (audienceMode === "group") return selectedGroupId !== "";
      if (audienceMode === "segment") return selectedSegmentId !== "";
      return false;
    }
    if (step === "template") return templateId !== "";
    if (step === "schedule") {
      if (scheduleMode === "scheduled") return scheduledDate !== "" && scheduledTime !== "";
      return true;
    }
    return true;
  }

  function nextStep() {
    if (step === "audience") setStep("template");
    else if (step === "template") setStep("schedule");
    else if (step === "schedule") setStep("review");
  }

  function prevStep() {
    if (step === "template") setStep("audience");
    else if (step === "schedule") setStep("template");
    else if (step === "review") setStep("schedule");
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      let recipientContactIds: string[] | undefined;
      let groupId: string | undefined;
      let segmentId: string | undefined;

      if (audienceMode === "contacts") recipientContactIds = selectedContactIds;
      else if (audienceMode === "group") groupId = selectedGroupId;
      else if (audienceMode === "segment") segmentId = selectedSegmentId;

      await svcCreateCampaign({
        accountId,
        name: name.trim(),
        templateId: templateId || undefined,
        recipientContactIds,
        groupId,
        segmentId,
        abTestConfig: abEnabled && variantA.subject && variantB.subject
          ? {
              variantA: { subject: variantA.subject, body: variantA.body },
              variantB: { subject: variantB.subject, body: variantB.body },
              splitRatio: splitRatio / 100,
              testDurationHours: testDuration,
            }
          : undefined,
      });
    } catch (err) {
      console.error("Failed to create campaign:", err);
    } finally {
      setCreating(false);
      onClose();
    }
  }

  function getAudienceLabel(): string {
    if (audienceMode === "contacts") return `${selectedContactIds.length} contacts`;
    if (audienceMode === "group") return `Group: ${selectedGroup?.name ?? selectedGroupId}`;
    return `Segment: ${selectedSegment?.name ?? selectedSegmentId}`;
  }

  function getScheduleLabel(): string {
    if (scheduleMode === "immediate") return "Send immediately";
    if (scheduleMode === "scheduled") return `Scheduled: ${scheduledDate} ${scheduledTime}`;
    return `Recurring: ${recurringFrequency}`;
  }

  const steps: { id: Step; label: string; icon: typeof Users }[] = [
    { id: "audience", label: "Audience", icon: Users },
    { id: "template", label: "Template", icon: FileText },
    { id: "schedule", label: "Schedule", icon: Clock },
    { id: "review", label: "Review", icon: Eye },
  ];

  const currentIdx = steps.findIndex((s) => s.id === step);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Campaign" width="w-[36rem]" panelClassName="max-h-[85vh] overflow-hidden flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          {steps.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.625rem] font-medium ${
                  s.id === step
                    ? "bg-accent text-white"
                    : i < currentIdx
                      ? "bg-accent/20 text-accent"
                      : "bg-bg-secondary text-text-tertiary"
                }`}
              >
                <s.icon size={10} />
              </span>
              <span className={s.id === step ? "text-text-primary font-medium" : ""}>{s.label}</span>
              {i < steps.length - 1 && <span className="text-text-tertiary/40 mx-0.5">—</span>}
            </span>
          ))}
        </div>

        {/* Step 1: Audience Selection */}
        {step === "audience" && (
          <div className="space-y-3">
            <label className="text-sm text-text-primary font-medium">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter campaign name..."
              className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />

            <label className="text-sm text-text-primary font-medium">Select Audience</label>
            <div className="flex gap-2">
              {(["contacts", "group", "segment"] as AudienceMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAudienceMode(mode)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    audienceMode === mode
                      ? "bg-accent/10 border-accent text-accent"
                      : "bg-bg-secondary border-border-primary text-text-secondary hover:border-accent/50"
                  }`}
                >
                  {mode === "contacts" ? "Individual Contacts" : mode === "group" ? "Contact Group" : "Segment"}
                </button>
              ))}
            </div>

            {audienceMode === "contacts" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary rounded-lg border border-border-primary">
                  <Search size={14} className="text-text-tertiary shrink-0" />
                  <input
                    type="text"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Search contacts..."
                    className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-tertiary"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-text-tertiary flex items-center gap-1">
                    <Users size={12} />
                    {selectedContactIds.length} selected
                  </span>
                  <button onClick={toggleAllContacts} className="text-xs text-accent hover:underline flex items-center gap-1">
                    {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {contactsLoading ? (
                    <p className="text-xs text-text-tertiary px-1 py-2">Loading contacts...</p>
                  ) : filteredContacts.length === 0 ? (
                    <p className="text-xs text-text-tertiary px-1 py-2">
                      {contactSearch ? "No matching contacts" : "No contacts yet"}
                    </p>
                  ) : (
                    filteredContacts.map((c) => {
                      const isSelected = selectedContactIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleContact(c.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-sm hover:bg-bg-hover transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare size={14} className="text-accent shrink-0" />
                          ) : (
                            <Square size={14} className="text-text-tertiary shrink-0" />
                          )}
                          <span className="text-text-primary truncate">{c.name}</span>
                          <span className="text-text-tertiary text-xs truncate">{c.email}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {audienceMode === "group" && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="text-xs text-text-tertiary px-1 py-2">No contact groups yet</p>
                ) : (
                  groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        selectedGroupId === g.id
                          ? "bg-accent/10 border border-accent text-accent"
                          : "bg-bg-secondary border border-border-primary text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      <Users size={14} className="shrink-0" />
                      <span className="truncate">{g.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {audienceMode === "segment" && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {segments.length === 0 ? (
                  <p className="text-xs text-text-tertiary px-1 py-2">No segments yet</p>
                ) : (
                  segments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSegmentId(s.id)}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        selectedSegmentId === s.id
                          ? "bg-accent/10 border border-accent text-accent"
                          : "bg-bg-secondary border border-border-primary text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      <Users size={14} className="shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Template */}
        {step === "template" && (
          <div className="space-y-2">
            <label className="text-sm text-text-primary font-medium">Select Template</label>
            <CampaignTemplatePicker
              templates={campaignTemplates}
              selectedTemplateId={templateId}
              onSelect={(id) => setTemplateId(id ?? "")}
            />
            <div className="border-t border-border-primary pt-3 mt-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm text-text-primary font-medium flex items-center gap-1.5">
                    <SplitSquareHorizontal size={14} />
                    A/B Testing
                  </span>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    Test two variants to find the better performer
                  </p>
                </div>
                <button
                  onClick={() => setAbEnabled(!abEnabled)}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-4 ${
                    abEnabled ? "bg-accent" : "bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                      abEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              {abEnabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass-panel rounded-lg p-3 space-y-2">
                      <span className="text-xs font-semibold text-accent uppercase tracking-wide">Variant A</span>
                      <input
                        type="text"
                        value={variantA.subject}
                        onChange={(e) => setVariantA((p) => ({ ...p, subject: e.target.value }))}
                        placeholder="Subject A"
                        className="w-full px-2 py-1.5 bg-bg-secondary border border-border-primary rounded text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent"
                      />
                      <textarea
                        value={variantA.body}
                        onChange={(e) => setVariantA((p) => ({ ...p, body: e.target.value }))}
                        placeholder="Body A (HTML)"
                        rows={4}
                        className="w-full px-2 py-1.5 bg-bg-secondary border border-border-primary rounded text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent resize-none"
                      />
                    </div>
                    <div className="glass-panel rounded-lg p-3 space-y-2">
                      <span className="text-xs font-semibold text-warning uppercase tracking-wide">Variant B</span>
                      <input
                        type="text"
                        value={variantB.subject}
                        onChange={(e) => setVariantB((p) => ({ ...p, subject: e.target.value }))}
                        placeholder="Subject B"
                        className="w-full px-2 py-1.5 bg-bg-secondary border border-border-primary rounded text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent"
                      />
                      <textarea
                        value={variantB.body}
                        onChange={(e) => setVariantB((p) => ({ ...p, body: e.target.value }))}
                        placeholder="Body B (HTML)"
                        rows={4}
                        className="w-full px-2 py-1.5 bg-bg-secondary border border-border-primary rounded text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:ring-1 focus:ring-accent resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-text-tertiary mb-1 block">Split Ratio</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-secondary w-6">A: {splitRatio}%</span>
                        <input
                          type="range"
                          min={10}
                          max={90}
                          value={splitRatio}
                          onChange={(e) => setSplitRatio(Number(e.target.value))}
                          className="flex-1 accent-accent"
                        />
                        <span className="text-xs text-text-secondary w-6">B: {100 - splitRatio}%</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-text-tertiary mb-1 block">Test Duration</label>
                      <div className="flex gap-1">
                        {[6, 12, 24, 48].map((h) => (
                          <button
                            key={h}
                            onClick={() => setTestDuration(h)}
                            className={`flex-1 px-2 py-1 rounded text-xs border transition-colors ${
                              testDuration === h
                                ? "bg-accent/10 border-accent text-accent"
                                : "bg-bg-secondary border-border-primary text-text-secondary hover:border-accent/50"
                            }`}
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Schedule */}
        {step === "schedule" && (
          <div className="space-y-4">
            <label className="text-sm text-text-primary font-medium">Send Schedule</label>
            <div className="flex gap-2">
              {(["immediate", "scheduled", "recurring"] as ScheduleMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScheduleMode(mode)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                    scheduleMode === mode
                      ? "bg-accent/10 border-accent text-accent"
                      : "bg-bg-secondary border-border-primary text-text-secondary hover:border-accent/50"
                  }`}
                >
                  {mode === "immediate" ? (
                    <span className="flex items-center justify-center gap-1"><Send size={14} />Now</span>
                  ) : mode === "scheduled" ? (
                    <span className="flex items-center justify-center gap-1"><Calendar size={14} />Later</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1"><Repeat size={14} />Recurring</span>
                  )}
                </button>
              ))}
            </div>

            {scheduleMode === "scheduled" && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">Date</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-tertiary mb-1 block">Time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            )}

            {scheduleMode === "recurring" && (
              <div>
                <label className="text-xs text-text-tertiary mb-1 block">Frequency</label>
                <div className="flex gap-2">
                  {(["daily", "weekly", "monthly"] as const).map((freq) => (
                    <button
                      key={freq}
                      onClick={() => setRecurringFrequency(freq)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        recurringFrequency === freq
                          ? "bg-accent/10 border-accent text-accent"
                          : "bg-bg-secondary border-border-primary text-text-secondary hover:border-accent/50"
                      }`}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* GDPR tracking toggle */}
            <div className="border-t border-border-primary pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-text-primary font-medium">Open & Click Tracking</span>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    Track who opens your emails and clicks links
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!trackingEnabled) setGdprConsent(false);
                    setTrackingEnabled(!trackingEnabled);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ml-4 ${
                    trackingEnabled ? "bg-accent" : "bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                      trackingEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              {trackingEnabled && !gdprConsent && (
                <div className="glass-panel rounded-lg p-3 space-y-2">
                  <p className="text-xs text-text-tertiary leading-relaxed">
                    GDPR requires explicit consent for tracking. Recipients must be informed
                    about open/click tracking and given the option to opt out.
                  </p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gdprConsent}
                      onChange={(e) => setGdprConsent(e.target.checked)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="text-xs text-text-secondary">
                      I confirm that recipients will be informed about tracking and can opt out
                    </span>
                  </label>
                </div>
              )}
              {trackingEnabled && gdprConsent && (
                <div className="flex items-center gap-1.5 text-xs text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  GDPR consent confirmed
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === "review" && (
          <div className="space-y-3">
            <div className="text-sm text-text-primary font-medium">Campaign Summary</div>
            <div className="glass-panel rounded-lg p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-text-tertiary">Name</span>
                <span className="text-text-primary font-medium">{name.trim() || "—"}</span>
              </div>
              <div className="border-t border-border-primary" />
              <div className="flex justify-between items-center">
                <span className="text-text-tertiary">Audience</span>
                <span className="text-text-primary">{getAudienceLabel()}</span>
              </div>
              <div className="border-t border-border-primary" />
              <div className="flex justify-between items-center">
                <span className="text-text-tertiary">Template</span>
                <span className="text-text-primary">{selectedTemplate?.name ?? "None"}</span>
              </div>
              <div className="border-t border-border-primary" />
              <div className="flex justify-between items-center">
                <span className="text-text-tertiary">Schedule</span>
                <span className="text-text-primary">{getScheduleLabel()}</span>
              </div>
              <div className="border-t border-border-primary" />
              <div className="flex justify-between items-center">
                <span className="text-text-tertiary">Tracking</span>
                <span className={`text-sm ${trackingEnabled ? "text-success" : "text-text-tertiary"}`}>
                  {trackingEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {abEnabled && (
                <>
                  <div className="border-t border-border-primary" />
                  <div className="flex justify-between items-center">
                    <span className="text-text-tertiary">A/B Test</span>
                    <span className="text-sm text-accent">
                      A: {splitRatio}% / B: {100 - splitRatio}% · {testDuration}h
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
        <button
          onClick={step === "audience" ? onClose : prevStep}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          {step !== "audience" && <ChevronLeft size={14} />}
          {step === "audience" ? "Cancel" : "Back"}
        </button>
        {step === "review" ? (
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Send size={14} />
            {creating ? "Creating..." : "Launch Campaign"}
          </button>
        ) : (
          <button
            onClick={nextStep}
            disabled={!canProceed()}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </Modal>
  );
}
