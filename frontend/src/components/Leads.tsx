import { useEffect, useMemo, useState } from "react";
import type { Lead } from "../lib/types";
import { Avatar, Badge, Card, EmptyState, Icon } from "./ui";

const LANG: Record<string, string> = { "en-US": "US English", "en-IN": "Indian English", "hi-IN-hinglish": "Hinglish" };

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then(setLeads);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => !q || `${l.contact_name} ${l.company_name} ${l.industry} ${l.email ?? ""}`.toLowerCase().includes(q));
  }, [leads, query]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{shown.length}</span> of {leads.length} leads
        </p>
        <div className="relative w-full sm:w-72">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name, company, industry…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="users" title="No leads match" hint="Try a different search." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2 font-semibold">Lead</th>
                <th className="px-3 py-2 font-semibold">Company</th>
                <th className="px-3 py-2 font-semibold">Language</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Need</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((lead) => (
                <tr key={lead.contact_number} className="border-t border-white/[0.06] transition hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={lead.contact_name} size={34} />
                      <div>
                        <p className="font-medium">{lead.contact_name}</p>
                        <p className="text-xs text-muted">{lead.contact_role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p>{lead.company_name}</p>
                    <p className="text-xs text-muted">{lead.industry}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone="brand">{LANG[lead.preferred_language] ?? lead.preferred_language}</Badge>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted">{lead.email || "—"}</td>
                  <td className="max-w-[260px] px-3 py-3 text-xs text-muted">{lead.need_for_bot || lead.company_description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
