import { Nav } from "@/components/nav";
import { getSessionProfile } from "@/lib/auth";

export default async function WaitlistPage() {
  const { profile } = await getSessionProfile();

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <section className="rounded-lg border border-zinc-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Pendiente de aprobación</p>
          <h1 className="mt-3 text-3xl font-bold">Tu solicitud está en lista de espera.</h1>
          <p className="mt-3 leading-7 text-zinc-600">
            Cuando el admin confirme el pago por Bizum y apruebe tu usuario podrás entrar al dashboard,
            hacer predicciones y ver el ranking.
          </p>
        </section>
      </main>
    </>
  );
}
