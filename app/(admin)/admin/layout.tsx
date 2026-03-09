"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUserRole } from "@/lib/user-profile";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === "/admin/login";
  const isBootstrapRoute = pathname === "/admin/bootstrap";
  const isPublicAdminRoute = isLoginRoute || isBootstrapRoute;
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const checkRole = async () => {
      if (isPublicAdminRoute) {
        setAllowed(true);
        setChecking(false);
        return;
      }

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
      router.replace("/admin/login");
    };

    void checkRole();

    return () => {
      active = false;
    };
  }, [isPublicAdminRoute, router]);

  if (checking) {
    return <div className="surface-card p-4 text-sm text-muted">Checking admin access...</div>;
  }

  if (!allowed) {
    return null;
  }

  if (isPublicAdminRoute) {
    return <>{children}</>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="surface-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Admin</h2>
        <nav className="mt-3 flex gap-2 lg:flex-col">
          <Link href="/admin/dashboard" className="btn-secondary px-3 py-2 text-sm font-medium">
            Dashboard
          </Link>
          <Link href="/admin/issues" className="btn-secondary px-3 py-2 text-sm font-medium">
            Issues
          </Link>
          <Link href="/admin/roles" className="btn-secondary px-3 py-2 text-sm font-medium">
            Roles
          </Link>
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  );
}