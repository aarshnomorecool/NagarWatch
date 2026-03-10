"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentProfile } from "@/lib/user-profile";
import { initializeThemeFromStorage, setDarkPalette, type DarkPalette, type Theme } from "@/lib/theme";
import type { DbNotification, UserRole } from "@/types/database";

const DARK_THEME_PRESETS: Array<{ id: DarkPalette; label: string; colors: [string, string, string, string] }> = [
  { id: "mono", label: "Graphite", colors: ["#000000", "#d1d5db", "#6b7280", "#ffffff"] },
  { id: "blue", label: "Blue Night", colors: ["#1d4ed8", "#93c5fd", "#0f172a", "#ffffff"] },
  { id: "green", label: "Green Grove", colors: ["#16a34a", "#86efac", "#0f172a", "#ffffff"] },
  { id: "purple", label: "Purple Haze", colors: ["#7e22ce", "#d8b4fe", "#111827", "#ffffff"] },
];

export default function AccountPage() {
  return (
    <Suspense fallback={<section className="surface-card mx-auto w-full max-w-md p-4 text-sm text-slate-600">Loading account...</section>}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [issueCount, setIssueCount] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [darkPalette, setDarkPaletteState] = useState<DarkPalette>("mono");

  useEffect(() => {
    const { theme: storedTheme, darkPalette: storedPalette } = initializeThemeFromStorage();
    setTheme(storedTheme);
    setDarkPaletteState(storedPalette);

    const onThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme: Theme; darkPalette: DarkPalette }>;
      setTheme(customEvent.detail.theme);
      setDarkPaletteState(customEvent.detail.darkPalette);
    };

    window.addEventListener("nagarwatch:theme-change", onThemeChange as EventListener);
    return () => window.removeEventListener("nagarwatch:theme-change", onThemeChange as EventListener);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseBrowserClientOrNull();
        if (!supabase) {
          throw new Error("Supabase is not configured.");
        }

        const roleQuery = searchParams?.get("role");
        const preferredRole: UserRole | undefined = roleQuery === "authority" || roleQuery === "admin" ? "authority" : roleQuery === "citizen" ? "citizen" : undefined;

        const { user, error: authError } = await getAuthUserSafe();
        if (authError) {
          throw authError;
        }

        if (!user) {
          router.replace("/citizen/login");
          return;
        }

        const ensuredProfile = await ensureUserProfile({ preferredRole });
        const profile = await getCurrentProfile();
        const currentId = profile?.id ?? ensuredProfile?.id ?? user.id;

        const [{ count: registeredCount, error: countError }, { count: resolvedTotal, error: resolvedError }] = await Promise.all([
          supabase.from("issues").select("id", { head: true, count: "exact" }).eq("created_by", currentId),
          supabase.from("resolutions").select("id", { head: true, count: "exact" }).eq("resolved_by", currentId),
        ]);

        const { data: notificationRows } = await supabase
          .from("notifications")
          .select("id,user_id,issue_id,notification_type,title,body,read_at,created_at")
          .eq("user_id", currentId)
          .order("created_at", { ascending: false })
          .limit(15);

        if (countError || resolvedError) {
          throw new Error(countError?.message ?? resolvedError?.message ?? "Unable to load account stats.");
        }

        if (!active) {
          return;
        }

      setEmail(profile?.email ?? ensuredProfile?.email ?? user.email ?? null);
      setRole(profile?.role ?? "citizen");
      setIssueCount(registeredCount ?? 0);
      setResolvedCount(resolvedTotal ?? 0);
      setNotifications(notificationRows ?? []);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Unable to load account.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  const roleLabel = useMemo(() => {
    if (!role) return "-";
    if (role === "admin") return "Admin";
    if (role === "authority") return "Authority";
    return "Citizen";
  }, [role]);

  const logout = async () => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const markNotificationRead = async (notificationId: string) => {
    const supabase = getSupabaseBrowserClientOrNull();
    if (!supabase) {
      return;
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("id", notificationId);

    if (updateError) {
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              read_at: now,
            }
          : notification,
      ),
    );
  };

  if (loading) {
    return <section className="surface-card mx-auto w-full max-w-md p-4 text-sm text-slate-600">Loading account...</section>;
  }

  return (
    <section className="mx-auto w-full max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>My Account</h1>
      <div className="surface-card space-y-3 p-5">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm" style={{ color: "var(--text)" }}><span className="font-semibold">Email:</span> {email ?? "-"}</p>
        <p className="text-sm" style={{ color: "var(--text)" }}><span className="font-semibold">Role:</span> {roleLabel}</p>
        <p className="text-sm" style={{ color: "var(--text)" }}><span className="font-semibold">Complaints registered:</span> {issueCount}</p>
        <p className="text-sm" style={{ color: "var(--text)" }}><span className="font-semibold">Complaints resolved:</span> {resolvedCount}</p>
        <button type="button" onClick={() => void logout()} className="btn-secondary w-full py-2.5">Logout</button>
      </div>

      <div className="surface-card space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Theme Palette</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Palette choices are available only while dark mode is enabled.</p>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 25%, transparent)" }} aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a9 9 0 1 0 9 9c0-1.4-1.1-2.5-2.5-2.5H16a2 2 0 0 1-2-2V5.5C14 4.1 12.9 3 11.5 3H12Z" />
              <circle cx="7.5" cy="11" r="1" />
              <circle cx="10" cy="7.5" r="1" />
              <circle cx="15.5" cy="13" r="1" />
            </svg>
          </span>
        </div>

        {theme !== "dark" ? (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)", background: "color-mix(in srgb, var(--surface) 86%, transparent)" }}>
            Enable dark mode from the top-right theme icon to unlock palette options.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DARK_THEME_PRESETS.map((preset) => {
              const selected = darkPalette === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDarkPalette(preset.id)}
                  className="rounded-xl border px-3 py-2 text-left transition"
                  style={
                    selected
                      ? { borderColor: "var(--primary)", background: "color-mix(in srgb, var(--accent) 20%, transparent)" }
                      : { borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 85%, transparent)" }
                  }
                  aria-pressed={selected}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{preset.label}</span>
                    <span className="flex items-center gap-1">
                      {preset.colors.map((swatch) => (
                        <span key={`${preset.id}-${swatch}`} className="h-3.5 w-3.5 rounded-full border" style={{ background: swatch, borderColor: "rgba(255,255,255,0.4)" }} aria-hidden="true" />
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="surface-card space-y-3 p-5">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>My Reports</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>View and manage all your submitted complaints.</p>
        <Link href="/citizen/reports" className="btn-secondary w-full py-2.5 text-center">
          View My Reports
        </Link>
      </div>

      <div className="surface-card space-y-3 p-5">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Civic Leaderboard</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>See where you stand in the community and compete with other citizens.</p>
        <Link href="/leaderboard" className="btn-secondary w-full py-2.5 text-center">
          See Leaderboard
        </Link>
      </div>

      <div className="surface-card space-y-3 p-5">
        <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Notifications</h2>
        {notifications.length === 0 ? <p className="text-sm text-muted">No notifications yet.</p> : null}

        <div className="space-y-2">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className="rounded-md border px-3 py-2"
              style={{
                borderColor: "var(--border)",
                background: notification.read_at ? "color-mix(in srgb, var(--bg) 92%, transparent)" : "color-mix(in srgb, var(--accent) 16%, transparent)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{notification.title}</p>
                  <p className="mt-1 text-xs text-muted">{notification.body}</p>
                  <p className="mt-1 text-[11px] text-muted">{new Date(notification.created_at).toLocaleString()}</p>
                </div>
                {!notification.read_at ? (
                  <button
                    type="button"
                    onClick={() => void markNotificationRead(notification.id)}
                    className="btn-secondary px-2 py-1 text-[11px]"
                  >
                    Mark Read
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
