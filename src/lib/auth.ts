// @ts-nocheck
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  username: string;
  role: "admin" | "participant";
  status: "pending" | "approved" | "rejected";
};

export async function getSessionProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, role, status")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { user, profile };
}

export async function requireApprovedUser() {
  const session = await getSessionProfile();

  if (!session.user) {
    redirect("/login");
  }

  if (!session.profile || session.profile.status === "pending") {
    redirect("/waitlist");
  }

  if (session.profile.status === "rejected") {
    redirect("/");
  }

  return session as { user: NonNullable<typeof session.user>; profile: Profile };
}

export async function requireAdmin() {
  const session = await requireApprovedUser();

  if (session.profile.role !== "admin") {
    redirect("/dashboard");
  }

  return session;
}
