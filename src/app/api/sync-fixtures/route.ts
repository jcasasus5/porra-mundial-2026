import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { configureSchedulerFromEnv, syncWorldCupFixtures } from "@/lib/worldcup26";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncWorldCupFixtures({ mode: "due" });
  return NextResponse.json(result);
}

export async function POST() {
  await requireAdmin();
  const scheduleChecks = await configureSchedulerFromEnv();
  const result = await syncWorldCupFixtures({ mode: "full", scheduleChecks });
  return NextResponse.json(result);
}
