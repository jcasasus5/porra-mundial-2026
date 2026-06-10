import { NextResponse, type NextRequest } from "next/server";
import { checkMatchResult } from "@/lib/worldcup26";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { matchId?: string };

  if (!body.matchId) {
    return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
  }

  const result = await checkMatchResult(body.matchId);
  return NextResponse.json(result);
}
