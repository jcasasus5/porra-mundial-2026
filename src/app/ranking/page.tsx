// @ts-nocheck
import { Nav } from "@/components/nav";
import { requireApprovedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RankingPage() {
  const { profile } = await requireApprovedUser();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("status", "approved")
    .order("username", { ascending: true });

  const { data: scoreEvents } = await supabase
    .from("score_events")
    .select("user_id, points");

  const totals = new Map<string, number>();
  for (const event of scoreEvents ?? []) {
    totals.set(event.user_id, (totals.get(event.user_id) ?? 0) + event.points);
  }

  const ranking = (profiles ?? [])
    .map((user) => ({ ...user, points: totals.get(user.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  const positionByPoints = ranking.reduce(
    (positions, user, index) =>
      positions.has(user.points)
        ? positions
        : new Map([...positions, [user.points, index + 1]]),
    new Map()
  );

  const rankingWithPositions = ranking.map((user) => ({
    ...user,
    position: positionByPoints.get(user.points),
  }));

  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold sm:text-3xl">Ranking general</h1>
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 sm:px-5">#</th>
                <th className="px-4 py-3 sm:px-5">Usuario</th>
                <th className="px-4 py-3 text-right sm:px-5">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {rankingWithPositions.map((user) => (
                <tr key={user.id} className="border-t border-zinc-100">
                  <td className="px-4 py-3 sm:px-5">{user.position}</td>
                  <td className="px-4 py-3 font-medium sm:px-5">{user.username}</td>
                  <td className="px-4 py-3 text-right font-semibold sm:px-5">{user.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
