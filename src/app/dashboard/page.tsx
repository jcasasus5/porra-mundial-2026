// @ts-nocheck
import Link from "next/link";
import { cookies } from "next/headers";
import { DashboardPredictionFilter, type DashboardMatchFilter } from "@/components/dashboard-prediction-filter";
import { DashboardSortMemory } from "@/components/dashboard-sort-memory";
import { Nav } from "@/components/nav";
import { PendingLink } from "@/components/pending-link";
import { SubmitButton } from "@/components/submit-button";
import { saveChampionPrediction } from "@/lib/actions";
import { requireApprovedUser } from "@/lib/auth";
import { effectiveMatchStatus, formatDateTime, stageLabel, statusLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const phaseOrder = [
  "champion",
  "group",
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

const previousPhase: Record<string, string | null> = {
  champion: null,
  group: null,
  round_of_32: "group",
  round_of_16: "round_of_32",
  quarter_final: "round_of_16",
  semi_final: "quarter_final",
  third_place: "semi_final",
  final: "semi_final",
};

const matchFilterCookie = "dashboardMatchFilter";
const legacyPendingPredictionsFilterCookie = "dashboardPendingPredictionsOnly";
const emptyPendingMatchesMessage = "No quedan partidos pendientes de predicción en esta vista.";
const emptyUnfinishedMatchesMessage = "No hay partidos sin finalizar en esta vista.";

type DashboardMatch = {
  id: string;
  stage: string;
  group_name: string | null;
  starts_at: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  home: { name: string } | null;
  away: { name: string } | null;
};

function isPhaseComplete(matches: DashboardMatch[], stage: string) {
  const phaseMatches = matches.filter((match) => match.stage === stage);
  return phaseMatches.length > 0 && phaseMatches.every((match) => match.status === "finished");
}

function isPhaseUnlocked(matches: DashboardMatch[], stage: string) {
  if (stage === "champion") return true;
  const previous = previousPhase[stage];
  return previous === null || isPhaseComplete(matches, previous);
}

function phaseHref(stage: string) {
  return `/dashboard?phase=${stage}`;
}

function groupSortHref(sort: "group" | "date") {
  return `/dashboard?phase=group&sort=${sort}`;
}

function readMatchFilter(cookieStore: Awaited<ReturnType<typeof cookies>>): DashboardMatchFilter {
  const filter = cookieStore.get(matchFilterCookie)?.value;

  if (filter === "pending" || filter === "unfinished") {
    return filter;
  }

  if (cookieStore.get(legacyPendingPredictionsFilterCookie)?.value === "1") {
    return "pending";
  }

  return null;
}

function isUnfinishedMatch(match: DashboardMatch) {
  return effectiveMatchStatus(match.status, match.starts_at) !== "finished";
}

function filteredMatches(
  matches: DashboardMatch[],
  predictedMatchIds: Set<string>,
  activeFilter: DashboardMatchFilter,
) {
  if (activeFilter === "pending") {
    return matches.filter((match) => !predictedMatchIds.has(match.id));
  }

  if (activeFilter === "unfinished") {
    return matches.filter(isUnfinishedMatch);
  }

  return matches;
}

function emptyMessageForFilter(activeFilter: DashboardMatchFilter) {
  if (activeFilter === "pending") return emptyPendingMatchesMessage;
  if (activeFilter === "unfinished") return emptyUnfinishedMatchesMessage;
  return undefined;
}

function TeamName({ match, side }: { match: DashboardMatch; side: "home" | "away" }) {
  const team = side === "home" ? match.home : match.away;
  const placeholder = side === "home" ? match.home_placeholder : match.away_placeholder;
  return <>{team?.name ?? placeholder ?? "Por determinar"}</>;
}

function MatchTable({
  matches,
  predictedMatchIds,
  showGroup = false,
  emptyMessage = "No hay partidos en esta vista.",
}: {
  matches: DashboardMatch[];
  predictedMatchIds: Set<string>;
  showGroup?: boolean;
  emptyMessage?: string;
}) {
  if (matches.length === 0) {
    return <p className="px-4 py-6 text-sm text-zinc-600 sm:px-5">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="divide-y divide-zinc-100 md:hidden">
        {matches.map((match) => (
          <Link
            className="block px-4 py-4 transition hover:bg-red-50/70 focus-visible:bg-red-50/70"
            href={`/matches/${match.id}`}
            key={match.id}
          >
            <p className="break-words text-base font-semibold">
              <TeamName match={match} side="home" /> vs <TeamName match={match} side="away" />
            </p>
            <p className="mt-1 text-sm text-zinc-600">{formatDateTime(match.starts_at)}</p>
            {showGroup && match.group_name ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Grupo {match.group_name}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              <span>{statusLabel(effectiveMatchStatus(match.status, match.starts_at))}</span>
              <span aria-hidden="true">·</span>
              <span>
                {match.home_goals === null || match.away_goals === null
                  ? "Sin resultado"
                  : `${match.home_goals}-${match.away_goals}`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-zinc-700">
                {predictedMatchIds.has(match.id) ? "Predicción hecha" : "Predicción pendiente"}
              </span>
            </div>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[820px] text-sm">
        <div className="grid grid-cols-[1.15fr_1.7fr_0.9fr_0.8fr_0.85fr] bg-zinc-50 text-left font-semibold text-zinc-600">
          <div className="px-5 py-3">Fecha</div>
          <div className="px-5 py-3">Partido</div>
          <div className="px-5 py-3">Estado</div>
          <div className="px-5 py-3">Resultado</div>
          <div className="px-5 py-3">Predicción</div>
        </div>
        <div className="divide-y divide-zinc-100">
          {matches.map((match) => (
            <Link
              className="grid grid-cols-[1.15fr_1.7fr_0.9fr_0.8fr_0.85fr] items-center transition hover:bg-red-50/70 hover:shadow-[inset_3px_0_0_var(--brand-red)] focus-visible:bg-red-50/70"
              href={`/matches/${match.id}`}
              key={match.id}
            >
              <div className="px-5 py-3">{formatDateTime(match.starts_at)}</div>
              <div className="px-5 py-3 font-medium">
                <TeamName match={match} side="home" /> vs <TeamName match={match} side="away" />
                {showGroup && match.group_name ? (
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Grupo {match.group_name}
                  </span>
                ) : null}
              </div>
              <div className="px-5 py-3">{statusLabel(effectiveMatchStatus(match.status, match.starts_at))}</div>
              <div className="px-5 py-3">
                {match.home_goals === null || match.away_goals === null
                  ? "-"
                  : `${match.home_goals}-${match.away_goals}`}
              </div>
              <div className="px-5 py-3">{predictedMatchIds.has(match.id) ? "Hecha" : "Pendiente"}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; sort?: string }>;
}) {
  const { profile } = await requireApprovedUser();
  const params = await searchParams;
  const selectedPhase = phaseOrder.includes(params.phase ?? "") ? params.phase! : "group";
  const groupSort = params.sort === "date" ? "date" : "group";
  const explicitGroupSort = params.sort === "date" || params.sort === "group" ? groupSort : undefined;
  const cookieStore = await cookies();
  const activeMatchFilter = readMatchFilter(cookieStore);
  const supabase = await createClient();
  const { data: matchesData } = await supabase
    .from("matches")
    .select("id, stage, group_name, starts_at, status, home_goals, away_goals, home_placeholder, away_placeholder, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)")
    .order("starts_at", { ascending: true });

  const matches = (matchesData ?? []) as DashboardMatch[];

  const { data: myPredictions } = await supabase
    .from("match_predictions")
    .select("match_id")
    .eq("user_id", profile.id);

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .order("name", { ascending: true });

  const { data: championPrediction } = await supabase
    .from("champion_predictions")
    .select("team_id, team:teams(name)")
    .eq("user_id", profile.id)
    .maybeSingle();

  const { data: visibleChampionPredictions } = await supabase
    .from("champion_predictions")
    .select("user_id, profile:profiles(username), team:teams(name)")
    .order("created_at", { ascending: true });

  const predictedMatchIds = new Set((myPredictions ?? []).map((prediction) => prediction.match_id));
  const selectedUnlocked = isPhaseUnlocked(matches, selectedPhase);
  const selectedMatches = matches.filter((match) => match.stage === selectedPhase);
  const visibleSelectedMatches = filteredMatches(selectedMatches, predictedMatchIds, activeMatchFilter);
  const firstMatch = matches[0] ?? null;
  const championOpen = firstMatch ? new Date(firstMatch.starts_at).getTime() > Date.now() : true;
  const groupNames = Array.from(
    new Set(matches.filter((match) => match.stage === "group").map((match) => match.group_name).filter(Boolean)),
  ).sort();
  const groupMatchesByDate = matches
    .filter((match) => match.stage === "group")
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const visibleGroupMatchesByDate = filteredMatches(
    groupMatchesByDate,
    predictedMatchIds,
    activeMatchFilter,
  );
  const groupMatchSections = groupNames
    .map((group) => ({
      group,
      matches: filteredMatches(
        matches.filter((match) => match.stage === "group" && match.group_name === group),
        predictedMatchIds,
        activeMatchFilter,
      ),
    }))
    .filter((section) => activeMatchFilter === null || section.matches.length > 0);
  const currentPhaseMatches = selectedPhase === "group" ? groupMatchesByDate : selectedMatches;
  const pendingMatchesInCurrentPhase = currentPhaseMatches.filter((match) => !predictedMatchIds.has(match.id)).length;
  const unfinishedMatchesInCurrentPhase = currentPhaseMatches.filter(isUnfinishedMatch).length;
  const activeFilterEmptyMessage = emptyMessageForFilter(activeMatchFilter);

  return (
    <>
      <DashboardSortMemory sort={explicitGroupSort} />
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Dashboard</p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hola, {profile.username}</h1>
          </div>
          <Link className="button-secondary w-full text-center sm:w-auto" href="/ranking">
            Ver ranking
          </Link>
        </div>

        <nav className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:mt-8 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {phaseOrder.map((stage) => {
            const unlocked = isPhaseUnlocked(matches, stage);
            const active = selectedPhase === stage;

            return unlocked ? (
              <PendingLink
                className={
                  active
                    ? "shrink-0 rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white"
                    : "shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                }
                href={phaseHref(stage)}
                key={stage}
                pendingLabel={`Cargando ${stageLabel(stage)}`}
              >
                {stageLabel(stage)}
              </PendingLink>
            ) : (
              <span
                className="shrink-0 rounded-md border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-400"
                key={stage}
                title="Se desbloquea cuando finalice la fase anterior"
              >
                {stageLabel(stage)} bloqueada
              </span>
            );
          })}
        </nav>

        {selectedPhase !== "champion" && selectedUnlocked ? (
          <DashboardPredictionFilter
            activeFilter={activeMatchFilter}
            pendingCount={pendingMatchesInCurrentPhase}
            totalCount={currentPhaseMatches.length}
            unfinishedCount={unfinishedMatchesInCurrentPhase}
          />
        ) : null}

        {selectedPhase === "champion" ? (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-8 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Campeón del torneo</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Elige la selección campeona antes del primer partido del Mundial.
                </p>
              </div>
              {firstMatch ? (
                <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                  Cierre: {formatDateTime(firstMatch.starts_at)}
                </div>
              ) : null}
            </div>

            {championOpen ? (
              <form action={saveChampionPrediction} className="mt-5 flex flex-col gap-3 sm:flex-row">
                <select className="field" defaultValue={championPrediction?.team_id ?? ""} name="teamId" required>
                  <option value="">Elige selección</option>
                  {(teams ?? []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
              </form>
            ) : (
              <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
                <p className="font-semibold">Predicción cerrada</p>
                <p className="mt-2 text-zinc-600">
                  {championPrediction?.team?.name
                    ? `Tu campeón: ${championPrediction.team.name}`
                    : "No registraste campeón antes del cierre."}
                </p>
              </div>
            )}

            <section className="mt-6 rounded-lg border border-zinc-200">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h3 className="font-semibold">Predicciones visibles</h3>
              </div>
              {(visibleChampionPredictions ?? []).length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {(visibleChampionPredictions ?? []).map((prediction) => (
                    <div
                      className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      key={prediction.user_id}
                    >
                      <span className="font-medium">{prediction.profile?.username ?? "Usuario"}</span>
                      <span>{prediction.team?.name ?? "Sin selección"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-zinc-600">Todavía no hay predicciones visibles.</p>
              )}
            </section>
          </section>
        ) : !selectedUnlocked ? (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-8 sm:p-6">
            <h2 className="text-lg font-semibold">{stageLabel(selectedPhase)}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Esta fase se desbloqueará automáticamente cuando todos los partidos de la fase anterior
              estén marcados como finalizados.
            </p>
          </section>
        ) : selectedPhase === "group" ? (
          <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-6">
            <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
              <p className="text-sm font-semibold text-zinc-700">Ordenar fase de grupos</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <PendingLink
                  className={
                    groupSort === "group"
                      ? "rounded-md bg-zinc-950 px-3 py-2 text-center text-sm font-semibold text-white"
                      : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  }
                  href={groupSortHref("group")}
                  pendingLabel="Ordenando por grupo"
                >
                  Por grupo
                </PendingLink>
                <PendingLink
                  className={
                    groupSort === "date"
                      ? "rounded-md bg-zinc-950 px-3 py-2 text-center text-sm font-semibold text-white"
                      : "rounded-md border border-zinc-300 bg-white px-3 py-2 text-center text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  }
                  href={groupSortHref("date")}
                  pendingLabel="Ordenando por fecha"
                >
                  Por fecha
                </PendingLink>
              </div>
            </section>

            {groupSort === "date" ? (
              <section className="rounded-lg border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 px-4 py-4 sm:px-5">
                  <h2 className="text-lg font-semibold">Todos los grupos por fecha</h2>
                </div>
                <MatchTable
                  emptyMessage={activeFilterEmptyMessage}
                  matches={visibleGroupMatchesByDate}
                  predictedMatchIds={predictedMatchIds}
                  showGroup
                />
              </section>
            ) : (
              groupMatchSections.length > 0 ? (
                groupMatchSections.map(({ group, matches: groupMatches }) => (
                  <section className="rounded-lg border border-zinc-200 bg-white" key={group}>
                    <div className="border-b border-zinc-200 px-4 py-4 sm:px-5">
                      <h2 className="text-lg font-semibold">Grupo {group}</h2>
                    </div>
                    <MatchTable
                      emptyMessage={activeFilterEmptyMessage}
                      matches={groupMatches}
                      predictedMatchIds={predictedMatchIds}
                    />
                  </section>
                ))
              ) : (
                <section className="rounded-lg border border-zinc-200 bg-white">
                  <p className="px-4 py-6 text-sm text-zinc-600 sm:px-5">
                    {activeFilterEmptyMessage ?? "No hay partidos en esta vista."}
                  </p>
                </section>
              )
            )}
          </div>
        ) : (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white sm:mt-8">
            <div className="border-b border-zinc-200 px-4 py-4 sm:px-5">
              <h2 className="text-lg font-semibold">{stageLabel(selectedPhase)}</h2>
            </div>
            <MatchTable
              emptyMessage={activeFilterEmptyMessage}
              matches={visibleSelectedMatches}
              predictedMatchIds={predictedMatchIds}
            />
          </section>
        )}
      </main>
    </>
  );
}
