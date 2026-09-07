"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 bg-[#050507] text-white">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-zinc-400 text-center max-w-md">
        {error.message || "Unexpected error"}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 text-sm"
      >
        Try again
      </button>
    </main>
  );
}
