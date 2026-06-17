// @ts-nocheck
import { PendingLink } from "@/components/pending-link";
import { Nav } from "@/components/nav";
import { SubmitButton } from "@/components/submit-button";
import { savePrediction } from "@/lib/actions";
import { requireApprovedUser } from "@/lib/auth";
import { effectiveMatchStatus, formatDateTime, stageLabel, statusLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireApprovedUser();
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, stage, starts_at, status, home_goals, away_goals, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .eq("id", id)
    .single();

  const { data: myPrediction } = await supabase
    .from("match_predictions")
    .select("*")
    .eq("match_id", id)
    .eq("user_id", profile.id)
    .maybeSingle();

  const { data: predictions } = await supabase
    .from("match_predictions")
    .select("predicted_home_goals, predicted_away_goals, predicted_qualified_team_id, profile:profiles(username)")
    .eq("match_id", id)
    .order("created_at", { ascending: true });

  if (!match) {
    return (
      <>
        <Nav profile={profile} />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p>Partido no encontrado.</p>
        </main>
      </>
    );
  }

  const effectiveStatus = effectiveMatchStatus(match.status, match.starts_at);
  const isOpen = match.status === "scheduled" && new Date(match.starts_at).getTime() > Date.now();
  const isKnockout = match.stage !== "group";
  const homeName = match.home?.name ?? "Por determinar";
  const awayName = match.away?.name ?? "Por determinar";
  const qualifiedPredictionName = (teamId: string | null) => {
    if (!teamId) return "Sin selección";
    if (teamId === match.home_team_id) return homeName;
    if (teamId === match.away_team_id) return awayName;
    return "Selección no disponible";
  };

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <PendingLink className="button-secondary inline-flex w-fit items-center" href="/dashboard">
          Volver al dashboard
        </PendingLink>

        <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {stageLabel(match.stage)}
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            {homeName} vs {awayName}
          </h1>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Inicio</dt>
              <dd className="mt-1 font-medium">{formatDateTime(match.starts_at)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Estado</dt>
              <dd className="mt-1 font-medium">{statusLabel(effectiveStatus)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Resultado</dt>
              <dd className="mt-1 font-medium">
                {match.home_goals === null || match.away_goals === null
                  ? "Sin resultado"
                  : `${match.home_goals}-${match.away_goals}`}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Mi predicción</h2>
          {isOpen ? (
            <form action={savePrediction} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <input name="matchId" type="hidden" value={match.id} />
              <label className="grid gap-2 text-sm font-medium">
                Goles {homeName}
                <input
                  className="field"
                  defaultValue={myPrediction?.predicted_home_goals ?? ""}
                  min={0}
                  name="homeGoals"
                  required
                  type="number"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Goles {awayName}
                <input
                  className="field"
                  defaultValue={myPrediction?.predicted_away_goals ?? ""}
                  min={0}
                  name="awayGoals"
                  required
                  type="number"
                />
              </label>
              <SubmitButton className="button w-full self-end sm:w-auto" pendingText="Guardando...">
                Guardar
              </SubmitButton>
              {isKnockout ? (
                <label className="grid gap-2 text-sm font-medium sm:col-span-3">
                  Equipo que pasa
                  <select
                    className="field"
                    defaultValue={myPrediction?.predicted_qualified_team_id ?? ""}
                    name="predictedQualifiedTeamId"
                    required={Boolean(match.home_team_id && match.away_team_id)}
                  >
                    <option value="">Sin selección</option>
                    {match.home_team_id ? <option value={match.home_team_id}>{homeName}</option> : null}
                    {match.away_team_id ? <option value={match.away_team_id}>{awayName}</option> : null}
                  </select>
                  <span className="text-xs font-normal leading-5 text-zinc-500">
                    Suma 1 punto extra si aciertas quién avanza, aunque tu resultado predicho diga otra cosa.
                  </span>
                </label>
              ) : null}
            </form>
          ) : (
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Este partido ya está cerrado. No se pueden crear ni modificar predicciones.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-4 sm:px-5">
            <h2 className="text-xl font-semibold">Predicciones visibles</h2>
          </div>
          <div className="divide-y divide-zinc-100 md:hidden">
            {(predictions ?? []).map((prediction, index) => (
              <article className="px-4 py-4 text-sm" key={`${prediction.profile?.username}-mobile-${index}`}>
                <div className="flex items-start justify-between gap-4">
                  <p className="font-semibold">{prediction.profile?.username ?? "Usuario"}</p>
                  <p className="font-semibold">
                    {prediction.predicted_home_goals}-{prediction.predicted_away_goals}
                  </p>
                </div>
                {isKnockout ? (
                  <p className="mt-2 text-zinc-600">
                    Pasa: {qualifiedPredictionName(prediction.predicted_qualified_team_id)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-5 py-3">Resultado</th>
                  {isKnockout ? <th className="px-5 py-3">Pasa</th> : null}
                </tr>
              </thead>
              <tbody>
                {(predictions ?? []).map((prediction, index) => (
                  <tr key={`${prediction.profile?.username}-${index}`} className="border-t border-zinc-100">
                    <td className="px-5 py-3 font-medium">{prediction.profile?.username ?? "Usuario"}</td>
                    <td className="px-5 py-3">
                      {prediction.predicted_home_goals}-{prediction.predicted_away_goals}
                    </td>
                    {isKnockout ? (
                      <td className="px-5 py-3">{qualifiedPredictionName(prediction.predicted_qualified_team_id)}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
