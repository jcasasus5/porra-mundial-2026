import { NextResponse, type NextRequest } from "next/server";
import { checkMatchResult } from "@/lib/worldcup26";

export async function POST(request: NextRequest) {
  try {
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
  } catch (error) {
    console.error("[api/check-match-result] failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json({ error: "Match result check failed" }, { status: 500 });
  }
}
