// @ts-nocheck
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recalculateScoresForMatches } from "@/lib/scoring";

const BASE_URL = "https://worldcup26.ir";
const RESULT_CHECK_DELAY_MINUTES = 95;
const RESULT_RETRY_MINUTES = 5;
const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;
const PROVIDER_REQUEST_ATTEMPTS = 3;

const STADIUM_OFFSETS_TO_SPAIN: Record<string, number> = {
  "1": 8,
  "2": 8,
  "3": 8,
  "4": 7,
  "5": 7,
  "6": 7,
  "7": 6,
  "8": 6,
  "9": 6,
  "10": 6,
  "11": 6,
  "12": 6,
  "13": 9,
  "14": 9,
  "15": 9,
  "16": 9,
};

type SyncMode = "full" | "due";

type WorldCupTeam = {
  id: string;
  name_en: string;
  flag?: string;
  fifa_code?: string;
};

type WorldCupGame = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  home_penalty_score?: string;
  away_penalty_score?: string;
  group: string;
  local_date: string;
  finished: string;
  time_elapsed: string;
  type: string;
  stadium_id: string;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
};

type ExistingMatch = {
  id: string;
  api_football_fixture_id: number;
  stage: string;
  starts_at: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  qualified_team_id: string | null;
  manual_override: boolean;
  last_result_checked_at: string | null;
  result_synced_at: string | null;
};

type TeamsResponse = {
  teams: WorldCupTeam[];
};

type GamesResponse = {
  games: WorldCupGame[];
};

function stageFromType(type: string) {
  const map: Record<string, string> = {
    group: "group",
    r32: "round_of_32",
    r16: "round_of_16",
    qf: "quarter_final",
    sf: "semi_final",
    third: "third_place",
    final: "final",
  };

  return map[type] ?? "group";
}

function nextStagesAfter(stage: string) {
  const map: Record<string, string[]> = {
    group: ["round_of_32"],
    round_of_32: ["round_of_16"],
    round_of_16: ["quarter_final"],
    quarter_final: ["semi_final"],
    semi_final: ["third_place", "final"],
    third_place: [],
    final: [],
  };

  return map[stage] ?? [];
}

function roundNameFromType(type: string) {
  const map: Record<string, string> = {
    group: "Fase de grupos",
    r32: "Dieciseisavos",
    r16: "Octavos",
    qf: "Cuartos",
    sf: "Semifinales",
    third: "Tercer puesto",
    final: "Final",
  };

  return map[type] ?? type;
}

function parseBoolean(value: string) {
  return value.toLowerCase() === "true";
}

