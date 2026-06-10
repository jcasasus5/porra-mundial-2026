import { Spinner } from "@/components/spinner";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="grid justify-items-center gap-3 rounded-lg border border-zinc-200 bg-white px-7 py-6 shadow-sm">
        <Spinner className="spinner-lg" />
        <p className="text-sm font-semibold text-zinc-700">Cargando...</p>
      </div>
    </main>
  );
}
