// @ts-nocheck
import { Nav } from "@/components/nav";
import { SubmitButton } from "@/components/submit-button";
import {
  approveUser,
  recalculateScoresAction,
  rejectUser,
  syncFixturesAction,
  toggleMatchLock,
  updateMatchResult,
} from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatDateTimeInput, stageLabel, statusLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const { profile } = await requireAdmin();
  const supabase = await createClient();

  const { data: pendingUsers } = await supabase
    .from("profiles")
    .select("id, username, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: syncLogs } = await supabase
    .from("sync_logs")
    .select("id, endpoint, status, message, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(5);

  const { count: matchCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true });

  const { data: matches } = await supabase
    .from("matches")
    .select("id, stage, group_name, starts_at, status, home_goals, away_goals, home_team_id, away_team_id, manual_override, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), home_placeholder, away_placeholder")
    .order("starts_at", { ascending: true });

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Admin</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Panel de administración</h1>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">Partidos cacheados</p>
            <p className="mt-2 text-3xl font-bold">{matchCount ?? 0}</p>
            <p className="mt-1 text-sm text-zinc-600">Esperados para 2026: 104</p>
          </article>
          <form action={syncFixturesAction} className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">worldcup26.ir</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Sincroniza equipos y partidos desde `worldcup26.ir`. Usa `/get/teams` y `/get/games`.
            </p>
            <SubmitButton
              blockPage
              className="button mt-4 w-full sm:w-auto"
              overlayText="Sincronizando calendario y resultados..."
              pendingText="Sincronizando..."
            >
              Sincronizar ahora
            </SubmitButton>
          </form>
          <form action={recalculateScoresAction} className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="font-semibold">Puntuaciones</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Recalcula ranking tras cambios manuales o resultados corregidos.
            </p>
            <SubmitButton
              blockPage
              className="button-secondary mt-4 w-full sm:w-auto"
              overlayText="Recalculando puntuaciones..."
              pendingText="Recalculando..."
            >
              Recalcular
            </SubmitButton>
          </form>
        </section>

        <section className="mt-8 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Corrección manual de resultados</h2>
          </div>
          <div className="divide-y divide-zinc-100 md:hidden">
            {(matches ?? []).map((match) => {
              const homeName = match.home?.name ?? match.home_placeholder ?? "Por determinar";
              const awayName = match.away?.name ?? match.away_placeholder ?? "Por determinar";
              const [startsDate, startsTime] = formatDateTimeInput(match.starts_at).split("T");

              return (
                <article className="px-4 py-5" key={match.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{homeName} vs {awayName}</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {stageLabel(match.stage)}
                        {match.group_name ? ` · Grupo ${match.group_name}` : ""}
                      </p>
                      {match.manual_override ? (
                        <p className="mt-1 text-xs font-semibold text-amber-700">Protegido frente a sync</p>
                      ) : null}
                    </div>
                    <form action={toggleMatchLock} className="shrink-0">
                      <input name="matchId" type="hidden" value={match.id} />
                      <input name="locked" type="hidden" value={match.manual_override ? "false" : "true"} />
                      <SubmitButton
                        className={
                          match.manual_override
                            ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                            : "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                        }
                        pendingText="Cambiando..."
                        title={
                          match.manual_override
                            ? "Cerrado: sincronizar no cambiará este partido"
                            : "Abierto: sincronizar puede actualizar este partido"
                        }
                      >
                        {match.manual_override ? "Cerrado" : "Abierto"}
                      </SubmitButton>
                    </form>
                  </div>

                  <form action={updateMatchResult} className="mt-4 grid gap-4">
                    <input name="matchId" type="hidden" value={match.id} />
                    <div className="grid gap-3">
                      <label className="grid min-w-0 gap-2 text-sm font-medium">
                        Fecha
                        <span className="mobile-date-shell">
                          <input
                            className="mobile-date-input"
                            defaultValue={startsDate}
                            name="startsDate"
                            type="date"
                          />
                        </span>
                      </label>
                      <label className="grid min-w-0 gap-2 text-sm font-medium">
                        Hora
                        <span className="mobile-date-shell">
                          <input
                            className="mobile-date-input"
                            defaultValue={startsTime}
                            name="startsTime"
                            type="time"
                          />
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-2 text-sm font-medium">
                        Local
                        <input className="field" defaultValue={match.home_goals ?? 0} min={0} name="homeGoals" type="number" />
                      </label>
                      <label className="grid gap-2 text-sm font-medium">
                        Visitante
                        <input className="field" defaultValue={match.away_goals ?? 0} min={0} name="awayGoals" type="number" />
                      </label>
                    </div>

                    <label className="grid gap-2 text-sm font-medium">
                      Estado
                      <select className="field" defaultValue={match.status} name="status">
                        {["scheduled", "in_play", "finished", "postponed", "cancelled"].map((status) => (
                          <option key={status} value={status}>
                            {statusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-2 text-sm font-medium">
                      Clasificado
                      <select className="field" defaultValue="" name="qualifiedTeamId">
                        <option value="">Automático</option>
                        {match.home_team_id ? <option value={match.home_team_id}>{homeName}</option> : null}
                        {match.away_team_id ? <option value={match.away_team_id}>{awayName}</option> : null}
                      </select>
                    </label>

                    <SubmitButton
                      blockPage
                      className="button-secondary w-full"
                      overlayText="Guardando resultado..."
                      pendingText="Guardando..."
                    >
                      Guardar
                    </SubmitButton>
                  </form>
                </article>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Sync</th>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Fase</th>
                  <th className="px-5 py-3">Partido</th>
                  <th className="px-5 py-3">Resultado</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Clasificado</th>
                </tr>
              </thead>
              <tbody>
                {(matches ?? []).map((match) => {
                  const homeName = match.home?.name ?? match.home_placeholder ?? "Por determinar";
                  const awayName = match.away?.name ?? match.away_placeholder ?? "Por determinar";

                  return (
                    <tr key={match.id} className="border-t border-zinc-100 align-top">
                      <td className="px-5 py-3">
                        <form action={toggleMatchLock}>
                          <input name="matchId" type="hidden" value={match.id} />
                          <input name="locked" type="hidden" value={match.manual_override ? "false" : "true"} />
                          <SubmitButton
                            className={
                              match.manual_override
                                ? "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                                : "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                            }
                            pendingText="Cambiando..."
                            title={
                              match.manual_override
                                ? "Cerrado: sincronizar no cambiará este partido"
                                : "Abierto: sincronizar puede actualizar este partido"
                            }
                          >
                            {match.manual_override ? "Cerrado" : "Abierto"}
                          </SubmitButton>
                        </form>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          className="field min-w-[190px]"
                          defaultValue={formatDateTimeInput(match.starts_at)}
                          form={`result-desktop-${match.id}`}
                          name="startsAt"
                          type="datetime-local"
                        />
                        <span className="mt-1 block text-xs text-zinc-500">{formatDateTime(match.starts_at)}</span>
                      </td>
                      <td className="px-5 py-3">
                        {stageLabel(match.stage)}
                        {match.group_name ? <span className="block text-xs text-zinc-500">Grupo {match.group_name}</span> : null}
                      </td>
                      <td className="px-5 py-3 font-medium">
                        {homeName} vs {awayName}
                        {match.manual_override ? (
                          <span className="mt-1 block text-xs font-semibold text-amber-700">Protegido frente a sync</span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <form action={updateMatchResult} className="grid grid-cols-[70px_70px_auto] gap-2" id={`result-desktop-${match.id}`}>
                          <input name="matchId" type="hidden" value={match.id} />
                          <input className="field" defaultValue={match.home_goals ?? 0} min={0} name="homeGoals" type="number" />
                          <input className="field" defaultValue={match.away_goals ?? 0} min={0} name="awayGoals" type="number" />
                          <SubmitButton
                            blockPage
                            className="button-secondary whitespace-nowrap"
                            overlayText="Guardando resultado..."
                            pendingText="Guardando..."
                          >
                            Guardar
                          </SubmitButton>
                        </form>
                      </td>
                      <td className="px-5 py-3">
                        <select className="field" defaultValue={match.status} form={`result-desktop-${match.id}`} name="status">
                          {["scheduled", "in_play", "finished", "postponed", "cancelled"].map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <select className="field" defaultValue="" form={`result-desktop-${match.id}`} name="qualifiedTeamId">
                          <option value="">Automático</option>
                          {match.home_team_id ? <option value={match.home_team_id}>{homeName}</option> : null}
                          {match.away_team_id ? <option value={match.away_team_id}>{awayName}</option> : null}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Usuarios pendientes</h2>
          </div>
          {(pendingUsers ?? []).length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {(pendingUsers ?? []).map((user) => (
                <div key={user.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
                  <div>
                    <p className="font-medium">{user.username}</p>
                    <p className="text-sm text-zinc-500">Registrado: {formatDateTime(user.created_at)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <form action={approveUser} className="min-w-0">
                      <input name="userId" type="hidden" value={user.id} />
                      <SubmitButton className="button w-full" pendingText="Aprobando...">Aprobar</SubmitButton>
                    </form>
                    <form action={rejectUser} className="min-w-0">
                      <input name="userId" type="hidden" value={user.id} />
                      <SubmitButton className="button-secondary w-full" pendingText="Rechazando...">
                        Rechazar
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-zinc-600">No hay usuarios pendientes.</p>
          )}
        </section>

        <section className="mt-8 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Últimas sincronizaciones</h2>
          </div>
          <div className="divide-y divide-zinc-100 md:hidden">
            {(syncLogs ?? []).map((log) => (
              <article className="px-4 py-4 text-sm" key={log.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{log.endpoint}</p>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {log.status}
                  </span>
                </div>
                <p className="mt-2 text-zinc-600">{formatDateTime(log.started_at)}</p>
                {log.message ? <p className="mt-2 leading-6 text-zinc-700">{log.message}</p> : null}
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-zinc-600">
                <tr>
                  <th className="px-5 py-3">Inicio</th>
                  <th className="px-5 py-3">Endpoint</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {(syncLogs ?? []).map((log) => (
                  <tr key={log.id} className="border-t border-zinc-100">
                    <td className="px-5 py-3">{formatDateTime(log.started_at)}</td>
                    <td className="px-5 py-3">{log.endpoint}</td>
                    <td className="px-5 py-3">{log.status}</td>
                    <td className="px-5 py-3">{log.message ?? ""}</td>
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
