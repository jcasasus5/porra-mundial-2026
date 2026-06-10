import Link from "next/link";
import { Nav } from "@/components/nav";
import { RegisterForm } from "@/components/register-form";
import { getSessionProfile } from "@/lib/auth";

export default async function RegisterPage() {
  const { profile } = await getSessionProfile();

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-bold sm:text-3xl">Registro</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Tu usuario quedará pendiente hasta que el admin confirme el Bizum y apruebe la entrada.
        </p>
        <RegisterForm />
        <p className="mt-4 text-sm text-zinc-600">
          ¿Ya tienes cuenta? <Link className="font-semibold text-zinc-950" href="/login">Entrar</Link>
        </p>
      </main>
    </>
  );
}
