import { useEffect, useState } from "react";
import type { DashboardData } from "../lib/types";
import { Avatar, Card, DispositionBadge, EmptyState, ScoreMeter, Skeleton, Stat, type IconName } from "./ui";

export default function Overview() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const stats = data?.stats;
  const rate = stats && stats.calls ? Math.round((stats.booked / stats.calls) * 100) : 0;
  const cards: { label: string; value: number | string; icon: IconName; tone: "brand" | "good" | "speak" | "warn" | "danger" }[] = [
    { label: "Calls made", value: stats?.calls ?? 0, icon: "phone", tone: "brand" },
    { label: "Meetings booked", value: stats?.booked ?? 0, icon: "calendar", tone: "good" },
    { label: "Booking rate", value: `${rate}%`, icon: "bolt", tone: "speak" },
    { label: "Leads", value: stats?.leads ?? 0, icon: "users", tone: "brand" },
    { label: "Questions asked", value: stats?.questions ?? 0, icon: "help", tone: "warn" },
    { label: "Unanswered", value: stats?.unanswered ?? 0, icon: "shield", tone: "danger" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Stat key={c.label} {...c} />
        ))}
      </section>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Recent activity</h2>
          {stats && <span className="text-xs text-muted">{stats.ragChunks} knowledge chunks indexed</span>}
        </div>
        {!data && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )}
        {data && data.recentCalls.length === 0 && (
          <EmptyState icon="phone" title="No calls yet" hint="Run a call from the Live call tab and it will show up here." />
        )}
        <div className="flex flex-col divide-y divide-white/[0.06]">
          {(data?.recentCalls ?? []).map((c, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Avatar name={c.lead?.contact_name || "?"} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.lead?.contact_name || "Unknown"}</p>
                <p className="truncate text-xs text-muted">{c.lead?.company_name || ""}</p>
              </div>
              <div className="hidden sm:block">
                <ScoreMeter score={c.lead_score} />
              </div>
              <DispositionBadge value={c.disposition} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
