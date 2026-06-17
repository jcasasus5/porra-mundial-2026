"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Spinner } from "@/components/spinner";

const FILTER_COOKIE = "dashboardMatchFilter";
const LEGACY_PENDING_FILTER_COOKIE = "dashboardPendingPredictionsOnly";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type DashboardMatchFilter = "pending" | "unfinished" | null;

type DashboardPredictionFilterProps = {
  activeFilter: DashboardMatchFilter;
  unfinishedCount: number;
  pendingCount: number;
  totalCount: number;
};

type FilterOption = {
  label: string;
  value: DashboardMatchFilter;
  count: number;
};

type RequestedFilter = {
  filter: DashboardMatchFilter;
  id: number;
};

export function DashboardPredictionFilter({
  activeFilter,
  unfinishedCount,
  pendingCount,
  totalCount,
}: DashboardPredictionFilterProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestedFilter, setRequestedFilter] = useState<RequestedFilter | null>(null);
  const options: FilterOption[] = [
    { label: "Todos", value: null, count: totalCount },
    { label: "Sin predicción", value: "pending", count: pendingCount },
    { label: "No finalizados", value: "unfinished", count: unfinishedCount },
  ];

  useEffect(() => {
    if (!requestedFilter) return;

    document.cookie = `${FILTER_COOKIE}=${requestedFilter.filter ?? "all"}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax`;
    document.cookie = `${LEGACY_PENDING_FILTER_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  }, [requestedFilter, router, startTransition]);

  function applyFilter(filter: DashboardMatchFilter) {
    const nextFilter = filter === activeFilter ? null : filter;
    setRequestedFilter({ filter: nextFilter, id: Date.now() });
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 sm:mt-8 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-zinc-700">Filtros</p>
        <div aria-label="Filtros de partidos" className="grid gap-2 sm:flex sm:flex-wrap" role="group">
          {options.map((option) => {
            const active = option.value === activeFilter;

            return (
              <button
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex items-center justify-between gap-3 rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white"
                    : "inline-flex items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                }
                disabled={pending}
                key={option.label}
                onClick={() => {
                  applyFilter(option.value);
                }}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  {pending && active ? <Spinner className="spinner-sm spinner-current" label="Filtrando" /> : null}
                  {option.label}
                </span>
                <span
                  className={
                    active
                      ? "rounded-full bg-white/20 px-2 py-0.5 text-xs"
                      : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                  }
                >
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