function parseScore(value: string, isFinished: boolean) {
  if (!isFinished) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function qualifiedTeamFromResult(
  game: WorldCupGame,
  isFinished: boolean,
  homeTeamId: string | null,
  awayTeamId: string | null,
) {
  const homeGoals = parseScore(game.home_score, isFinished);
  const awayGoals = parseScore(game.away_score, isFinished);

  if (homeGoals === null || awayGoals === null) return null;
  if (homeGoals > awayGoals) return homeTeamId;
  if (awayGoals > homeGoals) return awayTeamId;

  const homePenalties = parseScore(game.home_penalty_score ?? "", isFinished);
  const awayPenalties = parseScore(game.away_penalty_score ?? "", isFinished);

  if (homePenalties === null || awayPenalties === null) return null;
  if (homePenalties > awayPenalties) return homeTeamId;
  if (awayPenalties > homePenalties) return awayTeamId;

  return null;
}

function parseWorldCupDate(value: string, stadiumId: string) {
  const offsetHours = STADIUM_OFFSETS_TO_SPAIN[stadiumId];

  if (offsetHours === undefined) {
    throw new Error(`No timezone offset found for stadium_id ${stadiumId}`);
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid worldcup26.ir date: ${value}`);
  }

  const [, month, day, year, hour, minute] = match;
  const spainWallTime = new Date(
    Date.UTC(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10) + offsetHours,
      Number.parseInt(minute, 10),
    ),
  );

  const pad = (valueToPad: number) => String(valueToPad).padStart(2, "0");
  const spainDateTime = [
    spainWallTime.getUTCFullYear(),
    pad(spainWallTime.getUTCMonth() + 1),
    pad(spainWallTime.getUTCDate()),
  ].join("-") + `T${pad(spainWallTime.getUTCHours())}:${pad(spainWallTime.getUTCMinutes())}:00+02:00`;

  return new Date(spainDateTime).toISOString();
}

function statusFromGame(game: WorldCupGame) {
  if (parseBoolean(game.finished)) return "finished";
  if (game.time_elapsed && game.time_elapsed !== "notstarted") return "in_play";

  return "scheduled";
}

function estimatedEndAt(match: ExistingMatch) {
  return new Date(new Date(match.starts_at).getTime() + (RESULT_CHECK_DELAY_MINUTES + RESULT_RETRY_MINUTES) * 60_000);
}

function shouldPollMatch(match: ExistingMatch, now: Date) {
  if (match.manual_override || match.status === "finished") return false;
  if (estimatedEndAt(match) > now) return false;
  if (!match.last_result_checked_at) return true;

  return new Date(match.last_result_checked_at).getTime() <= now.getTime() - RESULT_RETRY_MINUTES * 60_000;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson<T>(path: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROVIDER_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "porra-mundial-2026/1.0",
        },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`worldcup26.ir responded ${response.status} for ${path}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      console.warn("[worldcup26] provider request failed", {
        path,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });

      if (attempt < PROVIDER_REQUEST_ATTEMPTS) {
        await wait(attempt * 1_000);
      }
    }
  }

  throw new Error(
    `worldcup26.ir request failed after ${PROVIDER_REQUEST_ATTEMPTS} attempts for ${path}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function upsertTeam(team: WorldCupTeam) {
  const supabase = getSupabaseAdmin();
  const apiId = Number.parseInt(team.id, 10);
  const { data, error } = await supabase
    .from("teams")
    .upsert(
      {
        api_football_team_id: apiId,
        name: team.name_en,
        code: team.fifa_code ?? null,
        flag_url: team.flag ?? null,
      },
      { onConflict: "api_football_team_id" },
    )
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

async function loadExistingMatches() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("matches")
    .select("id, api_football_fixture_id, stage, starts_at, status, home_goals, away_goals, qualified_team_id, manual_override, last_result_checked_at, result_synced_at")
    .not("api_football_fixture_id", "is", null)
    .returns<ExistingMatch[]>();

  if (error) throw error;

  return new Map((data ?? []).map((match) => [match.api_football_fixture_id, match]));
}

function teamUuid(teamId: string, teamIdToUuid: Map<string, string>) {
  if (teamId === "0") return null;
  return teamIdToUuid.get(teamId) ?? null;
}

function resultChanged(
  existing: ExistingMatch | undefined,
  status: string,
  homeGoals: number | null,
  awayGoals: number | null,
  qualifiedTeamId: string | null,
) {
  if (!existing) return status === "finished";
  return (
    existing.status !== status ||
    existing.home_goals !== homeGoals ||
    existing.away_goals !== awayGoals ||
    existing.qualified_team_id !== qualifiedTeamId
  );
}

async function loadTeamIdMap() {
  const supabase = getSupabaseAdmin();
  const { data: teams, error } = await supabase.from("teams").select("id, api_football_team_id");
  if (error) throw error;

  const teamIdToUuid = new Map<string, string>();
  for (const team of teams ?? []) {
    if (team.api_football_team_id !== null) {
      teamIdToUuid.set(String(team.api_football_team_id), team.id);
    }
  }

  return teamIdToUuid;
}

async function updateMatchFromGame(
  game: WorldCupGame,
  teamIdToUuid: Map<string, string>,
  existing?: ExistingMatch,
  options: { scope?: "full" | "result" } = {},
) {
  const supabase = getSupabaseAdmin();
  const apiFixtureId = Number.parseInt(game.id, 10);
  const isFinished = parseBoolean(game.finished);
  const homeTeamId = teamUuid(game.home_team_id, teamIdToUuid);
  const awayTeamId = teamUuid(game.away_team_id, teamIdToUuid);
  const homeGoals = parseScore(game.home_score, isFinished);
  const awayGoals = parseScore(game.away_score, isFinished);
  const stage = stageFromType(game.type);
  const status = statusFromGame(game);
  const qualifiedTeamId = qualifiedTeamFromResult(game, isFinished, homeTeamId, awayTeamId);
  const didResultChange = resultChanged(existing, status, homeGoals, awayGoals, qualifiedTeamId);

  if (options.scope === "result") {
    if (!existing) {
      throw new Error("Cannot update result without an existing match");
    }

    const resultOnlyPayload = isFinished
      ? {
          status,
          home_goals: homeGoals,
          away_goals: awayGoals,
          elapsed: Number.parseInt(game.time_elapsed, 10) || null,
          winner_team_id: qualifiedTeamId,
          qualified_team_id: qualifiedTeamId,
          source: "worldcup26.ir",
          raw_api_payload: game,
          last_result_checked_at: new Date().toISOString(),
          result_synced_at: new Date().toISOString(),
          manual_override: false,
        }
      : {
          raw_api_payload: game,
          last_result_checked_at: new Date().toISOString(),
        };

    const { data, error } = await supabase
      .from("matches")
      .update(resultOnlyPayload)
      .eq("id", existing.id)
      .select("id, stage, status")
      .single();

    if (error) throw error;

    return {
      matchId: data.id as string,
      stage: data.stage as string,
      status,
      isFinished,
      didResultChange,
    };
  }

  const payload = {
    api_football_fixture_id: apiFixtureId,
    stage,
    group_name: stage === "group" ? game.group : null,
    round_name: roundNameFromType(game.type),
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_placeholder: homeTeamId === null ? game.home_team_label ?? game.home_team_name_en ?? "Por determinar" : null,
    away_placeholder: awayTeamId === null ? game.away_team_label ?? game.away_team_name_en ?? "Por determinar" : null,
    starts_at: parseWorldCupDate(game.local_date, game.stadium_id),
    status,
    home_goals: homeGoals,
    away_goals: awayGoals,
    elapsed: Number.parseInt(game.time_elapsed, 10) || null,
    winner_team_id: qualifiedTeamId,
    qualified_team_id: qualifiedTeamId,
    source: "worldcup26.ir",
    raw_api_payload: game,
    last_result_checked_at: new Date().toISOString(),
    result_synced_at: isFinished ? new Date().toISOString() : existing?.result_synced_at ?? null,
  };

  const { data, error } = await supabase
    .from("matches")
    .upsert(payload, { onConflict: "api_football_fixture_id" })
    .select("id, stage, status")
    .single();

  if (error) throw error;

  return {
    matchId: data.id as string,
    stage: data.stage as string,
    status,
    isFinished,
    didResultChange,
  };
}

async function scheduleNextCheck(matchId: string, runAt: Date) {
  const supabase = getSupabaseAdmin();
  const effectiveRunAt = runAt.getTime() > Date.now() ? runAt : new Date(Date.now() + 60_000);
  const { error } = await supabase.rpc("schedule_match_result_check", {
    match_uuid: matchId,
    run_at: effectiveRunAt.toISOString(),
  });

  if (error) throw error;
}

async function scheduleChecksForStages(stages: string[]) {
  if (stages.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, starts_at")
    .in("stage", stages)
    .neq("status", "finished")
    .eq("manual_override", false);

  if (error) throw error;

  for (const match of matches ?? []) {
    await scheduleNextCheck(match.id, new Date(new Date(match.starts_at).getTime() + RESULT_CHECK_DELAY_MINUTES * 60_000));
  }
}

async function unscheduleCheck(matchId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("unschedule_match_result_check", {
    match_uuid: matchId,
  });

  if (error) throw error;
}

export async function rescheduleMatchResultCheck(matchId: string) {
  const supabase = getSupabaseAdmin();
  const { data: match, error } = await supabase
    .from("matches")
    .select("id, starts_at, status, manual_override")
    .eq("id", matchId)
    .single();

  if (error) throw error;

  if (match.manual_override || match.status === "finished") {
    await unscheduleCheck(matchId);
    return { status: "unscheduled", reason: match.manual_override ? "manual_override" : "finished" };
  }

  const runAt = new Date(new Date(match.starts_at).getTime() + RESULT_CHECK_DELAY_MINUTES * 60_000);
  await scheduleNextCheck(matchId, runAt);

  return { status: "scheduled", runAt: runAt.toISOString() };
}

async function isPhaseComplete(stage: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("matches").select("status").eq("stage", stage);
  if (error) throw error;

  return (data ?? []).length > 0 && (data ?? []).every((match) => match.status === "finished");
}

export async function checkMatchResult(matchId: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: matchError } = await supabase
    .from("matches")
    .select("id, api_football_fixture_id, stage, starts_at, status, home_goals, away_goals, qualified_team_id, manual_override, last_result_checked_at, result_synced_at")
    .eq("id", matchId)
    .single();

  if (matchError) throw matchError;

  if (existing.manual_override || existing.status === "finished") {
    await unscheduleCheck(matchId);
    return { status: "skipped", reason: existing.manual_override ? "manual_override" : "already_finished" };
  }

  let gamesPayload: GamesResponse;

  try {
    gamesPayload = await fetchJson<GamesResponse>("/get/games");
  } catch (error) {
    await scheduleNextCheck(matchId, new Date(Date.now() + RESULT_RETRY_MINUTES * 60_000));
    console.error("[worldcup26] match result check rescheduled after provider failure", {
      matchId,
      fixtureId: existing.api_football_fixture_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      status: "rescheduled",
      reason: "provider_error",
    };
  }
  const game = (gamesPayload.games ?? []).find(
    (candidate) => Number.parseInt(candidate.id, 10) === existing.api_football_fixture_id,
  );

  if (!game) {
    await scheduleNextCheck(matchId, new Date(Date.now() + RESULT_RETRY_MINUTES * 60_000));
    return { status: "rescheduled", reason: "game_not_found" };
  }

  const result = await updateMatchFromGame(game, await loadTeamIdMap(), existing, { scope: "result" });

  if (!result.isFinished) {
    await scheduleNextCheck(matchId, new Date(Date.now() + RESULT_RETRY_MINUTES * 60_000));
    return { status: "rescheduled", reason: "not_finished" };
  }

  await recalculateScoresForMatches([matchId]);
  await unscheduleCheck(matchId);

  if (await isPhaseComplete(result.stage)) {
    const nextStages = nextStagesAfter(result.stage);
    if (nextStages.length > 0) {
      await syncWorldCupFixtures({ mode: "full", scheduleChecks: true, stages: nextStages });
    }
  }

  return { status: "finished", matchId, didResultChange: result.didResultChange };
}

export async function configureSchedulerFromEnv() {
  const appUrl = process.env.APP_URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    return false;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "app_url", value: appUrl.replace(/\/$/, "") },
      { key: "cron_secret", value: cronSecret },
    ],
    { onConflict: "key" },
  );

  if (error) throw error;

  return true;
}

export async function syncWorldCupFixtures({
  mode = "full",
  scheduleChecks = false,
  stages,
}: {
  mode?: SyncMode;
  scheduleChecks?: boolean;
  stages?: string[];
} = {}) {
  const supabase = getSupabaseAdmin();
  const endpoint =
    mode === "full" && stages?.length
      ? `worldcup26.ir phase sync: ${stages.join(",")}`
      : mode === "full"
        ? "worldcup26.ir full sync"
        : "worldcup26.ir due result sync";
  const startedAt = new Date().toISOString();
  const now = new Date();
  const requestCount = mode === "full" ? 2 : 1;

  const { data: log } = await supabase
    .from("sync_logs")
    .insert({
      provider: "worldcup26.ir",
      endpoint,
      status: "running",
      started_at: startedAt,
      request_count: requestCount,
    })
    .select("id")
    .single();

  try {
    const existingMatchesByApiId = await loadExistingMatches();
    const dueApiIds =
      mode === "due"
        ? new Set(
            Array.from(existingMatchesByApiId.values())
              .filter((match) => shouldPollMatch(match, now))
              .map((match) => match.api_football_fixture_id),
          )
        : null;

    if (mode === "due" && dueApiIds?.size === 0) {
      await supabase
        .from("sync_logs")
        .update({
          status: "success",
          message: "No hay partidos pendientes de comprobación",
          finished_at: new Date().toISOString(),
          payload: { checked_fixture_count: 0, updated_fixture_count: 0 },
        })
        .eq("id", log?.id);

      return {
        fixtureCount: 0,
        updatedFixtureCount: 0,
        expectedFixtureCount: 104,
      };
    }

    const [teamsPayload, gamesPayload] =
      mode === "full"
        ? await Promise.all([fetchJson<TeamsResponse>("/get/teams"), fetchJson<GamesResponse>("/get/games")])
        : [{ teams: [] }, await fetchJson<GamesResponse>("/get/games")] as const;

    let teamIdToUuid = new Map<string, string>();

    if (mode === "full") {
      for (const team of teamsPayload.teams ?? []) {
        teamIdToUuid.set(team.id, await upsertTeam(team));
      }
    } else {
      teamIdToUuid = await loadTeamIdMap();
    }

    const gamesToProcess = (gamesPayload.games ?? []).filter((game) => {
      if (stages?.length && !stages.includes(stageFromType(game.type))) return false;
      if (mode === "full") return true;
      return dueApiIds?.has(Number.parseInt(game.id, 10));
    });

    const changedFinishedMatchIds: string[] = [];
    let updatedFixtureCount = 0;

    for (const game of gamesToProcess) {
      const apiFixtureId = Number.parseInt(game.id, 10);
      const existing = existingMatchesByApiId.get(apiFixtureId);

      if (existing?.manual_override) {
        continue;
      }
      const result = await updateMatchFromGame(game, teamIdToUuid, existing, {
        scope: mode === "due" ? "result" : "full",
      });

      updatedFixtureCount += 1;

      if (result.status === "finished" && result.didResultChange) {
        changedFinishedMatchIds.push(result.matchId);
      }
    }

    await recalculateScoresForMatches(changedFinishedMatchIds);

    if (scheduleChecks) {
      if (stages?.length) {
        await scheduleChecksForStages(stages);
      } else {
        const { error } = await supabase.rpc("schedule_all_match_result_checks");
        if (error) throw error;
      }
    }

    await supabase
      .from("sync_logs")
      .update({
        status: "success",
        message:
          mode === "full"
            ? `Sincronizados ${gamesToProcess.length} partidos y ${teamsPayload.teams?.length ?? 0} equipos`
            : `Comprobados ${gamesToProcess.length} partidos; actualizados ${updatedFixtureCount}`,
        finished_at: new Date().toISOString(),
        payload: {
          fixture_count: gamesPayload.games?.length ?? 0,
          processed_fixture_count: gamesToProcess.length,
          updated_fixture_count: updatedFixtureCount,
          team_count: teamsPayload.teams?.length ?? 0,
          expected_fixture_count: 104,
          provider: "worldcup26.ir",
          mode,
        },
      })
      .eq("id", log?.id);

    return {
      fixtureCount: gamesPayload.games?.length ?? 0,
      processedFixtureCount: gamesToProcess.length,
      updatedFixtureCount,
      expectedFixtureCount: 104,
    };
  } catch (error) {
    await supabase
      .from("sync_logs")
      .update({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown sync error",
        finished_at: new Date().toISOString(),
      })
      .eq("id", log?.id);

    throw error;
  }
}
