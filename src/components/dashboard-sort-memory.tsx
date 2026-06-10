"use client";

import { useEffect } from "react";

type DashboardSortMemoryProps = {
  sort?: "group" | "date";
};

export function DashboardSortMemory({ sort }: DashboardSortMemoryProps) {
  useEffect(() => {
    if (sort) {
      window.localStorage.setItem("dashboardGroupSort", sort);
    }
  }, [sort]);

  return null;
}
