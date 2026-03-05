"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/user-profile";
import type { UserRole } from "@/types/database";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/report", label: "Report Issue" },
  { href: "/admin/dashboard", label: "Admin" },
];

export function Navbar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const supabase = getSupabaseBrowserClientOrNull();
      if (!supabase) {
        setEmail(null);
        setRole(null);
        return;
      }

      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setEmail(null);
        setRole(null);
        return;
      }

      const profile = await ensureUserProfile(data.user);
      setEmail(data.user.email ?? profile?.email ?? null);
      setRole(profile?.role ?? "citizen");
    };

    void loadUser();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setEmail(null);
    setRole(null);
  };

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 88%, transparent)" }}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            CivicSync
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Civic Monitoring</span>
            {email ? <span className="text-xs text-slate-600">{email}{role ? ` (${role})` : ""}</span> : null}
            {email ? (
              <>
                <Link href="/account" className="btn-secondary px-3 py-1.5 text-xs">Account</Link>
                <button type="button" onClick={() => void signOut()} className="btn-secondary px-3 py-1.5 text-xs">
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-secondary px-3 py-1.5 text-xs">Login</Link>
            )}
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                currentPath === link.href || (link.href !== "/" && currentPath.startsWith(link.href))
                  ? "text-white"
                  : ""
              }`}
              style={
                currentPath === link.href || (link.href !== "/" && currentPath.startsWith(link.href))
                  ? { borderColor: "var(--primary)", background: "var(--primary)" }
                  : { borderColor: "var(--border)", color: "var(--text)", background: "var(--bg)" }
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}