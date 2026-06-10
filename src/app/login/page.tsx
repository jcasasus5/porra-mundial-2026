import Link from "next/link";
import { Nav } from "@/components/nav";
import { LoginForm } from "@/components/login-form";
import { getSessionProfile } from "@/lib/auth";

export default async function LoginPage() {
  const { profile } = await getSessionProfile();

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-bold sm:text-3xl">Entrar</h1>
        <LoginForm />
        <p className="mt-4 text-sm text-zinc-600">
          ¿No tienes cuenta? <Link className="font-semibold text-zinc-950" href="/register">Regístrate</Link>
        </p>
      </main>
    </>
  );
}
