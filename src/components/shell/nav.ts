import {
  LayoutDashboard, Library, Quote, Network, ShieldCheck, GitCompareArrows, DatabaseZap, BookOpenText, type LucideIcon,
} from "lucide-react";
import { TERMS } from "@/lib/terms";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "updates";
}

// Updates & Monitoring (/updates) is reached from Sources and the notification bell.
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Intelligence", items: [{ href: "/overview", label: TERMS.overview, icon: LayoutDashboard }] },
  {
    section: "Global repository",
    items: [
      { href: "/frameworks", label: TERMS.frameworks, icon: Library },
      { href: "/sources", label: TERMS.sources, icon: BookOpenText, badgeKey: "updates" },
      { href: "/citations", label: TERMS.obligations, icon: Quote },
      { href: "/mappings", label: TERMS.frameworkMapping, icon: Network },
    ],
  },
  {
    section: "Client",
    items: [
      { href: "/controls", label: TERMS.clientControls, icon: ShieldCheck },
      { href: "/version-impact", label: TERMS.versionImpact, icon: GitCompareArrows },
    ],
  },
  { section: "Operations", items: [{ href: "/data", label: TERMS.data, icon: DatabaseZap }] },
];
