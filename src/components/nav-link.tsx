"use client";

import { usePathname } from "next/navigation";
import { PendingLink } from "@/components/pending-link";

type NavLinkProps = {
  href: string;
  children: React.ReactNode;
};

export function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <PendingLink
      aria-current={isActive ? "page" : undefined}
      className={
        isActive
          ? "rounded-md bg-zinc-950 px-2.5 py-1.5 font-semibold text-white sm:px-3"
          : "rounded-md px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 sm:px-3"
      }
      href={href}
      pendingLabel={`Cargando ${children}`}
    >
      {children}
    </PendingLink>
  );
}
