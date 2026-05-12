import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Shield, ShieldCheck, ShieldOff, Plus, Trash2, Download, Upload, Check, Pencil } from "lucide-react";
import { getAllProfiles, upsertProfile, setProfileActive, setDefaultProfile } from "@/services/db/complianceProfiles";
import type { ComplianceProfile, ComplianceRule, ComplianceRuleType, RuleSeverity } from "@/services/compliance/types";
import { Button } from "@/components/ui/Button";

const RULE_TYPE_OPTIONS: { value: ComplianceRuleType; label: string }[] = [
  { value: "signature_required", label: "Signature Required" },
  { value: "unsubscribe_required", label: "Unsubscribe Required" },
  { value: "disclaimer_required", label: "Disclaimer Required" },
  { value: "tone_check", label: "Tone Check" },
  { value: "data_minimization", label: "Data Minimization" },
  { value: "retention_notice", label: "Retention Notice" },
  { value: "custom_regex", label: "Custom Regex" },
  { value: "attachment_mentioned", label: "Attachment Mentioned" },
];

const SEVERITY_OPTIONS: { value: RuleSeverity; label: string }[] = [
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
];

export function ComplianceProfileManager() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ComplianceProfile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRules, setEditRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllProfiles();
      setProfiles(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleToggleActive = async (profile: ComplianceProfile) => {
    await setProfileActive(profile.id, !profile.isActive);
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, isActive: !p.isActive } : p)),
    );
  };

  const handleSetDefault = async (profile: ComplianceProfile) => {
    await setDefaultProfile(profile.id);
    setProfiles((prev) =>
      prev.map((p) => ({ ...p, isDefault: p.id === profile.id })),
    );
  };

  const handleEdit = (profile: ComplianceProfile) => {
    setEditingId(profile.id);
    setEditRules([...profile.rules]);
  };

  const handleSaveRules = async () => {
    if (!editingId) return;
    const profile = profiles.find((p) => p.id === editingId);
    if (!profile) return;

    const updated = { ...profile, rules: editRules };
    await upsertProfile(updated);
    setProfiles((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditRules([]);
  };

  const handleAddRule = () => {
    setEditRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: "signature_required",
        severity: "warning",
        messageKey: "compliance.customRule",
      },
    ]);
  };

  const handleRemoveRule = (idx: number) => {
    setEditRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateRule = (idx: number, updates: Partial<ComplianceRule>) => {
    setEditRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  };

  const handleExport = (profile: ComplianceProfile) => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-${profile.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ComplianceProfile;
      if (!parsed.code || !parsed.name || !parsed.rules) {
        alert(t("compliance.invalidJson"));
        return;
      }
      await upsertProfile(parsed);
      await loadProfiles();
    } catch {
      alert(t("compliance.invalidJson"));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loading) {
    return <div className="text-xs text-text-tertiary">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-tertiary">
          {t("compliance.profilesDescription")}
        </p>
        <Button variant="secondary" size="sm" icon={<Upload size={12} />} onClick={handleImport} className="bg-bg-tertiary text-text-primary border border-border-primary">
          {t("compliance.import")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileSelected}
      />

      {profiles.map((profile) => (
        <div
          key={profile.id}
          className="rounded-lg border border-border-primary bg-bg-secondary overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              {profile.isDefault ? (
                <ShieldCheck size={16} className="text-accent shrink-0" />
              ) : profile.isActive ? (
                <Shield size={16} className="text-text-secondary shrink-0" />
              ) : (
                <ShieldOff size={16} className="text-text-tertiary shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {profile.name}
                  </span>
                  {profile.isDefault && (
                    <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                      {t("compliance.default")}
                    </span>
                  )}
                  <span className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded-full font-mono">
                    {profile.code}
                  </span>
                </div>
                {profile.description && (
                  <p className="text-xs text-text-tertiary mt-0.5 truncate max-w-md">
                    {profile.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <div className="flex items-center gap-1.5">
                {profiles
                  .filter((p) => p.id !== profile.id)
                  .some((p) => p.isDefault) && (
                  <button
                    onClick={() => handleSetDefault(profile)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      profile.isDefault
                        ? "bg-accent/15 text-accent cursor-default"
                        : "bg-bg-tertiary text-text-tertiary hover:text-text-primary"
                    }`}
                    disabled={profile.isDefault}
                    title={t("compliance.setDefault")}
                  >
                    <Check size={12} />
                  </button>
                )}
                <button
                  onClick={() => handleExport(profile)}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
                  title={t("compliance.export")}
                >
                  <Download size={12} />
                </button>
                <button
                  onClick={() => handleEdit(profile)}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
                  title={t("compliance.editRules")}
                >
                  <Pencil size={12} />
                </button>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={profile.isActive}
                  onChange={() => handleToggleActive(profile)}
                />
                <div className="w-8 h-4 bg-bg-tertiary rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
          </div>

          {editingId === profile.id && (
            <div className="border-t border-border-primary px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">{t("compliance.rules")}</span>
                <button
                  onClick={handleAddRule}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  <Plus size={12} />
                  {t("compliance.addRule")}
                </button>
              </div>

              {editRules.map((rule, idx) => (
                <div key={rule.id} className="flex items-start gap-2 p-2 rounded bg-bg-tertiary/50">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <select
                      value={rule.type}
                      onChange={(e) => handleUpdateRule(idx, { type: e.target.value as ComplianceRuleType })}
                      className="text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
                    >
                      {RULE_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <select
                      value={rule.severity}
                      onChange={(e) => handleUpdateRule(idx, { severity: e.target.value as RuleSeverity })}
                      className="text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
                    >
                      {SEVERITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={rule.messageKey}
                        onChange={(e) => handleUpdateRule(idx, { messageKey: e.target.value })}
                        className="flex-1 text-xs bg-bg-tertiary text-text-primary px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
                        placeholder="message key"
                      />
                      <button
                        onClick={() => handleRemoveRule(idx)}
                        className="p-1 text-text-tertiary hover:text-danger transition-colors shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveRules}
                >
                  {t("common.save")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="bg-bg-tertiary text-text-primary border border-border-primary"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
