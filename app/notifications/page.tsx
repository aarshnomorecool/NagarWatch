"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthUserSafe, getSupabaseBrowserClientOrNull } from "@/lib/supabase";
import { ensureUserProfile, getCurrentProfile } from "@/lib/user-profile";
import type { DbNotification } from "@/types/database";

export default function NotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const { user, error: authError } = await getAuthUserSafe();
        if (authError) {
          throw authError;
        }

        if (!user) {
          router.replace("/login");
          return;
        }

        const ensuredProfile = await ensureUserProfile();
        const profile = await getCurrentProfile();
        const currentId = profile?.id ?? ensuredProfile?.id ?? user.id;

        const { data: notificationRows, error: notificationsError } = await supabase
          .from("notifications")
          .select("id,user_id,issue_id,notification_type,title,body,read_at,created_at")
          .eq("user_id", currentId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (notificationsError) {
          throw new Error(notificationsError.message);
        }

        if (!active) {
          return;
        }

        setNotifications(notificationRows ?? []);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "Unable to load notifications.");
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
  }, [router]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read_at).length, [notifications]);

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
    return <section className="surface-card mx-auto w-full max-w-3xl p-4 text-sm text-muted">Loading notifications...</section>;
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="surface-card flex items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Notifications</h1>
          <p className="mt-1 text-sm text-muted">All updates for followed and reported issues.</p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ color: "var(--text)", background: "color-mix(in srgb, var(--accent) 20%, transparent)", border: "1px solid var(--border)" }}>
          Unread: {unreadCount}
        </span>
      </div>

      <div className="surface-card space-y-3 p-5">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
