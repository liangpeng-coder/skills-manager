import { useState, useEffect, useCallback, useRef } from "react";
import {
  DownloadCloud,
  UploadCloud,
  Github,
  Box,
  Star,
  TrendingUp,
  Clock,
  Plus,
  FolderUp,
  Loader2,
  RefreshCw,
  FolderSearch,
  ExternalLink,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { useApp } from "../context/AppContext";
import * as api from "../lib/tauri";
import type { ScanResult, SkillsShSkill } from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSearchParams } from "react-router-dom";

const MARKET_PAGE_SIZE = 24;

export function InstallSkills() {
  const { t } = useTranslation();
  const { refreshScenarios, refreshManagedSkills } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"market" | "local" | "git">("market");
  const [marketTab, setMarketTab] = useState<"hot" | "trending" | "alltime">("hot");
  const [marketSkills, setMarketSkills] = useState<SkillsShSkill[]>([]);
  const [marketPage, setMarketPage] = useState(1);
  const [marketLoading, setMarketLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [gitName, setGitName] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [importingPaths, setImportingPaths] = useState<Set<string>>(new Set());
  const [importingAll, setImportingAll] = useState(false);
  const marketListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "market" || tab === "local" || tab === "git") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const switchTab = (tab: "market" | "local" | "git") => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const runScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const result = await api.scanLocalSkills();
      setScanResult(result);
    } catch (e: any) {
      console.error(e);
      toast.error(e.toString());
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "market") {
      setMarketLoading(true);
      setMarketPage(1);
      api
        .fetchLeaderboard(marketTab)
        .then(setMarketSkills)
        .catch((e) => {
          console.error(e);
          toast.error(t("common.error"));
        })
        .finally(() => setMarketLoading(false));
    }
  }, [activeTab, marketTab, t]);

  useEffect(() => {
    if (activeTab === "local" && !scanResult && !scanLoading) {
      runScan();
    }
  }, [activeTab, scanLoading, scanResult, runScan]);

  const handleInstallSkillssh = async (skill: SkillsShSkill) => {
    setInstalling(skill.id);
    try {
      await api.installFromSkillssh(skill.source, skill.skill_id);
      toast.success(`${skill.name} ${t("common.success")}`);
      await Promise.all([refreshScenarios(), refreshManagedSkills()]);
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setInstalling(null);
    }
  };

  const handleLocalInstall = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        filters: [{ name: "Skills", extensions: ["zip", "skill"] }],
      });
      if (!selected) return;
      await api.installLocal(selected as string);
      toast.success(t("common.success"));
      await Promise.all([refreshScenarios(), refreshManagedSkills()]);
      await runScan();
    } catch (e: any) {
      toast.error(e.toString());
    }
  };

  const handleGitInstall = async () => {
    if (!gitUrl.trim()) return;
    setGitLoading(true);
    try {
      await api.installGit(gitUrl.trim(), gitName.trim() || undefined);
      toast.success(t("common.success"));
      setGitUrl("");
      setGitName("");
      await Promise.all([refreshScenarios(), refreshManagedSkills()]);
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setGitLoading(false);
    }
  };

  const handleImportDiscovered = async (sourcePath: string, name: string) => {
    setImportingPaths((prev) => new Set(prev).add(sourcePath));
    try {
      await api.importExistingSkill(sourcePath, name);
      toast.success(t("install.scan.importedOne", { name }));
      await Promise.all([refreshScenarios(), refreshManagedSkills()]);
      await runScan();
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setImportingPaths((prev) => {
        const next = new Set(prev);
        next.delete(sourcePath);
        return next;
      });
    }
  };

  const handleImportAllDiscovered = async () => {
    setImportingAll(true);
    try {
      await api.importAllDiscovered();
      toast.success(t("install.scan.importedAll"));
      await Promise.all([refreshScenarios(), refreshManagedSkills()]);
      await runScan();
    } catch (e: any) {
      toast.error(e.toString());
    } finally {
      setImportingAll(false);
    }
  };

  const scrollMarketListToTop = () => {
    marketListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const changeMarketPage = (page: number) => {
    setMarketPage(page);
    scrollMarketListToTop();
  };

  const scanGroups = scanResult?.groups ?? [];
  const pendingGroups = scanGroups.filter((group) => !group.imported);
  const importedGroups = scanGroups.length - pendingGroups.length;
  const totalMarketPages = Math.max(1, Math.ceil(marketSkills.length / MARKET_PAGE_SIZE));
  const currentMarketPage = Math.min(marketPage, totalMarketPages);
  const marketPageStart = (currentMarketPage - 1) * MARKET_PAGE_SIZE;
  const paginatedMarketSkills = marketSkills.slice(
    marketPageStart,
    marketPageStart + MARKET_PAGE_SIZE
  );
  const visibleMarketPages = Array.from(
    { length: totalMarketPages },
    (_, index) => index + 1
  ).filter((page) => {
    if (totalMarketPages <= 7) return true;
    if (page === 1 || page === totalMarketPages) return true;
    return Math.abs(page - currentMarketPage) <= 1;
  });

  return (
    <div className="max-w-[1200px] mx-auto h-full flex flex-col animate-in fade-in duration-400">
      {/* Page header + tabs */}
      <div className="mb-5">
        <h1 className="text-[15px] font-semibold text-primary mb-4">{t("install.title")}</h1>
        <div className="flex gap-1 border-b border-border-subtle">
          {[
            { id: "market" as const, label: t("install.browseMarket"), icon: Box },
            { id: "local" as const, label: t("install.localInstall"), icon: UploadCloud },
            { id: "git" as const, label: t("install.gitInstall"), icon: Github },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "pb-2.5 px-1 text-[12px] font-medium flex items-center gap-1.5 border-b-2 transition-colors outline-none mr-4",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-tertiary"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Market tab */}
      {activeTab === "market" && (
        <div className="flex-1 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-surface border border-border-subtle rounded-[4px] p-px">
              {[
                { id: "hot" as const, label: t("install.hot"), icon: Star },
                { id: "trending" as const, label: t("install.trending"), icon: TrendingUp },
                { id: "alltime" as const, label: t("install.all"), icon: Clock },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = marketTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMarketTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-[3px] text-[11px] font-medium transition-colors outline-none",
                      isActive ? "bg-surface-active text-secondary" : "text-muted hover:text-tertiary"
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {marketLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-muted animate-spin" />
            </div>
          ) : (
            <div className="pb-8">
              <div
                ref={marketListRef}
                className="mb-4 flex scroll-mt-4 flex-col gap-3 rounded-lg border border-border-subtle bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-[11px] text-muted">
                  {t("install.pagination.summary", {
                    start: marketSkills.length === 0 ? 0 : marketPageStart + 1,
                    end: Math.min(marketPageStart + MARKET_PAGE_SIZE, marketSkills.length),
                    total: marketSkills.length,
                  })}
                </p>
                <div className="text-[11px] text-faint">
                  {t("install.pagination.page", {
                    current: currentMarketPage,
                    total: totalMarketPages,
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
                {paginatedMarketSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="bg-surface border border-border-subtle rounded-lg p-3.5 hover:border-border transition-colors flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-secondary text-[13px] truncate">{skill.name || skill.skill_id}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-accent-light font-medium bg-accent-bg px-1.5 py-0.5 rounded">
                          @{skill.source}
                        </span>
                        <span className="text-[10px] text-muted flex items-center gap-1">
                          <DownloadCloud className="w-3 h-3" />
                          {skill.installs > 1000
                            ? `${(skill.installs / 1000).toFixed(0)}k`
                            : skill.installs}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openUrl(`https://skills.sh/${skill.source}/${skill.skill_id}`)}
                        className="p-1.5 rounded-[4px] text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
                        title={t("install.viewOnWeb")}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleInstallSkillssh(skill)}
                        disabled={installing === skill.id}
                        className="p-1.5 rounded-[4px] bg-accent-dark hover:bg-accent text-white transition-colors disabled:opacity-50 border border-accent-border"
                        title={t("install.oneClickInstall")}
                      >
                        {installing === skill.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {totalMarketPages > 1 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    onClick={() => changeMarketPage(Math.max(1, currentMarketPage - 1))}
                    disabled={currentMarketPage === 1}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {t("install.pagination.previous")}
                  </button>

                  {visibleMarketPages.map((page, index) => {
                    const previousPage = visibleMarketPages[index - 1];
                    const showGap = previousPage && page - previousPage > 1;

                    return (
                      <div key={page} className="flex items-center gap-1.5">
                        {showGap && (
                          <span className="px-1 text-[11px] text-faint">...</span>
                        )}
                        <button
                          onClick={() => changeMarketPage(page)}
                          className={cn(
                            "min-w-8 rounded-[6px] border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                            page === currentMarketPage
                              ? "border-accent-border bg-accent-dark text-white"
                              : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
                          )}
                        >
                          {page}
                        </button>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => changeMarketPage(Math.min(totalMarketPages, currentMarketPage + 1))}
                    disabled={currentMarketPage === totalMarketPages}
                    className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                  >
                    {t("install.pagination.next")}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Local tab */}
      {activeTab === "local" && (
        <div className="flex-1 animate-in fade-in duration-300 space-y-4 pb-8">
          <div
            onClick={handleLocalInstall}
            className="w-full bg-surface border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-surface-hover hover:border-accent-border transition-colors cursor-pointer group"
          >
            <div className="w-10 h-10 bg-surface-hover rounded-full flex items-center justify-center mb-3 group-hover:bg-accent-bg transition-colors">
              <FolderUp className="w-5 h-5 text-muted group-hover:text-accent-light" />
            </div>
            <h3 className="text-[13px] font-semibold text-secondary mb-1">{t("install.dragDrop")}</h3>
            <p className="text-muted text-[12px] mb-3 max-w-sm">{t("install.dragDropDesc")}</p>
            <button className="px-3 py-1.5 rounded-[4px] bg-surface-active hover:bg-surface-hover border border-border text-secondary text-[11px] font-medium transition-colors">
              {t("install.selectLocal")}
            </button>
          </div>

          <section className="bg-surface border border-border-subtle rounded-lg overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border-subtle flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[13px] font-semibold text-secondary">{t("install.scan.title")}</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {scanResult
                    ? t("install.scan.summary", {
                      tools: scanResult.tools_scanned,
                      skills: scanResult.skills_found,
                    })
                    : t("install.scan.initial")}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={runScan}
                  disabled={scanLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-surface-hover hover:bg-surface-active border border-border text-secondary text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", scanLoading && "animate-spin")} />
                  {t("install.scan.rescan")}
                </button>
                <button
                  onClick={handleImportAllDiscovered}
                  disabled={scanLoading || importingAll || !scanResult || scanResult.groups.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] bg-accent-dark hover:bg-accent border border-accent-border text-white text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {importingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="w-3.5 h-3.5" />
                  )}
                  {t("install.scan.importAll")}
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-border-subtle bg-bg-secondary px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("install.scan.stats.detected")}
                  </p>
                  <p className="mt-1 text-[20px] font-semibold text-primary">{scanGroups.length}</p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-secondary px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("install.scan.stats.pending")}
                  </p>
                  <p className="mt-1 text-[20px] font-semibold text-primary">{pendingGroups.length}</p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-secondary px-3.5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("install.scan.stats.imported")}
                  </p>
                  <p className="mt-1 text-[20px] font-semibold text-primary">{importedGroups}</p>
                </div>
              </div>

              {scanLoading ? (
                <div className="py-12 flex items-center justify-center gap-2.5 text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px]">{t("install.scan.scanning")}</span>
                </div>
              ) : scanResult && scanGroups.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-10 h-10 rounded-lg bg-surface-hover border border-border flex items-center justify-center mb-3">
                    <FolderSearch className="w-5 h-5 text-muted" />
                  </div>
                  <h3 className="text-[13px] font-semibold text-tertiary mb-1">
                    {t("install.scan.noResults")}
                  </h3>
                  <p className="text-[11px] text-muted">{t("install.scan.noResultsHint")}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border-subtle bg-bg-secondary/70 px-3.5 py-2.5">
                    <p className="text-[11px] text-muted">
                      {pendingGroups.length > 0
                        ? t("install.scan.listHint")
                        : t("install.scan.listImportedHint")}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
                    {scanGroups.map((group) => {
                      const [primaryLocation, ...otherLocations] = group.locations;
                      const primaryPath = primaryLocation?.found_path;
                      const isImporting = !!primaryPath && importingPaths.has(primaryPath);

                      return (
                        <article key={group.name} className="border-b border-border-subtle last:border-b-0">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-3 py-2 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-center">
                            <div className="flex min-w-0 items-center gap-2">
                              <h3 className="truncate text-[13px] font-semibold text-secondary">
                                {group.name}
                              </h3>
                              <span className="shrink-0 rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] text-muted">
                                {t("install.scan.locations", { count: group.locations.length })}
                              </span>
                            </div>

                            <div className="row-span-2 flex shrink-0 items-start justify-end lg:row-span-1 lg:items-center">
                              {group.imported ? (
                                <span className="inline-flex items-center gap-1 rounded-[6px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400">
                                  <Check className="h-3 w-3" />
                                  {t("install.scan.imported")}
                                </span>
                              ) : (
                                <button
                                  onClick={() => primaryPath && handleImportDiscovered(primaryPath, group.name)}
                                  disabled={!primaryPath || isImporting}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-accent-border bg-accent-dark px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-accent disabled:opacity-50"
                                >
                                  {isImporting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="h-3 w-3" />
                                  )}
                                  {t("install.scan.importOne")}
                                </button>
                              )}
                            </div>

                            {primaryLocation && (
                              <div className="col-span-2 min-w-0 flex items-center gap-2 lg:col-span-1">
                                <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[10px] font-medium text-tertiary">
                                  {primaryLocation.tool}
                                </span>
                                <code className="block min-w-0 truncate text-[11px] text-tertiary">
                                  {primaryLocation.found_path}
                                </code>
                              </div>
                            )}
                          </div>

                          {otherLocations.length > 0 && (
                            <div className="border-t border-border-subtle bg-surface/40 px-3 py-1.5">
                              <div className="space-y-1">
                                {otherLocations.map((location) => (
                                  <div key={location.id} className="flex min-w-0 items-center gap-2">
                                    <span className="inline-flex shrink-0 rounded-[4px] border border-border-subtle bg-surface px-1.5 py-px text-[10px] font-medium text-tertiary">
                                      {location.tool}
                                    </span>
                                    <code className="block min-w-0 truncate text-[11px] text-muted">
                                      {location.found_path}
                                    </code>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Git tab */}
      {activeTab === "git" && (
        <div className="flex-1 animate-in fade-in duration-300">
          <div className="max-w-lg bg-surface border border-border-subtle rounded-lg p-5">
            <div className="mb-4 flex items-center justify-center w-10 h-10 bg-surface-hover rounded-lg border border-border">
              <Github className="w-5 h-5 text-tertiary" />
            </div>
            <h2 className="text-[13px] font-semibold text-primary mb-1">{t("install.gitTitle")}</h2>
            <p className="text-muted text-[12px] mb-4">{t("install.gitDesc")}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-tertiary mb-1">
                  {t("install.repoUrl")}
                </label>
                <input
                  type="text"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder={t("install.repoUrlPlaceholder")}
                  className="w-full bg-background border border-border-subtle rounded-[4px] px-3 py-2 text-[12px] text-secondary focus:outline-none focus:border-border transition-all placeholder-faint"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-tertiary mb-1 flex items-center gap-2">
                  {t("install.customName")}
                  <span className="text-[10px] text-faint font-normal">{t("install.customNameOptional")}</span>
                </label>
                <input
                  type="text"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  placeholder={t("install.customNamePlaceholder")}
                  className="w-full bg-background border border-border-subtle rounded-[4px] px-3 py-2 text-[12px] text-secondary focus:outline-none focus:border-border transition-all placeholder-faint"
                />
              </div>
              <div className="pt-2">
                <button
                  onClick={handleGitInstall}
                  disabled={!gitUrl.trim() || gitLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-[4px] bg-accent-dark hover:bg-accent text-white text-[12px] font-medium transition-colors w-full border border-accent-border disabled:opacity-50"
                >
                  {gitLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="w-3.5 h-3.5" />
                  )}
                  {gitLoading ? t("install.installing") : t("install.installClone")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
