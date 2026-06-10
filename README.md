# World Cup 2026 Prediction Pool

An open-source private prediction pool for the 2026 FIFA World Cup. Participants
predict match scores and the tournament champion, while administrators approve
entries, synchronize fixtures, correct results, and recalculate the leaderboard.

The user interface is currently in Spanish, but the project structure and setup
are suitable for adapting it to other languages or competitions.

## Features

- Username and password authentication with Supabase Auth.
- Administrator approval workflow for new participants.
- Group-stage and knockout match predictions.
- Tournament champion prediction.
- Predictions close automatically when a match starts.
- Other participants' predictions remain hidden until a match closes.
- Configurable scoring for result signs, exact scores, knockout qualifiers, and
  the tournament champion.
- Live leaderboard and per-user score breakdown.
- Administrator dashboard for users, fixtures, manual result corrections,
  synchronization, and score recalculation.
- Automatic fixture and result synchronization from the public `worldcup26.ir`
  endpoints.
- Per-match result checks using Supabase `pg_cron` and `pg_net`.
- Row Level Security policies for all public application tables.

## Tech Stack

- [Next.js](https://nextjs.org/) App Router
- TypeScript and React
- Tailwind CSS
- [Supabase](https://supabase.com/) Auth and PostgreSQL
- [Vercel](https://vercel.com/) for deployment

## Scoring

The default rules are stored in the `scoring_rules` table:

- Correct match outcome: 3 points.
- Exact score: 5 points total, instead of 3 + 5.
- Correct knockout qualifier: configurable bonus, currently 1 point.
- Correct tournament champion: 10 points.

Knockout score predictions represent the result after up to 120 minutes, without
including a penalty shootout. A predicted qualifier is also required for
knockout matches.

## Requirements

- Node.js 20 or later.
- A Supabase project.
- Supabase CLI, or access to the Supabase SQL editor.
- A Vercel account for production deployment and scheduled result checks.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in the variables:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   CRON_SECRET=
   APP_URL=
   ```

   `APP_URL` must be the public deployment URL when scheduled jobs are enabled,
   for example `https://your-app.vercel.app`.

4. Apply every migration in `supabase/migrations` in filename order:

   ```bash
   supabase db push
   ```

   Alternatively, run the migration files in order from the Supabase SQL editor.

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Creating the First Administrator

Register a user through `/register`, then promote it from the Supabase SQL editor:

```sql
update public.profiles
set role = 'admin', status = 'approved'
where username = 'your_username';
```

All other new accounts remain pending until an administrator approves or rejects
them from `/admin`.

## Fixture Synchronization

The application reads public tournament data from:

```text
https://worldcup26.ir/get/teams
https://worldcup26.ir/get/games
https://worldcup26.ir/get/groups
```

Data is cached in the Supabase `teams`, `matches`, and `sync_logs` tables. Pages
read from Supabase instead of requesting the external API on every visit.

The administrator's **Sync now** action imports teams, groups, fixtures, schedule
changes, and results. Manual match overrides are preserved during later
synchronizations.

## Automatic Result Checks

Migration `003_per_match_scheduler.sql` enables `pg_cron` and `pg_net` and creates
one scheduled job per match:

- Group-stage checks begin 95 minutes after kickoff.
- Knockout checks begin 125 minutes after kickoff.
- An unfinished match is checked again five minutes later.
- A completed match updates its predictions and leaderboard, then removes its
  scheduled job.
- Completing the last match in a stage triggers a full synchronization to load
  the next knockout stage.

Supabase Cloud cannot call `localhost`, so these jobs require a public `APP_URL`.
The scheduler stores `APP_URL` and `CRON_SECRET` in the restricted
`app_settings` table when an administrator configures it.

## Security

- Never commit `.env.local` or real credentials.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_*` variable.
- The service-role key is only used by server-side synchronization and scoring
  code.
- Row Level Security limits participants to their own open predictions.
- Pending users cannot access pool data.
- Other users' predictions are hidden until the relevant match is closed.
- Administrative actions verify the authenticated profile's role.

Before deploying a fork, generate a strong `CRON_SECRET`, review all RLS policies,
and configure the production environment variables in Supabase and Vercel.

## Useful Commands

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Project Structure

```text
src/app/                 Next.js pages, layouts, and API routes
src/components/          Shared UI components
src/lib/                 Authentication, scoring, formatting, and sync logic
src/lib/supabase/        Browser, server, middleware, and admin clients
supabase/migrations/     Database schema, RLS, scheduler, and rule migrations
public/images/           Public visual assets
```

The SQL files `supabase/repair_profiles.sql` and
`supabase/reset_app_schema.sql` are maintenance utilities. Review them before
running them, especially the reset script because it removes application data.

## Deployment

1. Create a Vercel project from this repository.
2. Add all variables from `.env.example` to the Vercel project.
3. Set `APP_URL` to the production deployment URL.
4. Deploy the application.
5. Sign in as an administrator, synchronize fixtures, and configure the
   per-match scheduler.

## External Data Disclaimer

`worldcup26.ir` is an external public service and is not controlled by this
project. Its availability and response format may change. The administrator
tools and manual overrides are intended to keep the pool usable when the data
source is delayed or unavailable.

This project is not affiliated with or endorsed by FIFA.

## License

Released under the [MIT License](LICENSE).
