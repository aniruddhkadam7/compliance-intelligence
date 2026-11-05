import {
  LayoutDashboard, Library, Network, Plug, ShieldCheck, GitCompareArrows, DatabaseZap, BookOpenText, Settings2, type LucideIcon,
} from "lucide-react";
import { TERMS } from "@/lib/terms";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "updates";
  /** Shown only to admins. */
  adminOnly?: boolean;
}

// Connectors is the Updates & Connectors page (/updates); detected updates also reach it from the notification bell.
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Intelligence", items: [{ href: "/overview", label: TERMS.overview, icon: LayoutDashboard }] },
  {
    section: "Global repository",
    items: [
      { href: "/sources", label: TERMS.sources, icon: BookOpenText, badgeKey: "updates" },
      { href: "/frameworks", label: TERMS.frameworks, icon: Library },
      { href: "/mappings", label: TERMS.frameworkMapping, icon: Network },
    ],
  },
  {
    section: "Custom frameworks",
    items: [
      { href: "/controls", label: TERMS.clientControls, icon: ShieldCheck },
      { href: "/change-analytics", label: TERMS.versionImpact, icon: GitCompareArrows },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/updates", label: "Connectors", icon: Plug },
      { href: "/data", label: TERMS.data, icon: DatabaseZap },
      { href: "/admin", label: "Admin Console", icon: Settings2, adminOnly: true },
    ],
  },
];
