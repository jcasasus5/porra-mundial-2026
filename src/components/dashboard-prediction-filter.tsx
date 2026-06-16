"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Spinner } from "@/components/spinner";

const FILTER_COOKIE = "dashboardPendingPredictionsOnly";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type DashboardPredictionFilterProps = {
  enabled: boolean;
  pendingCount: number;
  totalCount: number;
};

export function DashboardPredictionFilter({
  enabled,
  pendingCount,
  totalCount,
}: DashboardPredictionFilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-4 sm:mt-8 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <div>
        <p className="text-sm font-semibold text-zinc-700">Filtro</p>
        <p className="mt-1 text-sm text-zinc-600">
          {pendingCount} de {totalCount} partidos pendientes
        </p>
      </div>
      <button
        aria-pressed={enabled}
        className={
          enabled
            ? "mt-3 inline-flex w-full items-center justify-between gap-3 rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white sm:mt-0 sm:w-auto"
            : "mt-3 inline-flex w-full items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:mt-0 sm:w-auto"
        }
        disabled={pending}
        onClick={() => {
          const nextEnabled = !enabled;
          document.cookie = `${FILTER_COOKIE}=${nextEnabled ? "1" : "0"}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
          startTransition(() => {
            router.refresh();
          });
        }}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          {pending ? <Spinner className="spinner-sm spinner-current" label="Filtrando" /> : null}
          Solo pendientes
        </span>
        <span
          aria-hidden="true"
          className={
            enabled
              ? "relative h-5 w-9 rounded-full bg-white/35"
              : "relative h-5 w-9 rounded-full bg-zinc-200"
          }
        >
          <span
            className={
              enabled
                ? "absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition"
                : "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition"
            }
          />
        </span>
      </button>
    </section>
  );
}
