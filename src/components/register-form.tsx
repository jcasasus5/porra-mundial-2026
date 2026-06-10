"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { signUp, type AuthActionState } from "@/lib/actions";

const initialState: AuthActionState = {};

export function RegisterForm() {
  const [state, formAction] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="mt-6 grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}
      <label className="grid gap-2 text-sm font-medium">
        Nombre de usuario
        <input className="field" name="username" minLength={3} maxLength={30} required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Email
        <input className="field" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Contraseña
        <input className="field" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <SubmitButton pendingText="Creando...">Crear cuenta</SubmitButton>
    </form>
  );
}
