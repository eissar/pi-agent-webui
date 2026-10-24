import type { PluginPackageInfo } from "./api-types.ts";
import { formatNumber } from "./locale-format.ts";

export function pluginResourceSummary(pkg: PluginPackageInfo): string {
  if (pkg.disabled) return "Disabled";
  const parts = [
    pkg.counts.extensions ? "{count} ext".replace("{count}", formatNumber(pkg.counts.extensions)) : "",
    pkg.counts.skills ? "{count} skills".replace("{count}", formatNumber(pkg.counts.skills)) : "",
    pkg.counts.prompts ? "{count} prompts".replace("{count}", formatNumber(pkg.counts.prompts)) : "",
    pkg.counts.themes ? "{count} themes".replace("{count}", formatNumber(pkg.counts.themes)) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No resources";
}

export function pluginVersionSummary(pkg: PluginPackageInfo): string {
  const parts = [];
  if (pkg.version) parts.push("installed {version}".replace("{version}", pkg.version));
  if (pkg.configuredVersion) {
    parts.push("configured {version}".replace("{version}", pkg.configuredVersion));
  }
  return parts.length ? parts.join(" · ") : "unknown";
}

export function pluginStatusLabel(status: PluginPackageInfo["status"]): string {
  if (status === "loaded") return "loaded";
  if (status === "installed") return "installed";
  if (status === "disabled") return "Disabled";
  return "missing";
}
