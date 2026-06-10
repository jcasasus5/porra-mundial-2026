// @ts-nocheck
import { Nav } from "@/components/nav";
import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const { profile } = await requireApprovedUser();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("score_events")
    .select("reason, points, match:matches(round_name)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold">Mis puntos</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Aquí se muestra el desglose de tus puntos por aciertos, resultados exactos, bonus y campeón.
        </p>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white">
          {(events ?? []).map((event, index) => (
            <div key={index} className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 text-sm last:border-b-0">
              <span>{event.reason} {event.match?.round_name ? `· ${event.match.round_name}` : ""}</span>
              <strong>{event.points}</strong>
            </div>
          ))}
          {(events ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-600">Todavía no hay puntos asignados.</p>
          ) : null}
        </section>
      </main>
    </>
  );
}
