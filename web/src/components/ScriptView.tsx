import { useEffect, useState } from "react";
import type { ScriptView as ScriptViewData } from "../lib/types";
import { Badge, Card, Icon } from "./ui";

function isLine(value: unknown): value is { en: string; hi: string } {
  const v = value as { en?: unknown; hi?: unknown } | null;
  // A spoken line has BOTH languages as plain strings. (A topic also has en/hi keys, but those hold objects.)
  return Boolean(v && typeof v === "object" && typeof v.en === "string" && typeof v.hi === "string");
}

function ScriptNode({ obj, depth = 0 }: { obj: Record<string, unknown>; depth?: number }) {
  return (
    <>
      {Object.entries(obj).map(([key, value]) => {
        if (isLine(value)) {
          return (
            <div key={key} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
              <p className="mb-1.5 font-mono text-[11px] text-brand">{key}</p>
              <p className="text-[13px] leading-relaxed">
                <Badge className="mr-2 align-middle">EN</Badge>
                {value.en}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed">
                <Badge tone="brand" className="mr-2 align-middle">HI</Badge>
                {value.hi}
              </p>
            </div>
          );
        }
        if (Array.isArray(value)) {
          return (
            <div key={key} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
              <p className="mb-1 font-mono text-[11px] text-brand">{key}</p>
              <p className="text-xs text-muted">
                {value.map((v) => (typeof v === "string" ? v : (v as { id?: string }).id || JSON.stringify(v))).join(" · ")}
              </p>
            </div>
          );
        }
        if (value && typeof value === "object") {
          return (
            <div key={key} className={depth === 0 ? "mt-2" : ""}>
              <h3 className={`mb-2 mt-3 text-xs font-semibold uppercase tracking-[0.12em] ${depth === 0 ? "gradient-text text-sm" : "text-muted"}`}>
                {key.replace(/_/g, " ")}
              </h3>
              <div className="flex flex-col gap-2 border-l border-white/10 pl-4">
                <ScriptNode obj={value as Record<string, unknown>} depth={depth + 1} />
              </div>
            </div>
          );
        }
        return (
          <div key={key} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
            <p className="font-mono text-[11px] text-brand">{key}</p>
            <p className="text-xs text-muted">{String(value)}</p>
          </div>
        );
      })}
    </>
  );
}

export default function ScriptView() {
  const [data, setData] = useState<ScriptViewData | null>(null);

  useEffect(() => {
    fetch("/api/script")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return null;
  const { faq: _faq, ...rest } = data.script as Record<string, unknown>;
  const rag = data.rag;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="p-5">
        <p className="mb-4 text-xs text-muted">
          Read from <code className="rounded bg-white/5 px-1.5 py-0.5 text-ink">{data.path}</code>. Edit the file and restart to change the call.
        </p>
        <ScriptNode obj={rest} />
      </Card>

      <div className="xl:sticky xl:top-8 xl:self-start">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Icon name="book" size={16} />
            </span>
            <h2 className="text-[15px] font-semibold">Knowledge base</h2>
          </div>
          {rag ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium">{rag.source}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="good">{rag.chunks} chunks</Badge>
                <Badge>{rag.model}</Badge>
              </div>
              <p className="text-xs text-muted">Indexed {rag.createdAt}</p>
            </div>
          ) : (
            <p className="text-xs text-muted">
              No index yet — run <code className="text-ink">npm run ingest</code> after setting GEMINI_API_KEY.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
