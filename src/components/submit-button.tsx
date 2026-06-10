"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  blockPage?: boolean;
  overlayText?: string;
  title?: string;
};

export function SubmitButton({
  children,
  pendingText = "Guardando...",
  className = "button",
  blockPage = false,
  overlayText,
  title,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <>
      <button className={className} disabled={pending} title={title} type="submit">
        {pending ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner className="spinner-sm spinner-current" label={pendingText} />
            {pendingText}
          </span>
        ) : (
          children
        )}
      </button>
      {blockPage && pending ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 px-4 backdrop-blur-sm">
          <div className="grid min-w-[240px] justify-items-center gap-3 rounded-lg border border-white/30 bg-white px-6 py-5 text-center shadow-xl">
            <Spinner className="spinner-lg" label={overlayText ?? pendingText} />
            <p className="text-sm font-semibold text-zinc-900">{overlayText ?? pendingText}</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
