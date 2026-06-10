"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireApprovedUser } from "@/lib/auth";
import { parseMadridDateTimeInput } from "@/lib/format";
import { recalculateScores } from "@/lib/scoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { configureSchedulerFromEnv, rescheduleMatchResultCheck, syncWorldCupFixtures } from "@/lib/worldcup26";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
});

export type AuthActionState = {
  error?: string;
};

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Email o contraseña no válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: `No se pudo iniciar sesión: ${error.message}` };
  }

  redirect("/dashboard");
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
  });

  if (!parsed.success) {
    return { error: "Revisa email, contraseña y nombre de usuario." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        username: parsed.data.username,
      },
    },
  });

  if (error) {
    return { error: `No se pudo registrar el usuario: ${error.message}` };
  }

  if (data.user?.id) {
    let admin: ReturnType<typeof getSupabaseAdmin>;

    try {
      admin = getSupabaseAdmin();
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Faltan variables de entorno para crear el perfil.",
      };
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        username: parsed.data.username,
        role: "participant",
        status: "pending",
      },
      { onConflict: "id" },
    );

    if (profileError) {
      return { error: `Usuario creado en Auth, pero no se pudo crear el perfil: ${profileError.message}` };
    }
  }

  redirect("/waitlist");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function approveUser(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const supabase = await createClient();

  await supabase.from("profiles").update({ status: "approved" }).eq("id", userId);
  revalidatePath("/admin");
}

export async function rejectUser(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const supabase = await createClient();

  await supabase.from("profiles").update({ status: "rejected" }).eq("id", userId);
  revalidatePath("/admin");
}

export async function savePrediction(formData: FormData): Promise<void> {
  const { user } = await requireApprovedUser();
  const schema = z.object({
    matchId: z.string().uuid(),
    homeGoals: z.coerce.number().int().min(0).max(99),
    awayGoals: z.coerce.number().int().min(0).max(99),
    predictedQualifiedTeamId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse({
    matchId: formData.get("matchId"),
    homeGoals: formData.get("homeGoals"),
    awayGoals: formData.get("awayGoals"),
    predictedQualifiedTeamId: formData.get("predictedQualifiedTeamId") || null,
  });

  if (!parsed.success) {
    throw new Error("Predicción no válida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("match_predictions").upsert(
    {
      user_id: user.id,
      match_id: parsed.data.matchId,
      predicted_home_goals: parsed.data.homeGoals,
      predicted_away_goals: parsed.data.awayGoals,
      predicted_qualified_team_id: parsed.data.predictedQualifiedTeamId,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    throw new Error("No se pudo guardar. Comprueba que el partido sigue abierto.");
  }

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath("/dashboard");
}

export async function saveChampionPrediction(formData: FormData): Promise<void> {
  const { user } = await requireApprovedUser();
  const parsed = z
    .object({
      teamId: z.string().uuid(),
    })
    .safeParse({
      teamId: formData.get("teamId"),
    });

  if (!parsed.success) {
    throw new Error("Selección campeona no válida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("champion_predictions").upsert(
    {
      user_id: user.id,
      team_id: parsed.data.teamId,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error("No se pudo guardar. La predicción de campeón puede estar cerrada.");
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

export async function syncFixturesAction() {
  await requireAdmin();
  const scheduleChecks = await configureSchedulerFromEnv();
  await syncWorldCupFixtures({ mode: "full", scheduleChecks });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function recalculateScoresAction() {
  await requireAdmin();
  await recalculateScores();
  revalidatePath("/admin");
  revalidatePath("/ranking");
  revalidatePath("/dashboard");
}

export async function updateMatchResult(formData: FormData): Promise<void> {
  await requireAdmin();
  const startsAt =
    formData.get("startsAt") ||
    (formData.get("startsDate") && formData.get("startsTime")
      ? `${formData.get("startsDate")}T${formData.get("startsTime")}`
      : null);
  const schema = z.object({
    matchId: z.string().uuid(),
    homeGoals: z.coerce.number().int().min(0).max(99),
    awayGoals: z.coerce.number().int().min(0).max(99),
    startsAt: z.string().min(1),
    status: z.enum(["scheduled", "in_play", "finished", "postponed", "cancelled"]),
    qualifiedTeamId: z.string().uuid().nullable().optional(),
  });
  const parsed = schema.safeParse({
    matchId: formData.get("matchId"),
    homeGoals: formData.get("homeGoals"),
    awayGoals: formData.get("awayGoals"),
    startsAt,
    status: formData.get("status"),
    qualifiedTeamId: formData.get("qualifiedTeamId") || null,
  });

  if (!parsed.success) {
    throw new Error("Resultado no válido.");
  }

  const supabase = getSupabaseAdmin();
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id, starts_at")
    .eq("id", parsed.data.matchId)
    .single();

  if (matchError) throw new Error(matchError.message);

  const winnerTeamId =
    parsed.data.homeGoals > parsed.data.awayGoals
      ? match.home_team_id
      : parsed.data.awayGoals > parsed.data.homeGoals
        ? match.away_team_id
        : null;

  const { error } = await supabase
    .from("matches")
    .update({
      home_goals: parsed.data.homeGoals,
      away_goals: parsed.data.awayGoals,
      starts_at: parseMadridDateTimeInput(parsed.data.startsAt),
      status: parsed.data.status,
      winner_team_id: winnerTeamId,
      qualified_team_id: parsed.data.qualifiedTeamId ?? winnerTeamId,
      source: "manual",
      manual_override: true,
    })
    .eq("id", parsed.data.matchId);

  if (error) throw new Error(error.message);

  await rescheduleMatchResultCheck(parsed.data.matchId);
  await recalculateScores();
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/ranking");
}

export async function toggleMatchLock(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = z
    .object({
      matchId: z.string().uuid(),
      locked: z.enum(["true", "false"]),
    })
    .safeParse({
      matchId: formData.get("matchId"),
      locked: formData.get("locked"),
    });

  if (!parsed.success) {
    throw new Error("Bloqueo no válido.");
  }

  const supabase = getSupabaseAdmin();
  const locked = parsed.data.locked === "true";
  const { error } = await supabase
    .from("matches")
    .update({
      manual_override: locked,
    })
    .eq("id", parsed.data.matchId);

  if (error) throw new Error(error.message);

  if (!locked) {
    const schedulerConfigured = await configureSchedulerFromEnv();
    if (!schedulerConfigured) {
      throw new Error("No se pudo reprogramar: faltan APP_URL o CRON_SECRET.");
    }
  }

  await rescheduleMatchResultCheck(parsed.data.matchId);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}
