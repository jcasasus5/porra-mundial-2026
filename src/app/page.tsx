import Link from "next/link";
import Image from "next/image";
import { Nav } from "@/components/nav";
import { getSessionProfile } from "@/lib/auth";

export default async function HomePage() {
  const { profile } = await getSessionProfile();

  return (
    <>
      <Nav profile={profile} />
      <main className="relative min-h-[calc(100vh-57px)] overflow-hidden bg-red-950">
        <Image
          alt="Football supporters celebrating in a stadium"
          className="object-cover"
          fill
          priority
          sizes="100vw"
          src="/images/football-stadium-celebration.webp"
        />
        <div className="hero-scrim absolute inset-0" />
        <section className="relative z-10 mx-auto flex min-h-[calc(100vh-57px)] max-w-6xl flex-col justify-center px-4 py-12 text-white sm:py-14">
          <div className="mb-6 h-2 w-28 rounded-full bg-yellow-400 shadow-[48px_0_0_#d81920,96px_0_0_#1d4ed8] sm:w-44 sm:shadow-[72px_0_0_#d81920,144px_0_0_#1d4ed8]" />
          <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-5xl md:text-7xl">
            Porra Mundial 2026
          </h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link className="rounded-md bg-yellow-400 px-5 py-3 text-center font-bold text-red-950 shadow-lg shadow-red-950/25 transition hover:bg-yellow-300" href="/register">
              Apuntarme
            </Link>
            <Link className="rounded-md border border-white/70 bg-white/12 px-5 py-3 text-center font-bold text-white backdrop-blur-sm transition hover:bg-white hover:text-red-950" href="/login">
              Ya tengo cuenta
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
