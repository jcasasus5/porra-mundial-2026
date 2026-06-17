// @ts-nocheck
import { Nav } from "@/components/nav";
import { requireApprovedUser } from "@/lib/auth";
import { stageLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const { profile } = await requireApprovedUser();
  const supabase = await createClient();

  const [{ data: predictions }, { data: events }, { data: championPrediction }] = await Promise.all([
    supabase
      .from("match_predictions")
      .select(`
        match_id,
        predicted_home_goals,
        predicted_away_goals,
        match:matches!inner(
          id,
          stage,
          starts_at,
          status,
          home_goals,
          away_goals,
          home_placeholder,
          away_placeholder,
          home:teams!matches_home_team_id_fkey(name),
          away:teams!matches_away_team_id_fkey(name)
        )
      `)
      .eq("user_id", profile.id)
      .eq("match.status", "finished"),
    supabase
      .from("score_events")
      .select("match_id, reason, points")
      .eq("user_id", profile.id),
    supabase
      .from("champion_predictions")
      .select("team:teams(name)")
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);

  const pointsByMatch = new Map<string, number>();
  let championPoints = 0;
  let totalPoints = 0;

  for (const event of events ?? []) {
    totalPoints += event.points;

    if (event.match_id) {
      pointsByMatch.set(event.match_id, (pointsByMatch.get(event.match_id) ?? 0) + event.points);
    } else if (event.reason === "champion") {
      championPoints += event.points;
    }
  }

  const finishedPredictions = (predictions ?? []).sort(
    (a, b) => new Date(b.match.starts_at).getTime() - new Date(a.match.starts_at).getTime(),
  );

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Mis puntos</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Compara tus predicciones con los resultados finales.
            </p>
          </div>
          <div className="rounded-lg bg-red-700 px-4 py-3 text-center text-white">
            <span className="block text-xs font-semibold uppercase tracking-wide">Total</span>
            <strong className="text-2xl">{totalPoints}</strong>
          </div>
        </div>

        <section className="mt-6 space-y-3">
          {finishedPredictions.map((prediction) => {
            const match = prediction.match;
            const homeName = match.home?.name ?? match.home_placeholder ?? "Por determinar";
            const awayName = match.away?.name ?? match.away_placeholder ?? "Por determinar";
            const points = pointsByMatch.get(prediction.match_id) ?? 0;

            return (
              <article key={prediction.match_id} className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      {stageLabel(match.stage)}
                    </p>
                    <h2 className="mt-1 font-semibold">
                      {homeName} vs {awayName}
                    </h2>
                  </div>
                  <strong
                    className={`shrink-0 rounded-full px-3 py-1 text-sm ${
                      points > 0 ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {points > 0 ? `+${points}` : "0"} pts
                  </strong>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-zinc-50 p-3">
                    <dt className="text-zinc-500">Resultado final</dt>
                    <dd className="mt-1 text-lg font-bold">
                      {match.home_goals} - {match.away_goals}
                    </dd>
                  </div>
                  <div className="rounded-md bg-orange-50 p-3">
                    <dt className="text-zinc-500">Tu predicción</dt>
                    <dd className="mt-1 text-lg font-bold">
                      {prediction.predicted_home_goals} - {prediction.predicted_away_goals}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}

          {championPoints > 0 ? (
            <article className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Campeón</p>
                <h2 className="mt-1 font-semibold">{championPrediction?.team?.name ?? "Predicción campeona"}</h2>
              </div>
              <strong className="rounded-full bg-amber-200 px-3 py-1 text-sm text-amber-900">
                +{championPoints} pts
              </strong>
            </article>
          ) : null}

          {finishedPredictions.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white">
              <p className="px-5 py-6 text-sm text-zinc-600">Todavía no hay predicciones finalizadas.</p>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
