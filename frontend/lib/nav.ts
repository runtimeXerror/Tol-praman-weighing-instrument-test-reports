import {
  BookOpenCheck, History, ClipboardList, FileSearch, FileSignature, FlaskConical, FolderOpen, LayoutDashboard,
  PackagePlus, Paperclip, PenLine, ScrollText, Users, Settings2, Thermometer, UserCog, Building2, Scale, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: string;
}

/** Menus per role, exactly as specified for the three roles. */
export const NAV: Record<"INCHARGE" | "ENGINEER" | "APPROVER" | "ADMIN", NavItem[]> = {
  INCHARGE: [
    { href: "/incharge", label: "Dashboard", icon: LayoutDashboard },
    { href: "/incharge/new", label: "Receive & Assign", icon: PackagePlus },
    { href: "/incharge/assign", label: "Assignments", icon: Users, badgeKey: "overdue" },
    { href: "/incharge/history", label: "History", icon: History },
  ],
  ENGINEER: [
    { href: "/engineer", label: "My Cases", icon: FolderOpen, badgeKey: "returned" },
    { href: "/engineer/tests", label: "Test Entry Forms", icon: FlaskConical },
    { href: "/engineer/environment", label: "Environment Log", icon: Thermometer },
    { href: "/engineer/attachments", label: "Attachments", icon: Paperclip },
    { href: "/reports", label: "Search Reports", icon: FileSearch },
  ],
  APPROVER: [
    { href: "/approver", label: "Lab Dashboard", icon: LayoutDashboard },
    { href: "/approver/queue", label: "Review Queue", icon: ClipboardList, badgeKey: "queue" },
    { href: "/approver/sign", label: "Sign & Lock", icon: PenLine, badgeKey: "sign" },
    { href: "/approver/signed", label: "Signed Reports", icon: FileSignature },
    { href: "/reports", label: "Search Reports", icon: FileSearch },
  ],
  ADMIN: [
    { href: "/admin/users", label: "Users & Roles", icon: UserCog },
    { href: "/admin/lab", label: "Lab Profile", icon: Building2 },
    { href: "/admin/equipment", label: "Equipment Register", icon: Scale },
    { href: "/admin/rulepacks", label: "Standard Versions", icon: BookOpenCheck },
    { href: "/admin/audit", label: "Activity Log", icon: ScrollText },
    { href: "/admin/settings", label: "System Settings", icon: Settings2 },
  ],
};

