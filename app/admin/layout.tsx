"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUserRole } from "@/lib/user-profile";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const checkRole = async () => {
      const role = await getCurrentUserRole();

      if (!active) {
        return;
      }

      if (role === "authority" || role === "admin") {
        setAllowed(true);
        setChecking(false);
        return;
      }

      setAllowed(false);
      setChecking(false);
      router.replace("/map");
    };

    void checkRole();

    return () => {
      active = false;
    };
  }, [router]);

  if (checking) {
    return <div className="surface-card p-4 text-sm text-slate-600">Checking admin access...</div>;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</h2>
        <nav className="mt-3 flex gap-2 lg:flex-col">
          <Link href="/admin/dashboard" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Dashboard
          </Link>
          <Link href="/admin/issues" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Issues
          </Link>
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}