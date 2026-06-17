"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

const BASE_SCROLL_KEY = "dashboardScrollPosition";
const SCROLL_KEY_PREFIX = `${BASE_SCROLL_KEY}:`;
const RESTORE_ATTEMPTS = 20;

type ScrollSnapshot = {
  y: number;
  updatedAt: number;
};

function readSnapshot(key: string): ScrollSnapshot | null {
  try {
    const rawSnapshot = window.sessionStorage.getItem(key);
    if (!rawSnapshot) return null;

    const snapshot = JSON.parse(rawSnapshot) as Partial<ScrollSnapshot>;
    if (typeof snapshot.y !== "number" || Number.isNaN(snapshot.y)) return null;

    return {
      y: Math.max(0, snapshot.y),
      updatedAt: typeof snapshot.updatedAt === "number" ? snapshot.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(key: string) {
  try {
    const snapshot = JSON.stringify({
      y: window.scrollY,
      updatedAt: Date.now(),
    } satisfies ScrollSnapshot);

    window.sessionStorage.setItem(key, snapshot);
    window.sessionStorage.setItem(BASE_SCROLL_KEY, snapshot);
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function restoreScroll(y: number) {
  let attempts = 0;

  function restore() {
    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.min(y, maxScrollY);

    window.scrollTo(0, targetY);
    attempts += 1;

    if (attempts < RESTORE_ATTEMPTS && Math.abs(window.scrollY - targetY) > 2) {
      window.requestAnimationFrame(restore);
    }
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(restore);
  });
}

export function DashboardScrollMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const didObserveScroll = useRef(false);
  const scrollKey = useMemo(() => {
    const query = searchParams.toString();
    return `${SCROLL_KEY_PREFIX}${pathname}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  useEffect(() => {
    const snapshot = readSnapshot(scrollKey) ?? readSnapshot(BASE_SCROLL_KEY);

    if (snapshot && snapshot.y > 0) {
      restoreScroll(snapshot.y);
    }
  }, [scrollKey]);

  useEffect(() => {
    let animationFrame = 0;

    function save() {
      didObserveScroll.current = true;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        writeSnapshot(scrollKey);
      });
    }

    function saveImmediately() {
      window.cancelAnimationFrame(animationFrame);
      writeSnapshot(scrollKey);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        saveImmediately();
      }
    }

    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", saveImmediately);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (didObserveScroll.current || window.scrollY > 0) {
        saveImmediately();
      }
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scrollKey]);

  return null;
}
