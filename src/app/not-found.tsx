import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 bg-[#050507] text-white">
      <h1 className="text-xl font-bold">404</h1>
      <p className="text-sm text-zinc-400">Page not found</p>
      <Link href="/" className="text-sm text-emerald-400 underline">
        Back to terminal
      </Link>
    </main>
  );
}
