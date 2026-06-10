import Link from "next/link";
import { signOut } from "@/lib/actions";
import type { Profile } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { SubmitButton } from "@/components/submit-button";

export function Nav({ profile }: { profile?: Profile | null }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="text-sm font-semibold uppercase tracking-wide text-zinc-950">
          Porra Mundial 2026
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          {profile?.status === "approved" ? (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/ranking">Ranking</NavLink>
              <NavLink href="/profile">Perfil</NavLink>
              {profile.role === "admin" ? <NavLink href="/admin">Admin</NavLink> : null}
              <form action={signOut}>
                <SubmitButton className="rounded-md border border-zinc-300 px-3 py-1.5" pendingText="Saliendo...">
                  Salir
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <NavLink href="/login">Login</NavLink>
              <NavLink href="/register">Registro</NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
