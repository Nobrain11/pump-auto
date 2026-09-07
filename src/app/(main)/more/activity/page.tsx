"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Button } from "@/components/ui/button";

interface EventRow {
  id: string;
  type: string;
  message: string;
  severity: string;
  timestamp: string;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity");
      const data = await res.json();
      setEvents(data.events || []);
      setNote(data.note || null);
    } catch {
      setNote("Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const severityColor = (s: string) => {
    if (s === "SUCCESS") return "text-[var(--success)]";
    if (s === "WARNING") return "text-[var(--warning)]";
    if (s === "ERROR") return "text-[var(--danger)]";
    return "text-[var(--muted)]";
  };

  return (
    <main className="min-h-dvh flex flex-col pb-20">
      <header className="px-5 pt-6 pb-4 border-b border-[var(--card-border)] flex justify-between items-end">
        <div>
          <Link href="/more" className="text-xs text-[var(--muted)]">
            ← More
          </Link>
          <h1 className="text-lg font-bold text-white mt-1">Activity</h1>
        </div>
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </header>

      <div className="flex-1 px-5 py-4 max-w-lg mx-auto w-full space-y-2">
        {note && <p className="text-[10px] text-[var(--muted)]">{note}</p>}

        {events.length === 0 && !loading && (
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted)]">
            No activity yet. Events appear when the scanner, risk engine, and
            execution worker run.
          </div>
        )}

        {events.map((e) => (
          <div
            key={e.id}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3"
          >
            <div className="flex justify-between gap-2">
              <p className="text-sm text-white">{e.message}</p>
              <span className={`text-[10px] font-mono shrink-0 ${severityColor(e.severity)}`}>
                {e.severity}
              </span>
            </div>
            <p className="text-[10px] text-[var(--muted)] font-mono mt-1">
              {new Date(e.timestamp).toLocaleString()} · {e.type}
            </p>
          </div>
        ))}
      </div>

      <BottomNav />
    </main>
  );
}
