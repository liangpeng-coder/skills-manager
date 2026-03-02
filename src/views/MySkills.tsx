import { useMemo, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  CheckCircle2,
  Circle,
  Github,
  HardDrive,
  Globe,
  Trash2,
  Layers,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SkillDetailPanel } from "../components/SkillDetailPanel";
import * as api from "../lib/tauri";
import type { ManagedSkill } from "../lib/tauri";

export function MySkills() {
  const { t } = useTranslation();
  const {
    activeScenario,
    tools,
    managedSkills: skills,
    refreshScenarios,
    refreshManagedSkills,
    detailSkillId,
    openSkillDetailById,
    closeSkillDetail,
  } = useApp();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterMode, setFilterMode] = useState<"all" | "enabled" | "available">("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ManagedSkill | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingSkillId, setCheckingSkillId] = useState<string | null>(null);
  const [updatingSkillId, setUpdatingSkillId] = useState<string | null>(null);

  const installedTools = tools.filter((tool) => tool.installed);
  const activeScenarioName = activeScenario?.name || t("mySkills.currentScenarioFallback");

  const enabledCount = activeScenario
    ? skills.filter((skill) => skill.scenario_ids.includes(activeScenario.id)).length
    : 0;

  const filtered = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      (skill.description || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (!activeScenario) return true;

    const enabledInScenario = skill.scenario_ids.includes(activeScenario.id);
    if (filterMode === "enabled") return enabledInScenario;
    if (filterMode === "available") return !enabledInScenario;
    return true;
  });

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === detailSkillId) || null,
    [detailSkillId, skills]
  );

  const handleSync = async (skill: ManagedSkill) => {
    for (const tool of installedTools) {
      if (!skill.targets.find((target) => target.tool === tool.key)) {
        await api.syncSkillToTool(skill.id, tool.key);
      }
    }
    toast.success(`${skill.name} ${t("mySkills.synced")}`);
    await refreshManagedSkills();
  };

  const handleUnsync = async (skill: ManagedSkill) => {
    for (const target of skill.targets) {
      await api.unsyncSkillFromTool(skill.id, target.tool);
    }
    toast.success(`${skill.name} ${t("mySkills.unsync")}`);
    await refreshManagedSkills();
  };

  const handleDeleteManagedSkill = async () => {
    if (!deleteTarget) return;
    await api.deleteManagedSkill(deleteTarget.id);
    if (selectedSkill?.id === deleteTarget.id) closeSkillDetail();
    toast.success(`${deleteTarget.name} ${t("mySkills.deleted")}`);
    setDeleteTarget(null);
    await Promise.all([refreshManagedSkills(), refreshScenarios()]);
  };

  const handleToggleScenario = async (skill: ManagedSkill) => {
    if (!activeScenario) return;
    const enabledInScenario = skill.scenario_ids.includes(activeScenario.id);
    if (enabledInScenario) {
      await api.removeSkillFromScenario(skill.id, activeScenario.id);
      toast.success(`${skill.name} ${t("mySkills.disabledInScenario")}`);
    } else {
      await api.addSkillToScenario(skill.id, activeScenario.id);
      toast.success(`${skill.name} ${t("mySkills.enabledInScenario")}`);
    }
    await Promise.all([refreshManagedSkills(), refreshScenarios()]);
  };

  const handleCheckAllUpdates = async () => {
    setCheckingAll(true);
    try {
      await api.checkAllSkillUpdates(true);
      toast.success(t("mySkills.updateActions.checkedAll"));
      await refreshManagedSkills();
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setCheckingAll(false);
    }
  };

  const handleCheckUpdate = async (skill: ManagedSkill) => {
    setCheckingSkillId(skill.id);
    try {
      await api.checkSkillUpdate(skill.id, true);
      await refreshManagedSkills();
    } catch (e: any) {
      toast.error(e.toString());
      await refreshManagedSkills();
    } finally {
      setCheckingSkillId(null);
    }
  };

  const handleRefreshSkill = async (skill: ManagedSkill) => {
    setUpdatingSkillId(skill.id);
    try {
      if (skill.source_type === "local" || skill.source_type === "import") {
        await api.reimportLocalSkill(skill.id);
        toast.success(t("mySkills.updateActions.reimported"));
      } else {
        await api.updateSkill(skill.id);
        toast.success(t("mySkills.updateActions.updated"));
      }
      await refreshManagedSkills();
    } catch (e: any) {
      toast.error(e.toString());
      await refreshManagedSkills();
    } finally {
      setUpdatingSkillId(null);
    }
  };

  const sourceIcon = (type: string) => {
    switch (type) {
      case "git":
      case "skillssh":
        return <Github className="w-3 h-3" />;
      case "local":
      case "import":
        return <HardDrive className="w-3 h-3" />;
      default:
        return <Globe className="w-3 h-3" />;
    }
  };

  const canRefresh = (skill: ManagedSkill) =>
    skill.source_type === "git" ||
    skill.source_type === "skillssh" ||
    skill.source_type === "local" ||
    skill.source_type === "import";

  const sourceTypeLabel = (skill: ManagedSkill) =>
    skill.source_type === "skillssh" ? "skills.sh" : skill.source_type;

  const refreshLabel = (skill: ManagedSkill) =>
    skill.source_type === "local" || skill.source_type === "import"
      ? t("mySkills.updateActions.reimport")
      : t("mySkills.updateActions.update");

  const statusBadge = (skill: ManagedSkill, enabledInScenario: boolean, isSynced: boolean) => {
    if (skill.update_status === "update_available") {
      return {
        label: "Update",
        className: "bg-amber-500/12 text-amber-400",
      };
    }
    if (skill.update_status === "source_missing") {
      return {
        label: t("mySkills.updateStatus.sourceMissing"),
        className: "bg-red-500/10 text-red-300",
      };
    }
    if (skill.update_status === "error") {
      return {
        label: t("mySkills.updateStatus.error"),
        className: "bg-red-500/10 text-red-300",
      };
    }
    if (enabledInScenario) {
      return {
        label: activeScenarioName,
        className: "bg-amber-500/10 text-amber-400/90",
      };
    }
    if (isSynced) {
      return {
        label: t("mySkills.synced"),
        className: "bg-emerald-500/10 text-emerald-400",
      };
    }
    if (skill.update_status === "local_only") {
      return {
        label: t("mySkills.updateStatus.localOnly"),
        className: "bg-background text-faint",
      };
    }
    return {
      label: t("mySkills.standby"),
      className: "bg-background text-faint",
    };
  };

  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col animate-in fade-in duration-400">
      {/* Header */}
      <div className="mb-5 pr-2">
        <h1 className="flex items-center gap-2.5 text-[16px] font-semibold text-primary">
          {t("mySkills.title")}
          <span className="rounded-full border border-border bg-surface-hover px-2.5 py-0.5 text-[12px] font-medium text-tertiary">
            {skills.length}
          </span>
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {activeScenario
            ? t("mySkills.subtitle", { scenario: activeScenario.name, count: enabledCount })
            : t("mySkills.noScenario")}
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex flex-1 gap-3">
          <div className="relative max-w-[260px] w-full">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("mySkills.searchPlaceholder")}
              className="w-full rounded-[5px] border border-border-subtle bg-surface h-[34px] pl-9 pr-3 text-[13px] font-medium text-secondary placeholder-faint transition-all focus:border-border focus:outline-none"
            />
          </div>

          <div className="flex rounded-[5px] border border-border-subtle bg-surface p-0.5">
            {(["all", "enabled", "available"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "rounded-[4px] px-3 py-1.5 text-[12px] font-medium transition-colors outline-none",
                  filterMode === mode
                    ? "bg-surface-active text-secondary"
                    : "text-muted hover:text-tertiary"
                )}
              >
                {t(`mySkills.filters.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex rounded-[5px] border border-border-subtle bg-surface p-0.5">
          <button
            onClick={handleCheckAllUpdates}
            disabled={checkingAll}
            className="mr-2 inline-flex items-center gap-1 rounded-[4px] px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checkingAll && "animate-spin")} />
            {t("mySkills.updateActions.checkAll")}
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-[4px] p-2 transition-colors outline-none",
              viewMode === "grid" ? "bg-surface-active text-secondary" : "text-muted hover:text-tertiary"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-[4px] p-2 transition-colors outline-none",
              viewMode === "list" ? "bg-surface-active text-secondary" : "text-muted hover:text-tertiary"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
          <Layers className="mb-4 h-12 w-12 text-faint" />
          <h3 className="mb-1.5 text-[14px] font-semibold text-tertiary">{t("mySkills.noSkills")}</h3>
          <p className="text-[13px] text-faint">
            {skills.length === 0 ? t("mySkills.addFirst") : t("mySkills.noMatch")}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "pb-8",
            viewMode === "grid"
              ? "grid grid-cols-2 gap-3 lg:grid-cols-3"
              : "flex flex-col gap-0.5"
          )}
        >
          {filtered.map((skill) => {
            const isSynced = skill.targets.length > 0;
            const enabledInScenario = activeScenario
              ? skill.scenario_ids.includes(activeScenario.id)
              : false;
            const badge = statusBadge(skill, enabledInScenario, isSynced);

            /* ── Grid Card ── */
            if (viewMode === "grid") {
              return (
                <div
                  key={skill.id}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface transition-all hover:border-border hover:bg-surface-hover"
                >
                  <div className="absolute right-3 top-3 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      onClick={() => handleCheckUpdate(skill)}
                      disabled={checkingSkillId === skill.id}
                      className="rounded p-1 text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
                      title={t("mySkills.updateActions.check")}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", checkingSkillId === skill.id && "animate-spin")} />
                    </button>
                    {canRefresh(skill) && (
                      <button
                        onClick={() => handleRefreshSkill(skill)}
                        disabled={updatingSkillId === skill.id}
                        className="rounded p-1 text-accent-light transition-colors hover:bg-accent-bg disabled:opacity-50"
                        title={refreshLabel(skill)}
                      >
                        <RotateCcw className={cn("h-3.5 w-3.5", updatingSkillId === skill.id && "animate-spin")} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(skill)}
                      className="rounded p-1 text-faint transition-colors hover:bg-surface-hover hover:text-red-400"
                      title={t("mySkills.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-1 flex-col px-3 pb-0 pt-3">
                    <div className="mb-1 flex items-start gap-2 pr-24">
                      <div className="mt-0.5">
                        {isSynced ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-faint" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3
                          className="min-w-0 cursor-pointer truncate text-[13px] font-semibold text-secondary hover:text-primary"
                          onClick={() => openSkillDetailById(skill.id)}
                          title={skill.name}
                        >
                          {skill.name}
                        </h3>
                        <p className="mt-2 min-h-[36px] text-[12px] leading-[18px] text-muted line-clamp-2">
                          {skill.description || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle px-0 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted">
                          {sourceIcon(skill.source_type)}
                          {sourceTypeLabel(skill)}
                        </span>
                        <span className="text-faint">·</span>
                        <span
                          className={cn(
                            "truncate rounded-full px-2 py-0.5 text-[10px] font-medium",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleScenario(skill)}
                        disabled={!activeScenario}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition-colors outline-none",
                          enabledInScenario
                            ? "text-accent-light hover:bg-accent-bg"
                            : "text-muted hover:bg-surface-hover hover:text-secondary"
                        )}
                      >
                        {enabledInScenario ? t("mySkills.enabledButton") : t("mySkills.enable")}
                      </button>
                      <button
                        onClick={() => (isSynced ? handleUnsync(skill) : handleSync(skill))}
                        className={cn(
                          "rounded px-2 py-0.5 text-[11px] font-medium transition-colors outline-none",
                          isSynced
                            ? "text-accent-light hover:bg-accent-bg"
                            : "text-accent-light hover:bg-accent-bg"
                        )}
                      >
                        {isSynced ? t("mySkills.synced") : t("mySkills.sync")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            /* ── List Row ── */
            return (
              <div
                key={skill.id}
                className="group flex items-center gap-3 rounded-lg border border-transparent bg-surface px-3 py-2 transition-all hover:border-border-subtle hover:bg-surface-hover"
              >
                {isSynced ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-faint" />
                )}

                <h3
                  className="w-[180px] shrink-0 truncate text-[13px] font-semibold text-secondary cursor-pointer hover:text-primary"
                  onClick={() => openSkillDetailById(skill.id)}
                  title={skill.name}
                >
                  {skill.name}
                </h3>

                <p className="min-w-0 flex-1 truncate text-[12px] text-muted">
                  {skill.description || "—"}
                </p>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                    {sourceIcon(skill.source_type)}
                    {sourceTypeLabel(skill)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleToggleScenario(skill)}
                    disabled={!activeScenario}
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-medium transition-colors outline-none",
                      enabledInScenario
                        ? "text-accent-light hover:bg-accent-bg"
                        : "text-muted hover:bg-surface-hover hover:text-secondary"
                    )}
                  >
                    {enabledInScenario ? t("mySkills.enabledButton") : t("mySkills.enable")}
                  </button>
                  <button
                    onClick={() => (isSynced ? handleUnsync(skill) : handleSync(skill))}
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-medium transition-colors outline-none",
                      isSynced
                        ? "text-accent-light hover:bg-accent-bg"
                        : "text-accent-light hover:bg-accent-bg"
                    )}
                  >
                    {isSynced ? t("mySkills.synced") : t("mySkills.sync")}
                  </button>
                  <button
                    onClick={() => handleCheckUpdate(skill)}
                    disabled={checkingSkillId === skill.id}
                    className="rounded p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
                    title={t("mySkills.updateActions.check")}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", checkingSkillId === skill.id && "animate-spin")} />
                  </button>
                  {canRefresh(skill) && (
                    <button
                      onClick={() => handleRefreshSkill(skill)}
                      disabled={updatingSkillId === skill.id}
                      className="rounded p-0.5 text-accent-light transition-colors hover:bg-accent-bg disabled:opacity-50"
                      title={refreshLabel(skill)}
                    >
                      <RotateCcw className={cn("h-3.5 w-3.5", updatingSkillId === skill.id && "animate-spin")} />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(skill)}
                    className="rounded p-0.5 text-faint transition-colors hover:text-red-400"
                    title={t("mySkills.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SkillDetailPanel skill={selectedSkill} onClose={closeSkillDetail} />
      <ConfirmDialog
        open={deleteTarget !== null}
        message={t("mySkills.deleteConfirm", { name: deleteTarget?.name || "" })}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteManagedSkill}
      />
    </div>
  );
}
