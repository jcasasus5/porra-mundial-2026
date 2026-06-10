"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/spinner";

type PendingLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  "aria-current"?: "page";
};

function resolveDashboardHref(href: string) {
  const isDashboardRoot = href === "/dashboard";
  const isDashboardGroup = href === "/dashboard?phase=group";
  const isDashboardSort = href.startsWith("/dashboard?phase=group&sort=");

  if (isDashboardSort) {
    const sort = new URLSearchParams(href.split("?")[1]).get("sort");
    if (sort === "group" || sort === "date") {
      window.localStorage.setItem("dashboardGroupSort", sort);
    }
    return href;
  }

  if (isDashboardRoot || isDashboardGroup) {
    const savedSort = window.localStorage.getItem("dashboardGroupSort");
    if (savedSort === "date" || savedSort === "group") {
      return `/dashboard?phase=group&sort=${savedSort}`;
    }
  }

  return href;
}

export function PendingLink({
  href,
  children,
  className,
  pendingLabel = "Cargando",
  "aria-current": ariaCurrent,
}: PendingLinkProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Link
      aria-busy={pending}
      aria-current={ariaCurrent}
      className={className}
      href={href}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }

        event.preventDefault();
        const targetHref = resolveDashboardHref(href);
        startTransition(() => {
          router.push(targetHref);
        });
      }}
    >
      <span className="inline-flex items-center gap-2">
        {pending ? <Spinner className="spinner-sm spinner-current" label={pendingLabel} /> : null}
        {children}
      </span>
    </Link>
  );
}
