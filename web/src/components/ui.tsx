import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons — tiny inline set (stroke icons, 24px grid) so there are no deps.    */
/* -------------------------------------------------------------------------- */

const PATHS: Record<string, ReactNode> = {
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  phoneOff: (
    <>
      <path d="M10.7 13.3a16 16 0 0 0 2.6 2l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1" />
      <path d="M6.4 6.4A19.5 19.5 0 0 0 2.1 4.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" />
    </>
  ),
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 10h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 3.8M12 17.4v.1" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2.5v5h5M9 13h6M9 17h6" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5L16 16" />
    </>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  speaker: (
    <>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  shield: <path d="M12 2.5l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6z" />,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl ${className}`}>{children}</section>;
}

export function SectionTitle({ n, title, hint }: { n?: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {n !== undefined && (
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-speak text-[11px] font-bold text-bg">
          {n}
        </span>
      )}
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-muted">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value, icon, tone = "brand" }: { label: string; value: number | string; icon: IconName; tone?: "brand" | "good" | "speak" | "warn" | "danger" }) {
  const tones: Record<string, string> = {
    brand: "from-brand/25 to-brand/0 text-brand",
    good: "from-good/25 to-good/0 text-good",
    speak: "from-speak/25 to-speak/0 text-speak",
    warn: "from-warn/25 to-warn/0 text-warn",
    danger: "from-danger/25 to-danger/0 text-danger",
  };
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-4">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl ${tones[tone]}`} />
      <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ${tones[tone]!.split(" ").pop()}`}>
        <Icon name={icon} size={16} />
      </span>
      <strong className="block font-display text-3xl font-semibold tracking-tight text-ink">{value}</strong>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function initials(name: string) {
  return (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, size = 40, className = "" }: { name: string; size?: number; className?: string }) {
  const gradient = AVATAR_GRADIENTS[hash(name) % AVATAR_GRADIENTS.length];
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`flex flex-none items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-lg shadow-black/30 ${gradient} ${className}`}
    >
      {initials(name) || "?"}
    </span>
  );
}

const DISPOSITION_TONE: Record<string, string> = {
  "Meeting Booked": "bg-good/15 text-good ring-good/30",
  "Interested-Follow-up": "bg-speak/15 text-speak ring-speak/30",
  "Call Back Requested": "bg-warn/15 text-warn ring-warn/30",
  "Not Interested": "bg-danger/15 text-danger ring-danger/30",
  "Do-Not-Call Requested": "bg-danger/15 text-danger ring-danger/30",
  Voicemail: "bg-white/8 text-muted ring-white/15",
  "No Answer": "bg-white/8 text-muted ring-white/15",
  "Wrong Number": "bg-white/8 text-muted ring-white/15",
  "Gatekeeper-Blocked": "bg-white/8 text-muted ring-white/15",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "brand" | "good" | "speak" | "warn" | "danger"; className?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-white/8 text-muted ring-white/10",
    brand: "bg-brand/15 text-brand ring-brand/30",
    good: "bg-good/15 text-good ring-good/30",
    speak: "bg-speak/15 text-speak ring-speak/30",
    warn: "bg-warn/15 text-warn ring-warn/30",
    danger: "bg-danger/15 text-danger ring-danger/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function DispositionBadge({ value }: { value: string }) {
  const tone = DISPOSITION_TONE[value] ?? "bg-white/8 text-muted ring-white/15";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}>{value}</span>
  );
}

export function ScoreMeter({ score }: { score: number | string }) {
  const n = Math.max(0, Math.min(5, Number(score) || 0));
  return (
    <span className="inline-flex items-center gap-1" title={`Lead score ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-5 rounded-full ${i <= n ? "bg-gradient-to-r from-brand to-speak" : "bg-white/10"}`} />
      ))}
      <span className="ml-1 text-xs font-medium text-muted">{n}/5</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}
