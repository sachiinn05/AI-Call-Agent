import { useEffect, useMemo, useRef, useState } from "react";
import {
  closeMic,
  createListener,
  drawWave,
  openMic,
  speak,
  startListening,
  stopListening,
  stopSpeaking,
  unlockAudio,
  voice,
} from "../lib/voice.js";
import type { Agent, CallResult, Lead, ReplyVia } from "../lib/types";
import { Avatar, Badge, Card, DispositionBadge, EmptyState, Icon, ScoreMeter, SectionTitle, Skeleton, initials } from "./ui";

type Phase = "idle" | "ringing" | "speaking" | "listening" | "ended";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  ringing: "Calling…",
  speaking: "Agent speaking",
  listening: "Your turn — say okay, or type it",
  ended: "Call ended",
};

// Windows can't draw flag emoji, so each agent gets a language badge instead.
const LANG_BADGE: Record<string, { label: string; gradient: string }> = {
  "hi-IN-hinglish": { label: "हिं", gradient: "from-orange-500 to-rose-500" },
  "en-IN": { label: "EN·IN", gradient: "from-emerald-500 to-teal-500" },
  "en-US": { label: "EN·US", gradient: "from-sky-500 to-indigo-500" },
};

// Was 5.5s — in real calls that fired while the caller was mid-answer and
// still being recognized, and ended two engaged calls as "Not Interested"
// purely on the timeout.
const SILENCE_NUDGE_MS = 9000;

function viaLabel(via: ReplyVia | "", _faqId?: string | null): { text: string; tone: string } {
  if (via === "faq") return { text: "Answered from the Company Policy PDF (RAG)", tone: "bg-good/15 text-good" };
  if (via === "steer") return { text: "Script line, said Groq's way — same facts", tone: "bg-speak/15 text-speak" };
  if (via === "groq") return { text: "Groq heard you — speaking the script", tone: "bg-speak/15 text-speak" };
  if (via === "script") return { text: "Script line — word for word", tone: "bg-white/[0.07] text-muted" };
  return { text: "Script locked · Groq only hears intent", tone: "bg-white/[0.07] text-muted" };
}

