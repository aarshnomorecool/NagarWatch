"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggleButton } from "@/components/ui/theme-toggle";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V21h14V9.8" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 6-3 8h18c0-2-3-1-3-8" />
      <path d="M10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function isActivePath(currentPath: string, href: string) {
  return currentPath === href || (href !== "/" && currentPath.startsWith(href));
}

export function Navbar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClientOrNull();

    const loadUser = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { user } = await getAuthUserSafe();
      if (!user) {
        setEmail(null);
        setRole(null);
        setUserId(null);
        setUnreadNotifications(0);
        setLoading(false);
        return;
      }

      const profile = await ensureUserProfile();
      const resolvedRole = profile?.role ?? "citizen";

      setEmail(profile?.email ?? user.email ?? null);
      setRole(resolvedRole);
      setUserId(user.id);

      if (resolvedRole === "citizen") {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null);

        setUnreadNotifications(count ?? 0);
      } else {
        setUnreadNotifications(0);
      }

      setLoading(false);
    };

    void loadUser();

    if (!supabase) {
      return;
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase || !userId || role !== "citizen") {
      return;
    }

    const refreshUnreadCount = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

      setUnreadNotifications(count ?? 0);
    };

    const channel = supabase
      .channel(`navbar-notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        void refreshUnreadCount();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, role]);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setEmail(null);
    setRole(null);
    setUserId(null);
    setUnreadNotifications(0);
  };

  const isAuthority = role === "authority" || role === "admin";

  const navItems: NavItem[] = loading
    ? [
        { href: "/", label: "Home", icon: <HomeIcon /> },
        { href: "/map", label: "Map", icon: <MapIcon /> },
        { href: "/citizen/login", label: "Account", icon: <UserIcon /> },
      ]
    : isAuthority
    ? [
        { href: "/admin/dashboard", label: "Home", icon: <HomeIcon /> },
        { href: "/map", label: "Map", icon: <MapIcon /> },
        { href: "/admin/issues", label: "Issues", icon: <PlusIcon /> },
        { href: email ? "/account" : "/admin/login", label: "Account", icon: <UserIcon /> },
      ]
    : [
        { href: "/", label: "Home", icon: <HomeIcon /> },
        { href: "/citizen/reports", label: "Reports", icon: <PlusIcon /> },
        { href: "/map", label: "Map", icon: <MapIcon /> },
        { href: "/report", label: "Report", icon: <PlusIcon /> },
        { href: email ? "/account" : "/citizen/login", label: "Account", icon: <UserIcon /> },
      ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}>
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href={isAuthority ? "/admin/dashboard" : "/"} className="app-logo text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            NagarWatch
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium uppercase tracking-wide text-muted sm:inline">Civic Monitoring</span>
            {email ? <span className="hidden text-xs text-muted md:inline">{email}{role ? ` (${role})` : ""}</span> : null}
            {email && !isAuthority ? (
              <Link
                href="/notifications"
                className="btn-secondary relative p-2"
                aria-label="Notifications"
                title="Notifications"
              >
                <BellIcon />
                {unreadNotifications > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold"
                    style={{ color: "#fff", background: "#b91c1c" }}
                  >
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <ThemeToggleButton iconOnly className="btn-secondary p-2" />
            {email ? (
              <button type="button" onClick={() => void signOut()} className="btn-secondary p-2" aria-label="Logout" title="Logout">
                <LogoutIcon />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="fixed bottom-3 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-end justify-around rounded-3xl border px-2 py-2 shadow-2xl backdrop-blur-xl lg:hidden" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)", background: "color-mix(in srgb, var(--bg) 72%, transparent)" }}>
        {navItems.map((item) => {
          const active = isActivePath(currentPath, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition"
              style={active ? { color: "var(--primary)", background: "color-mix(in srgb, var(--accent) 22%, transparent)" } : { color: "var(--text)" }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2 rounded-3xl border p-2 shadow-xl backdrop-blur-xl lg:flex" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)", background: "color-mix(in srgb, var(--bg) 78%, transparent)" }}>
        {navItems.map((item) => {
          const active = isActivePath(currentPath, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition"
              style={active ? { color: "var(--primary)", background: "color-mix(in srgb, var(--accent) 22%, transparent)" } : { color: "var(--text)" }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}