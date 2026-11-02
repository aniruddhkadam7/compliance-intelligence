import {
  LayoutDashboard, Library, Quote, Network, ShieldCheck, GitCompareArrows, RadioTower, DatabaseZap, BookOpenText, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "updates";
}

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Intelligence", items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard }] },
  {
    section: "Repository",
    items: [
      { href: "/sources", label: "Sources", icon: BookOpenText },
      { href: "/frameworks", label: "Framework Repository", icon: Library },
      { href: "/citations", label: "Obligation Explorer", icon: Quote },
    ],
  },
  {
    section: "Mapping",
    items: [
      { href: "/mappings", label: "Legacy vs Latest", icon: Network },
      { href: "/controls", label: "Internal CCF Mapping", icon: ShieldCheck },
      { href: "/version-impact", label: "Version Impact", icon: GitCompareArrows },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/updates", label: "Updates & Connectors", icon: RadioTower, badgeKey: "updates" },
      { href: "/data", label: "Data & Imports", icon: DatabaseZap },
    ],
  },
];
