import { Component, useEffect, useState, type ReactNode } from "react";
import LiveCall from "./components/LiveCall";
import Overview from "./components/Overview";
import Conversations from "./components/Conversations";
import Leads from "./components/Leads";
import Bookings from "./components/Bookings";
import Questions from "./components/Questions";
import ScriptView from "./components/ScriptView";
import { Icon, type IconName } from "./components/ui";

type Tab = "live" | "overview" | "conversations" | "leads" | "bookings" | "questions" | "script";

const NAV: { group: string; items: { id: Tab; label: string; icon: IconName; title: string; subtitle: string }[] }[] = [
  {
    group: "Workspace",
    items: [
      { id: "live", label: "Live call", icon: "phone", title: "Live call", subtitle: "Pick an agent and a lead, then talk to your AI sales rep." },
      { id: "overview", label: "Overview", icon: "chart", title: "Overview", subtitle: "How your voice agent is performing." },
      { id: "conversations", label: "Conversations", icon: "chat", title: "Conversations", subtitle: "Every call, with the full transcript." },
    ],
  },
  {
    group: "Pipeline",
    items: [
      { id: "leads", label: "Leads", icon: "users", title: "Leads", subtitle: "Everyone the agent can call." },
      { id: "bookings", label: "Bookings", icon: "calendar", title: "Bookings", subtitle: "Meetings the agent has booked." },
      { id: "questions", label: "Questions", icon: "help", title: "Questions", subtitle: "What callers asked, and what the knowledge base couldn't answer." },
    ],
  },
  {
    group: "Configure",
    items: [{ id: "script", label: "Script", icon: "file", title: "Script & knowledge", subtitle: "Every line the agent can say." }],
  },
];

const ALL = NAV.flatMap((g) => g.items);

/** A render error in one page must not blank the whole app. */
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <p className="text-sm font-semibold">This page hit an error.</p>
        <p className="mt-1 text-xs text-muted">Your data is safe — reload to continue.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [inCall, setInCall] = useState(false);
  const [company, setCompany] = useState({ name: "Aarohi Connect", founder: "" });

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => d?.company && setCompany({ name: d.company.name, founder: d.company.founder }))
      .catch(() => undefined);
  }, []);

  const current = ALL.find((i) => i.id === tab)!;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* ------------------------------ sidebar ------------------------------ */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/[0.06] bg-bg/60 px-4 py-5 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-speak text-bg shadow-glow">
            <Icon name="radio" size={19} />
          </span>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-bold tracking-tight">{company.name}</p>
            <p className="text-[11px] text-muted">Voice agent studio</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto" aria-label="Dashboard">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70">{g.group}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => {
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={inCall && item.id !== "live"}
                      onClick={() => setTab(item.id)}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${
                        active ? "bg-white/[0.07] text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink"
                      }`}
                    >
                      {active && <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand to-speak" />}
                      <Icon name={item.icon} size={17} className={active ? "text-brand" : ""} />
                      {item.label}
                      {item.id === "live" && inCall && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-danger" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="glass mt-4 rounded-xl p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-ink">
            <span className={`h-2 w-2 rounded-full ${inCall ? "animate-pulse bg-danger" : "bg-good"}`} />
            {inCall ? "Call in progress" : "Agent online"}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Browser voice now. Real phone calls via Vapi once keys are set.
          </p>
        </div>
      </aside>

      {/* ------------------------------- main -------------------------------- */}
      <div className="min-w-0">
        {/* mobile top bar */}
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-bg/80 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-speak text-bg">
              <Icon name="radio" size={17} />
            </span>
            <p className="font-display text-sm font-bold">{company.name}</p>
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
              <span className={`h-2 w-2 rounded-full ${inCall ? "animate-pulse bg-danger" : "bg-good"}`} />
              {inCall ? "On call" : "Online"}
            </span>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto px-4 pb-3" aria-label="Dashboard">
            {ALL.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={inCall && item.id !== "live"}
                onClick={() => setTab(item.id)}
                className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-35 ${
                  tab === item.id ? "bg-white/10 text-ink" : "text-muted"
                }`}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="fade-up mb-7 flex flex-wrap items-end justify-between gap-3" key={`head-${tab}`}>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-[30px]">
                {tab === "live" ? <span className="gradient-text">{current.title}</span> : current.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">{current.subtitle}</p>
            </div>
            {company.founder && tab === "live" && (
              <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-muted sm:flex">
                <Icon name="calendar" size={14} className="text-brand" />
                Demos with {company.founder}
              </span>
            )}
          </div>

          <div className={tab === "live" ? "" : "hidden"}>
            <LiveCall onInCallChange={setInCall} />
          </div>
          <PageBoundary key={`page-${tab}`}>
            {tab === "overview" && <Overview />}
            {tab === "conversations" && <Conversations />}
            {tab === "leads" && <Leads />}
            {tab === "bookings" && <Bookings />}
            {tab === "questions" && <Questions />}
            {tab === "script" && <ScriptView />}
          </PageBoundary>
        </main>
      </div>
    </div>
  );
}
