"use client";

import { ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, Moon, Search, ShieldCheck, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ROLE_HOME, ROLE_LABEL, useAuth } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./logo";
import { Spinner } from "../ui/misc";

/** Which role owns which URL prefix (the API still enforces everything). */
const OWNER: Array<[string, "INCHARGE" | "ENGINEER" | "APPROVER" | "ADMIN" | "ANY"]> = [
  ["/incharge", "INCHARGE"],
  ["/engineer", "ENGINEER"],
  ["/approver", "APPROVER"],
  ["/admin", "ADMIN"],
  ["/reports", "ANY"],
];

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("tp-theme", d ? "dark" : "light"); } catch { /* ignore */ }
  };
  return { dark, toggle };
}

/** Sidebar collapsed to an icon rail; remembered in this browser. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("tp-sidebar") === "collapsed"); } catch { /* storage unavailable */ }
  }, []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("tp-sidebar", c ? "expanded" : "collapsed"); } catch { /* ignore */ }
    return !c;
  });
  return { collapsed, toggle };
}

type Tip = { text: string; sub?: string; x: number; y: number } | null;

function useBadges(role?: string) {
  const [b, setB] = useState<Record<string, number>>({});
  const path = usePathname();
  useEffect(() => {
    if (!role) return;
    let off = false;
    (async () => {
      try {
        if (role === "ENGINEER") {
          const d = await api("/dashboard/me");
          if (!off) setB({ returned: d.returned });
        } else if (role === "INCHARGE") {
          const d = await api("/dashboard/incharge");
          if (!off) setB({ overdue: d.kpis.overdue });
        } else if (role === "APPROVER") {
          const d = await api("/dashboard/lab");
          if (!off) setB({ queue: d.kpis.awaitingReview, sign: d.kpis.awaitingSignature });
        }
      } catch { /* ignore */ }
    })();
    return () => { off = true; };
  }, [role, path]);
  return b;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const { dark, toggle } = useTheme();
  const badges = useBadges(user?.role);
  const { collapsed, toggle: toggleSidebar } = useCollapsed();
  const [tip, setTip] = useState<Tip>(null);
  /** Hover / focus handlers that show the item's name next to the rail (only when collapsed). */
  const tipFor = (text: string, sub?: string) => {
    if (!collapsed) return {};
    const show = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setTip({ text, sub, x: r.right + 12, y: r.top + r.height / 2 }); };
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget),
      onMouseLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: () => setTip(null),
    };
  };

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace(`/login?next=${encodeURIComponent(path)}`); return; }
    if (user.mustChangePassword) { router.replace("/change-password"); return; }
    const owner = OWNER.find(([p]) => path.startsWith(p))?.[1];
    if (owner && owner !== "ANY" && owner !== user.role) router.replace(ROLE_HOME[user.role]);
    if (owner === "ANY" && (user.role === "ADMIN" || user.role === "INCHARGE")) router.replace(ROLE_HOME[user.role]);
  }, [ready, user, path, router]);

  useEffect(() => { setOpen(false); setTip(null); }, [path]);
  useEffect(() => { setTip(null); }, [collapsed]);

  if (!ready || !user || user.mustChangePassword) {
    return <div className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8" /></div>;
  }

  const nav = NAV[user.role];
  const role = ROLE_LABEL[user.role];
  const initials = user.name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
  /** Exact page or a real sub-page ("/approver/sign" must not match "/approver/signed"). */
  const under = (href: string) => path === href || path.startsWith(href + "/");
  const isActive = (href: string) => (href === "/engineer" || href === "/approver" || href === "/incharge" ? path === href || (href !== "/incharge" && under(href + "/cases")) : under(href));

  const NavList = (
    <nav className="space-y-1">
      {nav.map((n) => {
        const active = isActive(n.href);
        const count = n.badgeKey ? badges[n.badgeKey] : 0;
        return (
          <Link key={n.href} href={n.href}
            className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition",
              active ? "bg-white text-navy-700 shadow-lg shadow-navy-950/20" : "text-navy-100 hover:bg-white/10 hover:text-white")}>
            <n.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-saffron-500" : "text-navy-300 group-hover:text-white")} />
            <span className="min-w-0 flex-1 leading-snug">{n.label}</span>
            {count ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-saffron-400 text-navy-950" : "bg-saffron-400/90 text-navy-950")}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  const RailNav = (
    <nav className="flex flex-col items-center gap-1.5">
      {nav.map((n) => {
        const active = isActive(n.href);
        const count = n.badgeKey ? badges[n.badgeKey] : 0;
        return (
          <Link key={n.href} href={n.href} aria-label={n.label} {...tipFor(n.label, count ? `${count} ${n.badgeKey === "returned" ? "returned for correction" : n.badgeKey === "overdue" ? "overdue" : "pending"}` : undefined)}
            className={cn("relative grid h-11 w-11 place-items-center rounded-xl transition",
              active ? "bg-white text-navy-700 shadow-lg shadow-navy-950/20" : "text-navy-200 hover:bg-white/10 hover:text-white")}>
            <n.icon className={cn("h-5 w-5", active && "text-saffron-500")} />
            {count ? <span className={cn("absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-saffron-400 px-1 text-[10.5px] font-bold leading-none text-navy-950 ring-2", active ? "ring-white" : "ring-navy-800")}>{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );

  const railBtn = "grid h-10 w-10 place-items-center rounded-xl text-navy-100 hover:bg-white/10";
  const RailUser = (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.07] py-2 ring-1 ring-white/10">
      <div tabIndex={0} {...tipFor(user.name, role.en)} className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-saffron-300 to-saffron-500 text-sm font-bold text-navy-950">{initials || "U"}</div>
      <Link href="/change-password" aria-label="Change password" {...tipFor("Change password")} className={railBtn}><KeyRound className="h-4 w-4" /></Link>
      <button onClick={toggle} aria-label="Toggle theme" {...tipFor(dark ? "Light mode" : "Dark mode")} className={railBtn}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
      <button onClick={async () => { await logout(); router.replace("/login"); }} aria-label="Logout" {...tipFor("Logout")} className={cn(railBtn, "hover:bg-fail-600 hover:text-white")}><LogOut className="h-4 w-4" /></button>
    </div>
  );

  const UserCard = (
    <div className="rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-saffron-300 to-saffron-500 text-sm font-bold text-navy-950">{initials || "U"}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="truncate text-[11.5px] text-navy-200">{role.en}</p>
        </div>
      </div>
      <Link href="/change-password" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-1.5 text-xs text-navy-100 hover:bg-white/15">
        <KeyRound className="h-3.5 w-3.5" /> Change password
      </Link>
      <div className="mt-2 flex gap-2">
        <button onClick={toggle} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-1.5 text-xs text-navy-100 hover:bg-white/15" aria-label="Toggle theme">
          {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />} {dark ? "Light" : "Dark"}
        </button>
        <button onClick={async () => { await logout(); router.replace("/login"); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 py-1.5 text-xs text-navy-100 hover:bg-fail-600 hover:text-white">
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className={cn("min-h-dvh transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
      {/* Sidebar (desktop): full, or collapsed to an icon rail with hover labels */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col bg-gradient-to-b from-navy-700 via-navy-800 to-navy-950 py-5 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px] px-2.5" : "w-64 px-4")}>
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <button onClick={toggleSidebar} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-7 z-10 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-navy-600 text-white shadow-md hover:bg-saffron-500">
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
        {collapsed ? (
          <>
            <div className="relative flex justify-center" {...tipFor("TOLPRAMAN", `${role.en} workspace`)}><LogoMark /></div>
            <div className="scrollbar-thin relative mt-8 flex-1 overflow-y-auto overflow-x-hidden">{RailNav}</div>
            <div className="relative mt-4">{RailUser}</div>
          </>
        ) : (
          <>
            <div className="relative px-2"><Logo light /></div>
            <div className="relative mt-3 px-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-saffron-400/15 px-2.5 py-1 text-[11px] font-semibold text-saffron-300 ring-1 ring-saffron-400/30">
                <ShieldCheck className="h-3.5 w-3.5" /> {role.en} workspace
              </span>
            </div>
            <div className="scrollbar-thin relative mt-6 flex-1 overflow-y-auto pr-1">{NavList}</div>
            <div className="relative mt-4">{UserCard}</div>
          </>
        )}
      </aside>
      {tip && (
        <div role="tooltip" className="pointer-events-none fixed z-50 hidden -translate-y-1/2 animate-fade-in lg:block" style={{ left: tip.x, top: tip.y }}>
          <div className="relative rounded-lg bg-navy-950 px-3 py-1.5 text-sm font-medium text-white shadow-xl ring-1 ring-white/10">
            <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-navy-950" />
            {tip.text}
            {tip.sub && <span className="block text-[11px] font-normal text-navy-200">{tip.sub}</span>}
          </div>
        </div>
      )}

      {/* Top bar (mobile / tablet): the sidebar collapses to a top menu */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/10 bg-navy-700 px-4 lg:hidden">
        <Logo light compact />
        <span className="text-sm font-bold tracking-[0.12em] text-white">TOLPRAMAN</span>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 z-30 max-h-[calc(100dvh-3.5rem)] overflow-y-auto bg-navy-800 p-4 shadow-2xl animate-slide-up lg:hidden">
          {NavList}
          <div className="mt-4">{UserCard}</div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-[1500px] px-4 py-6 md:px-6 md:py-8 xl:px-8">
        {children}
      </main>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-80">
      <Search className="text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search…"}
        className="surface h-10 w-full rounded-xl border border-line pl-9 pr-3 text-sm focus:border-navy-400 focus:outline-none focus:ring-4 focus:ring-navy-500/10" />
    </div>
  );
}
