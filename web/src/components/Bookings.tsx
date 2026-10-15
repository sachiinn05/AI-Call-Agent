import { useEffect, useState } from "react";
import type { Booking } from "../lib/types";
import { Avatar, Badge, Card, EmptyState, Icon } from "./ui";

export default function Bookings() {
  const [rows, setRows] = useState<Booking[]>([]);

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState icon="calendar" title="No bookings yet" hint="When a caller picks a time, the meeting shows up here." />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((b, i) => {
        const when = [b.meeting?.date, b.meeting?.time].filter(Boolean);
        const slot = when[0] === when[1] ? when[0] : when.join(" ");
        const real = b.meeting?.booking?.via === "cal.com";
        return (
          <Card key={i} className="fade-up p-5">
            <div className="flex items-center gap-3">
              <Avatar name={b.contactName} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{b.contactName}</p>
                <p className="truncate text-xs text-muted">{b.companyName}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm">
              <Icon name="clock" size={16} className="text-brand" />
              <span className="font-medium">{slot || "Time to be confirmed"}</span>
            </div>
            <div className="mt-3">
              {real ? (
                <div className="flex flex-col gap-1.5">
                  <Badge tone="good" className="w-fit">
                    <Icon name="check" size={12} /> On the calendar
                  </Badge>
                  {b.meeting?.booking?.emailedTo && (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Icon name="mail" size={13} /> Invite + reminder sent to {b.meeting.booking.emailedTo}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Badge tone="warn" className="w-fit">
                    Logged only
                  </Badge>
                  {b.meeting?.booking?.note && <p className="text-xs text-muted">{b.meeting.booking.note}</p>}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
