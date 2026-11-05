import { useEffect, useState } from "react";
import type { Analytics as AnalyticsData } from "../lib/types";
import { Card, EmptyState, Skeleton, Stat } from "./ui";

/** "not_interested" -> "Not interested" */
function pretty(id: string) {
  const text = id.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function minutes(seconds: number) {
  if (!seconds) return "–";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** A horizontal bar whose width is count / max. */
function Bar({ label, count, max, tone = "from-brand to-speak", note }: { label: string; count: number; max: number; tone?: string; note?: string }) {
  const width = max ? Math.max(count ? 3 : 0, Math.round((count / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="truncate text-ink">{label}</span>
        <span className="flex-none tabular-nums text-muted">
          <strong className="font-semibold text-ink">{count}</strong>
          {note && <span className="ml-1.5">{note}</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <EmptyState icon="chart" title="Couldn't load analytics" hint="Check that the server is running, then reload." />;
  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { totals, funnel, dropOff, objections, dispositions } = data;
  if (totals.calls === 0) {
    return <EmptyState icon="chart" title="No calls to analyse yet" hint="Finish a few calls from the Live call tab and the numbers appear here." />;
  }

  const funnelMax = funnel[0]?.count ?? 0;
  const dropMax = Math.max(...dropOff.map((d) => d.count), 0);
  const objMax = Math.max(...objections.map((o) => o.count), 0);
  const biggestLeak = dropOff.find((d) => d.stage !== "unknown");
  const answeredPct = (n: number) => (totals.answered ? `${Math.round((n / totals.answered) * 100)}% of answered` : undefined);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Calls made" value={totals.calls} icon="phone" tone="brand" />
        <Stat label="Answered by a person" value={totals.answered} icon="users" tone="speak" />
        <Stat label="Reached the demo ask" value={totals.reachedDemoAsk} icon="calendar" tone="warn" />
        <Stat label="Demos booked" value={totals.booked} icon="check" tone="good" />
        <Stat label={`Booking rate · avg ${minutes(totals.avgDurationSec)}`} value={`${totals.bookingRate}%`} icon="bolt" tone="speak" />
      </section>

      {biggestLeak && (
        <div className="rounded-2xl bg-warn/10 p-4 ring-1 ring-warn/25">
          <p className="text-sm font-semibold text-warn">Fix this first</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Most callers who didn't book stopped talking to us at <strong className="text-ink">{biggestLeak.label.toLowerCase()}</strong> ({biggestLeak.count} of{" "}
            {dropOff.reduce((a, d) => a + d.count, 0)} lost calls). Open the Conversations tab, read those calls, and flag the replies that went wrong.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">How far calls get</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">Each step is the calls that made it that far.</p>
          <div className="flex flex-col gap-3.5">
            {funnel.map((step, i) => (
              <Bar
                key={step.key}
                label={step.label}
                count={step.count}
                max={funnelMax}
                tone={step.key === "booked" ? "from-good to-speak" : "from-brand to-speak"}
                note={i > 0 && funnel[i - 1]!.count ? `${Math.round((step.count / funnel[i - 1]!.count) * 100)}% of previous` : undefined}
              />
            ))}
          </div>
          {data.callsWithoutStages > 0 && (
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              {data.callsWithoutStages} call{data.callsWithoutStages === 1 ? "" : "s"} have no step-by-step data (saved before analytics existed, or never picked up), so the middle steps count only newer calls.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Where callers stop</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">Answered calls that didn't book, by the part of the call they last spoke in.</p>
          {dropOff.length === 0 ? (
            <p className="text-xs text-muted">No lost calls yet.</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {dropOff.map((d) => (
                <Bar key={d.stage} label={d.label} count={d.count} max={dropMax} tone="from-warn to-danger" note={answeredPct(d.count)} />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Top objections</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">What callers pushed back on, most common first.</p>
          {objections.length === 0 ? (
            <p className="text-xs text-muted">No objections recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {objections.slice(0, 8).map((o) => (
                <Bar key={o.id} label={pretty(o.id)} count={o.count} max={objMax} tone="from-brand to-speak" />
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">How calls ended</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted">The outcome the agent recorded for every call.</p>
          <div className="flex flex-col gap-3.5">
            {dispositions.map((d) => (
              <Bar key={d.name} label={d.name} count={d.count} max={dispositions[0]?.count ?? 0} tone={d.name === "Meeting Booked" ? "from-good to-speak" : "from-brand/70 to-speak/70"} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
