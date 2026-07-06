// @ts-nocheck
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Match = {
  id: string;
  stage: string;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  qualified_team_id: string | null;
};

type Prediction = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_home_goals: number;
  predicted_away_goals: number;
  predicted_qualified_team_id: string | null;
};

type ScoreEventInsert = {
  user_id: string;
  match_id?: string;
  champion_prediction_id?: string;
  reason: "match_sign" | "match_exact" | "knockout_qualified_bonus" | "champion";
  points: number;
};

async function fetchPredictionsForMatches(supabase: ReturnType<typeof getSupabaseAdmin>, matchIds: string[]) {
  const pageSize = 1000;
  const predictions: Prediction[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("match_predictions")
      .select("id, user_id, match_id, predicted_home_goals, predicted_away_goals, predicted_qualified_team_id")
      .in("match_id", matchIds)
      .range(from, from + pageSize - 1)
      .returns<Prediction[]>();

    if (error) throw error;

    predictions.push(...(data ?? []));

    if ((data ?? []).length < pageSize) break;
  }

  return predictions;
}

function sign(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

export async function recalculateScores() {
  await recalculateScoresForMatches();
}

export async function recalculateScoresForMatches(matchIds?: string[]) {
  const supabase = getSupabaseAdmin();

  const { data: rules, error: rulesError } = await supabase
    .from("scoring_rules")
    .select("*")
    .eq("id", true)
    .single();

  if (rulesError) throw rulesError;

  let matchesQuery = supabase
    .from("matches")
    .select("id, stage, status, home_goals, away_goals, qualified_team_id")
    .eq("status", "finished")
    .not("home_goals", "is", null)
    .not("away_goals", "is", null);

  if (matchIds) {
    if (matchIds.length === 0) return;
    matchesQuery = matchesQuery.in("id", matchIds);
  }

  const { data: matches, error: matchesError } = await matchesQuery.returns<Match[]>();

  if (matchesError) throw matchesError;

  const finishedMatches = matches ?? [];
  const finishedMatchIds = finishedMatches.map((match) => match.id);

  if (matchIds) {
    if (matchIds.length > 0) {
      await supabase.from("score_events").delete().in("match_id", matchIds);
    }
  } else {
    await supabase.from("score_events").delete().in("reason", [
      "match_sign",
      "match_exact",
      "knockout_qualified_bonus",
      "champion",
    ]);
  }

  if (finishedMatchIds.length > 0) {
    const predictions = await fetchPredictionsForMatches(supabase, finishedMatchIds);

    const matchById = new Map(finishedMatches.map((match) => [match.id, match]));
    const scoreEvents = predictions.flatMap((prediction) => {
      const match = matchById.get(prediction.match_id);
      if (!match || match.home_goals === null || match.away_goals === null) return [];

      const events: ScoreEventInsert[] = [];
      const actualSign = sign(match.home_goals, match.away_goals);
      const predictedSign = sign(prediction.predicted_home_goals, prediction.predicted_away_goals);
      const exact =
        prediction.predicted_home_goals === match.home_goals &&
        prediction.predicted_away_goals === match.away_goals;

      if (exact) {
        events.push({
          user_id: prediction.user_id,
          match_id: prediction.match_id,
          reason: "match_exact",
          points: rules.exact_points,
        });
      } else if (actualSign === predictedSign) {
        events.push({
          user_id: prediction.user_id,
          match_id: prediction.match_id,
          reason: "match_sign",
          points: rules.sign_points,
        });
      }

      if (
        match.stage !== "group" &&
        rules.knockout_qualified_bonus_enabled &&
        prediction.predicted_qualified_team_id &&
        prediction.predicted_qualified_team_id === match.qualified_team_id
      ) {
        events.push({
          user_id: prediction.user_id,
          match_id: prediction.match_id,
          reason: "knockout_qualified_bonus",
          points: rules.knockout_qualified_bonus_points,
        });
      }

      return events;
    });

    if (scoreEvents.length > 0) {
      const { error } = await supabase.from("score_events").insert(scoreEvents);
      if (error) throw error;
    }
  }

  const shouldRecalculateChampion = !matchIds || finishedMatches.some((match) => match.stage === "final");
  const finalMatch = shouldRecalculateChampion
    ? finishedMatches.find((match) => match.stage === "final" && match.qualified_team_id)
    : null;

  if (finalMatch?.qualified_team_id) {
    await supabase.from("score_events").delete().eq("reason", "champion");

    const { data: championPredictions, error } = await supabase
      .from("champion_predictions")
      .select("id, user_id, team_id")
      .eq("team_id", finalMatch.qualified_team_id);

    if (error) throw error;

    if ((championPredictions ?? []).length > 0) {
      const { error: insertError } = await supabase.from("score_events").insert(
        (championPredictions ?? []).map((prediction) => ({
          user_id: prediction.user_id,
          champion_prediction_id: prediction.id,
          reason: "champion",
          points: rules.champion_points,
        })),
      );

      if (insertError) throw insertError;
    }
  }
}