export default function LiveCall({ onInCallChange }: { onInCallChange: (v: boolean) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallResult[]>([]);
  const [selectedCall, setSelectedCall] = useState(-1);
  const [result, setResult] = useState<CallResult | null>(null);

  const [inCall, setInCall] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [caption, setCaption] = useState("Say okay — or type it — when she's done talking.");
  const [via, setVia] = useState<{ via: ReplyVia | ""; faqId?: string | null }>({ via: "" });
  const [timerText, setTimerText] = useState("00:00");
  const [showCallScreen, setShowCallScreen] = useState(false);
  const [startCallDisabled, setStartCallDisabled] = useState(true);
  const [testDisabled, setTestDisabled] = useState(true);
  const [testStatus, setTestStatus] = useState("");
  const [hangupVisible, setHangupVisible] = useState(false);
  const [replyBarVisible, setReplyBarVisible] = useState(false);
  const [newCallVisible, setNewCallVisible] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [liveLog, setLiveLog] = useState<{ who: "agent" | "you"; text: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const languageRef = useRef<Agent["language"]>("en-IN");
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | undefined>(undefined);
  const silenceTimerRef = useRef<number | undefined>(undefined);
  const listenerReadyRef = useRef(false);
  const nudgesRef = useRef(0);
  const fillersRef = useRef<string[]>([]);
  const lastFillerRef = useRef("");
  const inCallRef = useRef(false);
  const queuedRef = useRef("");

  useEffect(() => {
    onInCallChange(inCall);
  }, [inCall, onInCallChange]);

  // --- initial data ---------------------------------------------------
  useEffect(() => {
    (async () => {
      const [a, l] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/leads").then((r) => r.json()),
      ]);
      setAgents(a);
      setLeads(l);
    })();
    void loadCalls();
  }, []);

  async function loadCalls() {
    const calls: CallResult[] = await (await fetch("/api/calls")).json();
    setRecentCalls(calls);
  }

  // --- waveform animation ----------------------------------------------
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      if (canvasRef.current) drawWave(canvasRef.current, inCallRef.current);
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [liveLog]);

  // --- derived ---------------------------------------------------------
  const currentAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId) || null, [agents, selectedAgentId]);

  const matchingLeads = useMemo(() => {
    if (!currentAgent) return [];
    const q = leadQuery.trim().toLowerCase();
    return leads
      .filter((lead) => lead.preferred_language === currentAgent.language)
      .filter((lead) => !q || `${lead.contact_name} ${lead.company_name} ${lead.industry}`.toLowerCase().includes(q));
  }, [leads, currentAgent, leadQuery]);

  useEffect(() => {
    setTestDisabled(!selectedAgentId);
  }, [selectedAgentId]);

  function selectAgent(id: string) {
    if (inCall || id === selectedAgentId) return;
    setSelectedAgentId(id);
    setSelectedLead(null);
    setLeadQuery("");
  }

  function selectLead(number: string) {
    const lead = matchingLeads.find((l) => l.contact_number === number);
    if (!lead) return;
    setSelectedLead(lead);
    setConfirmEmail(lead.email ?? "");
  }

  useEffect(() => {
    setStartCallDisabled(!selectedLead);
  }, [selectedLead]);

  // --- audio plumbing ----------------------------------------------------
  function armSilenceNudge() {
    window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      if (inCallRef.current && !busyRef.current && !voice.speaking && nudgesRef.current < 2) void sendNudge();
    }, SILENCE_NUDGE_MS);
  }

  function listenAgain() {
    if (!inCallRef.current || busyRef.current || voice.speaking) return;
    setPhase("listening");
    startListening();
    armSilenceNudge();
  }

  function attachListener() {
    if (listenerReadyRef.current) return true;
    try {
      createListener({
        language: languageRef.current,
        onPartial: (text: string) => {
          if (voice.speaking) return;
          setCaption(`You: ${text}`);
          armSilenceNudge();
        },
        onFinal: (text: string) => void sendUtterance(text),
        // The caller talked over the agent: the agent has already stopped, so show it is listening.
        onInterrupt: () => {
          setPhase("listening");
          armSilenceNudge();
        },
        onIdle: () => {
          // Chrome ends recognition sessions on its own; keep listening, including while a
          // line the caller may interrupt is playing.
          const canListen = voice.speaking ? voice.bargeIn : !busyRef.current;
          if (inCallRef.current && canListen) startListening();
        },
      });
      listenerReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  async function ensureMic() {
    try {
      if (!voice.stream) await openMic();
      attachListener();
      return true;
    } catch {
      return false;
    }
  }

  async function loadFillers(lang: string) {
    try {
      const res = await fetch(`/api/fillers?language=${encodeURIComponent(lang)}`);
      fillersRef.current = (await res.json()).fillers || [];
    } catch {
      fillersRef.current = [];
    }
  }

  async function playFiller() {
    if (!fillersRef.current.length || !inCallRef.current) return;
    const choices =
      fillersRef.current.length > 1 ? fillersRef.current.filter((f) => f !== lastFillerRef.current) : fillersRef.current;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    if (!pick) return;
    lastFillerRef.current = pick;
    setPhase("speaking");
    setCaption(`Agent: ${pick}`);
    try {
      await speak(pick, languageRef.current);
    } catch {
      /* filler is optional — never block the real reply on it */
    }
  }

  async function playAgent(text: string, viaKind: ReplyVia, faqId?: string | null, armMic = true) {
    setCaption(`Agent: ${text}`);
    setLiveLog((l) => [...l, { who: "agent", text }]);
    setPhase("speaking");
    setVia({ via: viaKind, faqId });
    window.clearTimeout(silenceTimerRef.current);
    // Listen from the first word so the caller can interrupt (barge-in). The closing line
    // (armMic false) is never interrupted. The near-end arming stays as a backup for when
    // Chrome has closed the recognition session mid-line.
    if (armMic && inCallRef.current && listenerReadyRef.current) startListening();
    await speak(text, languageRef.current, {
      bargeIn: armMic,
      onNearEnd: armMic ? () => inCallRef.current && listenerReadyRef.current && startListening() : undefined,
    });
  }

  async function sendUtterance(text: string) {
    const said = text.trim();
    if (!callIdRef.current || !said) return;
    if (busyRef.current) {
      // The caller spoke while we were still mid-turn: keep it and answer it next, never drop it.
      queuedRef.current = `${queuedRef.current} ${said}`.trim();
      return;
    }
    busyRef.current = true;
    nudgesRef.current = 0;
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    setCaption(`You: ${said}`);
    setLiveLog((l) => [...l, { who: "you", text: said }]);

    // Fire the request first, then fill the dead air with a short "right,
    // got it…" while it's in flight — hides the LLM+TTS round trip, which is
    // what actually makes the agent feel slow.
    const pending = fetch("/api/simulate/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current, text: said }),
    });
    const raced = await Promise.race([
      pending.then(() => "ready").catch(() => "ready"),
      new Promise((resolve) => setTimeout(() => resolve("slow"), 350)),
    ]);
    if (raced === "slow") await playFiller();

    const res = await pending;
    const data = await res.json();
    // After an open question a bare "haan…" is usually the start of a longer answer: wait for the rest.
    voice.ackWaitMs = data.state === "CONTEXT_BRIDGE" ? 1500 : 450;
    await playAgent(data.agent, data.via, data.faqId, !data.ended);
    busyRef.current = false;
    if (data.ended) {
      await finish(data.result);
      return;
    }
    const queued = queuedRef.current;
    queuedRef.current = "";
    if (queued) {
      await sendUtterance(queued);
      return;
    }
    listenAgain();
  }

  async function sendNudge() {
    if (!callIdRef.current || busyRef.current) return;
    nudgesRef.current += 1;
    busyRef.current = true;
    const res = await fetch("/api/simulate/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current }),
    });
    const data = await res.json();
    await playAgent(data.agent, data.via, undefined, !data.ended);
    busyRef.current = false;
    if (data.ended) {
      await finish(data.result);
      return;
    }
    listenAgain();
  }

  async function finish(callResult: CallResult | null) {
    setInCall(false);
    inCallRef.current = false;
    busyRef.current = false;
    listenerReadyRef.current = false;
    nudgesRef.current = 0;
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    stopSpeaking();
    closeMic();
    window.clearInterval(tickRef.current);
    setHangupVisible(false);
    setReplyBarVisible(false);
    setNewCallVisible(true);
    callIdRef.current = null;
    setPhase("ended");
    if (callResult) {
      setSelectedCall(0);
      setResult(callResult);
    }
    await loadCalls();
  }

  async function hangup() {
    if (!callIdRef.current) {
      await finish(null);
      return;
    }
    window.clearTimeout(silenceTimerRef.current);
    stopListening();
    const res = await fetch("/api/simulate/hangup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: callIdRef.current }),
    });
    const data = await res.json();
    if (data.agent) await playAgent(data.agent, "script", undefined, false);
    await finish(data.result);
  }

  async function startCall() {
    const lead = selectedLead;
    if (!lead || inCallRef.current) return;
    setStartCallDisabled(true);
    languageRef.current = lead.preferred_language;
    listenerReadyRef.current = false;
    nudgesRef.current = 0;
    lastFillerRef.current = "";
    void loadFillers(lead.preferred_language);

    setShowCallScreen(true);
    setNewCallVisible(false);
    setLiveLog([]);
    setTimerText("00:00");

    try {
      await unlockAudio();
    } catch {
      setCaption("Click Start call again so the browser can unlock sound.");
      setStartCallDisabled(false);
      setShowCallScreen(false);
      return;
    }

    await ensureMic();

    setInCall(true);
    inCallRef.current = true;
    setPhase("ringing");
    setCaption(`Calling ${lead.contact_name.split(" ")[0]}…`);

    const res = await fetch("/api/simulate/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, email: confirmEmail.trim() }),
    });
    const data = await res.json();
    callIdRef.current = data.callId;
    startedAtRef.current = Date.now();
    tickRef.current = window.setInterval(() => {
      const s = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      setTimerText(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
    }, 250);
    setHangupVisible(true);
    setReplyBarVisible(true);
    setStartCallDisabled(false);

    await playAgent(data.agent, data.via);
    if (!inCallRef.current) return;
    await ensureMic();
    listenAgain();
  }

  function resetToPicker() {
    setSelectedLead(null);
    setNewCallVisible(false);
    setShowCallScreen(false);
  }

  async function testSpeaker() {
    setTestDisabled(true);
    const lang = currentAgent?.language || selectedLead?.preferred_language || "en-IN";
    try {
      await unlockAudio();
      await ensureMic();
      setTestStatus("Playing a test line…");
      await speak("Hi, this is the company AI. You should hear me now.", lang);
      setTestStatus("Speaker works. Choose a lead, then Start call.");
    } catch {
      setTestStatus("Unmute this browser tab, then try Test speaker again.");
    }
    setTestDisabled(false);
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typedReply;
    setTypedReply("");
    void sendUtterance(text);
  }

  const viaShown = viaLabel(via.via, via.faqId);

  const phaseDot = phase === "listening" ? "bg-good" : phase === "speaking" || phase === "ringing" ? "bg-speak" : phase === "ended" ? "bg-danger" : "bg-muted";
  const ringTone = phase === "listening" ? "border-good/60" : phase === "ended" ? "border-danger/40" : "border-speak/60";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-6">
        {!showCallScreen ? (
          <>
            {/* ---- step 1: agent ---- */}
            <Card className="p-5">
              <SectionTitle n={1} title="Choose your agent" hint="Same script and brain — a different voice and language each." />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {agents.map((a) => {
                  const selected = a.id === selectedAgentId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectAgent(a.id)}
                      className={`group relative flex flex-col items-start justify-start overflow-hidden rounded-2xl p-4 text-left ring-1 transition duration-200 ${
                        selected ? "bg-brand/10 shadow-glow ring-brand/60" : "bg-white/[0.02] ring-white/10 hover:-translate-y-0.5 hover:bg-white/[0.05] hover:ring-white/20"
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-bg">
                          <Icon name="check" size={12} />
                        </span>
                      )}
                      <span
                        className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg shadow-black/30 ${
                          LANG_BADGE[a.language]?.gradient ?? "from-slate-500 to-slate-600"
                        }`}
                      >
                        {LANG_BADGE[a.language]?.label ?? "AI"}
                      </span>
                      <strong className="block text-sm font-semibold">{a.name}</strong>
                      <span className="mt-0.5 block min-h-[2.5rem] text-xs leading-relaxed text-muted">{a.tagline}</span>
                      <Badge className="mt-3" tone={selected ? "brand" : "neutral"}>
                        <Icon name="speaker" size={11} /> {a.voice.provider}
                      </Badge>
                    </button>
                  );
                })}
                {agents.length === 0 && [0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}
              </div>
            </Card>

            {/* ---- step 2: lead ---- */}
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <SectionTitle
                  n={2}
                  title="Pick a lead to call"
                  hint={
                    currentAgent
                      ? `${matchingLeads.length} lead${matchingLeads.length === 1 ? "" : "s"} speak ${currentAgent.name.replace(" Agent", "")}.`
                      : "Choose an agent first to see who it can call."
                  }
                />
                {currentAgent && (
                  <div className="relative w-full sm:w-64">
                    <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={leadQuery}
                      onChange={(e) => setLeadQuery(e.target.value)}
                      placeholder="Search leads…"
                      className="input pl-9"
                    />
                  </div>
                )}
              </div>

              {!currentAgent && <EmptyState icon="users" title="No agent selected" hint="Pick one above and its leads will appear here." />}
              {currentAgent && matchingLeads.length === 0 && <EmptyState icon="search" title="No leads match" hint={`Nothing found for “${leadQuery}”.`} />}
              <div className="grid max-h-[380px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {matchingLeads.map((lead) => {
                  const selected = selectedLead?.contact_number === lead.contact_number;
                  return (
                    <button
                      key={lead.contact_number}
                      type="button"
                      onClick={() => selectLead(lead.contact_number)}
                      className={`flex items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition duration-150 ${
                        selected ? "bg-brand/10 ring-brand/60" : "bg-white/[0.02] ring-white/10 hover:bg-white/[0.05] hover:ring-white/20"
                      }`}
                    >
                      <Avatar name={lead.contact_name} size={42} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm font-semibold">{lead.contact_name}</strong>
                        <span className="block truncate text-xs text-muted">
                          {lead.contact_role || "Contact"} · {lead.company_name}
                        </span>
                        <span className="mt-1.5 line-clamp-2 block text-[11px] leading-snug text-muted/80">{lead.need_for_bot || lead.company_description}</span>
                      </span>
                      {selected && <Icon name="check" size={16} className="mt-0.5 flex-none text-brand" />}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* ---- call bar ---- */}
            <div className="glass sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl p-3.5 shadow-2xl shadow-black/50">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {selectedLead ? (
                  <>
                    <Avatar name={selectedLead.contact_name} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selectedLead.contact_name}</p>
                      <p className="truncate text-xs text-muted">{testStatus || selectedLead.company_name}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">{testStatus || (selectedAgentId ? "Select a lead to continue." : "Select an agent, then a lead.")}</p>
                )}
              </div>
              <div className="relative w-full sm:w-60">
                <Icon name="mail" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder="Invite email (editable)"
                  title="Auto-filled from the lead. Change it to your own address to receive the real calendar invite + reminder."
                  className="input pl-9"
                />
              </div>
              <button type="button" disabled={testDisabled} onClick={testSpeaker} className="btn-ghost">
                <Icon name="speaker" size={16} /> Test speaker
              </button>
              <button type="button" disabled={startCallDisabled} onClick={() => void startCall()} className="btn-primary">
                <Icon name="phone" size={16} /> Start call
              </button>
            </div>
          </>
        ) : (
          /* ------------------------------ call stage ------------------------------ */
          <div className="call-stage relative flex min-h-[640px] flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-2 px-5 pt-4 text-xs">
              <span className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 font-medium text-ink">
                <span className={`h-2 w-2 rounded-full ${inCall ? "animate-pulse bg-good" : "bg-danger"}`} />
                {inCall ? "Connected" : "Call ended"}
                <span className="font-mono text-muted">{timerText}</span>
              </span>
              <span className={`rounded-full px-3 py-1.5 font-medium ${viaShown.tone}`}>{viaShown.text}</span>
            </div>

            <div className="flex flex-col items-center px-6 pt-6 text-center">
              <div className="relative flex h-40 w-40 items-center justify-center">
                {(phase === "speaking" || phase === "ringing" || phase === "listening") && (
                  <>
                    <span className={`ripple absolute inset-3 rounded-full border ${ringTone}`} />
                    <span className={`ripple absolute inset-3 rounded-full border ${ringTone} [animation-delay:0.9s]`} />
                  </>
                )}
                <span className="orb-breathe relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand via-[#6d8dff] to-speak text-3xl font-bold text-white shadow-[0_0_70px_-8px_rgba(139,123,255,0.85)]">
                  {selectedLead ? initials(selectedLead.contact_name) : "AI"}
                </span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">{selectedLead?.contact_name || "Select a contact"}</h2>
              <p className="text-sm text-muted">
                {selectedLead ? `${selectedLead.contact_role ? selectedLead.contact_role + " · " : ""}${selectedLead.company_name}` : "Aarohi Connect outbound voice agent"}
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs font-medium text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${phaseDot}`} />
                {PHASE_LABEL[phase]}
              </p>
              <div className="mt-3 rounded-full border border-white/10 bg-black/20 px-3 py-1">
                <canvas ref={canvasRef} width={320} height={44} className="block max-w-full" />
              </div>
            </div>

            <div className="mx-4 mt-5 flex-1 rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.06]">
              <div className="flex max-h-64 min-h-[7rem] flex-col gap-2.5 overflow-y-auto px-1">
                {liveLog.length === 0 && <p className="m-auto text-center text-xs text-muted">{caption}</p>}
                {liveLog.map((m, i) => (
                  <div key={i} className={`bubble flex items-end gap-2 ${m.who === "you" ? "justify-end" : "justify-start"}`}>
                    {m.who === "agent" && (
                      <span className="mb-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-speak text-[9px] font-bold text-white">AI</span>
                    )}
                    <span
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        m.who === "you" ? "rounded-br-md bg-brand/25 text-ink ring-1 ring-brand/30" : "rounded-bl-md bg-white/[0.07] text-ink"
                      }`}
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {phase === "listening" && caption.startsWith("You:") && (
                  <div className="flex justify-end">
                    <span className="max-w-[80%] rounded-2xl rounded-br-md border border-dashed border-brand/40 px-3.5 py-2 text-sm italic text-muted">
                      {caption.replace(/^You:\s*/, "")}…
                    </span>
                  </div>
                )}
                {phase === "speaking" && liveLog.length > 0 && (
                  <div className="flex items-center gap-1 pl-8">
                    {[0, 1, 2].map((d) => (
                      <span key={d} style={{ animationDelay: `${d * 0.15}s` }} className="typing-dot h-1.5 w-1.5 rounded-full bg-muted" />
                    ))}
                  </div>
                )}
                <div ref={logEndRef} />
              </div>
            </div>

            <div className="px-4 pb-5 pt-4">
              {replyBarVisible && (
                <form onSubmit={submitTyped} className="mb-4 flex items-center gap-2">
                  <input
                    type="text"
                    value={typedReply}
                    onChange={(e) => setTypedReply(e.target.value)}
                    placeholder="Type okay / haan if the mic misses you"
                    autoComplete="off"
                    className="input rounded-full"
                  />
                  <button type="submit" className="btn-primary rounded-full px-5">
                    Send
                  </button>
                </form>
              )}
              <div className="flex items-center justify-center gap-6">
                {replyBarVisible && (
                  <button
                    type="button"
                    title="Tap to talk"
                    aria-label="Tap to talk"
                    onClick={async () => {
                      const ok = await ensureMic();
                      if (!ok) {
                        setCaption("Allow the microphone, or type okay in the box.");
                        return;
                      }
                      listenAgain();
                      setCaption("Listening… say okay.");
                    }}
                    className={`flex h-14 w-14 items-center justify-center rounded-full ring-1 transition hover:brightness-125 ${
                      phase === "listening" ? "bg-good/20 text-good ring-good/50" : "bg-white/[0.06] text-ink ring-white/15"
                    }`}
                  >
                    <Icon name="mic" size={22} />
                  </button>
                )}
                {hangupVisible && (
                  <button
                    type="button"
                    title="End call"
                    aria-label="End call"
                    onClick={() => void hangup()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg shadow-danger/40 transition hover:brightness-110 active:scale-95"
                  >
                    <Icon name="phone" size={26} className="rotate-[135deg]" />
                  </button>
                )}
                {newCallVisible && (
                  <button type="button" onClick={resetToPicker} className="btn-primary px-6 py-3">
                    <Icon name="phone" size={16} /> New call
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------- right rail ---------------------------- */}
      <aside className="flex min-w-0 flex-col gap-6">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold">After the call</h2>
          <TranscriptView result={result} />
        </Card>
        <Card className="p-3">
          <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">Recent calls</p>
          {recentCalls.length === 0 && <p className="px-2 pb-2 text-xs text-muted">No calls yet.</p>}
          <div className="flex flex-col gap-1">
            {recentCalls.slice(0, 8).map((c, i) => (
              <button
                key={c.call_id ?? i}
                type="button"
                disabled={inCall}
                onClick={() => {
                  setSelectedCall(i);
                  setResult(recentCalls[i] ?? null);
                }}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  i === selectedCall ? "bg-white/[0.08] ring-1 ring-brand/40" : "hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={c.lead?.contact_name || "?"} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{c.lead?.contact_name ?? "Unknown"}</span>
                  <span className="block truncate text-[11px] text-muted">{c.lead?.company_name ?? ""}</span>
                </span>
                <DispositionBadge value={c.disposition} />
              </button>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}

export function TranscriptView({ result }: { result: CallResult | null }) {
  if (!result) {
    return (
      <EmptyState
        icon="chat"
        title="Nothing here yet"
        hint="When a call ends, the outcome, score, summary and transcript open here. Click a recent call to read it again."
      />
    );
  }
  const lines = String(result.full_transcript || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const when = [result.meeting_details?.date, result.meeting_details?.time].filter(Boolean);
  const meeting = when[0] === when[1] ? when[0] : when.join(" ");
  const booking = result.meeting_details?.booking;
  const name = result.lead?.contact_name || "Unknown caller";
  return (
    <div className="fade-up flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{result.lead?.company_name ?? ""}</p>
        </div>
        <DispositionBadge value={result.disposition} />
      </div>
      <ScoreMeter score={result.lead_score} />
      {result.call_summary && <p className="rounded-xl bg-white/[0.04] p-3 text-[13px] leading-relaxed text-muted">{result.call_summary}</p>}
      {meeting && (
        <div className="rounded-xl bg-good/10 p-3 ring-1 ring-good/25">
          <p className="flex items-center gap-2 text-sm font-semibold text-good">
            <Icon name="calendar" size={15} /> {meeting}
          </p>
          <p className="mt-1 text-xs text-muted">
            {booking?.via === "cal.com"
              ? `On the calendar${booking.emailedTo ? ` · invite sent to ${booking.emailedTo}` : ""}`
              : `Logged only${booking?.note ? ` — ${booking.note}` : ""}`}
          </p>
        </div>
      )}
      {result.follow_up_email && (
        <div
          className={`rounded-xl p-3 ring-1 ${
            result.follow_up_email.sent ? "bg-speak/10 ring-speak/25" : "bg-warn/10 ring-warn/25"
          }`}
        >
          <p className={`flex items-center gap-2 text-sm font-semibold ${result.follow_up_email.sent ? "text-speak" : "text-warn"}`}>
            <Icon name="mail" size={15} />
            {result.follow_up_email.sent ? "Calendar link emailed" : "Calendar link NOT sent"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {result.follow_up_email.sent
              ? `Sent to ${result.follow_up_email.to}`
              : result.follow_up_email.note || "Send the booking link to them by hand."}
          </p>
        </div>
      )}
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        {lines.length === 0 && <p className="text-xs text-muted">No transcript saved for this call.</p>}
        {lines.map((line, i) => {
          const isAgent = /^agent:/i.test(line);
          const text = line.replace(/^(agent|prospect):\s*/i, "");
          return (
            <div key={i} className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
              <span
                className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  isAgent ? "rounded-bl-md bg-white/[0.06]" : "rounded-br-md bg-brand/20 ring-1 ring-brand/25"
                }`}
              >
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
