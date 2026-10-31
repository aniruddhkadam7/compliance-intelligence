import {
  LayoutDashboard, Library, Quote, Network, ShieldCheck, GitCompareArrows, RadioTower, DatabaseZap, type LucideIcon,
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
      { href: "/frameworks", label: "Framework Repository", icon: Library },
      { href: "/citations", label: "Citation Explorer", icon: Quote },
    ],
  },
  {
    section: "Mapping",
    items: [
      { href: "/mappings", label: "Cross-Framework Mapping", icon: Network },
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
