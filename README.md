# Lipi.ai Call Agent

Outbound sales voice agent. It calls a lead, runs a scripted conversation, answers questions from a PDF knowledge base, and books a meeting on Cal.com. Calls run in the browser (mic + speakers) for development; real phone calls go through Vapi.

**Stack:** Node.js, TypeScript, Express 5 · React, Tailwind, Vite · Groq (intent) · Gemini embeddings (RAG) · Sarvam / Edge TTS · Cal.com · Gmail SMTP · Vitest

## Requirements

- Node.js 22+
- Chrome or Edge for live speech recognition (other browsers fall back to record-and-transcribe via Groq Whisper)
- API keys — only `GROQ_API_KEY` is needed to start; see [Configuration](#configuration)

## Getting started

```bash
npm install
npm run web:install
cp .env.example .env        # fill in the keys you have
npm run web:build           # builds the dashboard into web/dist
npm run ingest              # builds the PDF search index (needs GEMINI_API_KEY)
npm run dev                 # http://localhost:<PORT> (default 3001)
```

Open the dashboard, choose an agent and a lead, click **Start call**, and allow the microphone.

For dashboard development run `npm run web:dev` alongside the backend; it proxies API calls to the port in `.env`.

## Architecture

One caller utterance goes through `conversation/turn.ts`:

```
speech (browser STT) ─► text
  1. signals.ts      voicemail / IVR, annoyed, in a hurry, "who is this?", wants a link
  2. intent          Groq classifies the intent (keyword fallback in intent.ts)
  3. router.ts       is it a question? ─► RAG over the PDF ─► grounded answer
  4. stateMachine.ts otherwise ─► next scripted line
  5. TTS             Sarvam (Hinglish / Indian English) or Edge ─► audio
```

Design rules:

- **Every spoken line comes from [`content/call-script.yaml`](content/call-script.yaml).** The LLM only classifies what the caller meant and lightly rephrases script lines. It does not write new content.
- **Questions are answered only from the knowledge PDF.** If retrieval scores are too low, the agent says it has no information and steers back to the demo.
- **Call flow:** `OPENING → CONTEXT_BRIDGE → PITCH → CLOSE → WRAP_UP`. In `CLOSE` the agent asks for the caller's own day and time, checks it against Cal.com, and otherwise offers 2–3 free slots. After the booking, Cal.com emails the invite.
- **Provider fallbacks:** TTS falls back Sarvam → Edge → Windows voice; intent falls back Groq → keywords. A missing key disables a feature but never blocks the call.

## Project structure

```
.
├─ content/                  Agent content — editable without touching code
│  ├─ call-script.yaml         every spoken line (validated at startup)
│  └─ knowledge/               PDF used as the RAG source
│
├─ src/                      Backend
│  ├─ server.ts                entry point: mounts routes, serves web/dist
│  ├─ cli.ts                   CLI: simulate a call, dial a lead, ingest the PDF
│  ├─ config.ts                reads .env once; all settings live here
│  ├─ types.ts                 shared types and zod schemas (Lead, CallResult, Session)
│  │
│  ├─ routes/                  HTTP API
│  │   ├─ simulate.ts            browser call: start / reply / nudge / hangup, call finalisation
│  │   ├─ voice.ts               agents, TTS, STT, backchannel clips
│  │   ├─ dashboard.ts           leads, calls, bookings, questions, script, overview stats
│  │   ├─ phone.ts               Vapi dial + webhook
│  │   └─ health.ts              configuration / provider status
│  │
│  ├─ conversation/            Call logic
│  │   ├─ turn.ts                handles one utterance end to end
│  │   ├─ stateMachine.ts        call states, the close (times, booking), objections
│  │   ├─ signals.ts             tone and channel detection
│  │   ├─ intent.ts              keyword intent fallback
│  │   └─ router.ts              question vs. non-question routing
│  │
│  ├─ script/                  Turns the YAML into spoken lines
│  │   ├─ scriptFile.ts          load + schema validation
│  │   ├─ lines.ts               one function per line
│  │   ├─ objections.ts          objection rebuttals
│  │   └─ prompt.ts              system prompt for Vapi calls
│  │
│  ├─ rag/                     PDF → chunks → embeddings → local index → grounded answer
│  ├─ llm/groq.ts              Groq client (intent, rephrasing, steering)
│  ├─ voice/                   tts.ts · stt.ts · agents.ts · routing.ts
│  ├─ booking/                 calendar.ts (Cal.com) · offer.ts (free slots) · slotTime.ts (spoken time → IST datetime)
│  ├─ mail/mailer.ts           Gmail SMTP: calendar-link email
│  ├─ phone/                   dialer.ts · vapi.ts
│  ├─ scoring/scorer.ts        call outcome: Meeting Booked / Follow-up / Not Interested …
│  └─ storage/                 leads.ts (CSV) · calls.ts (JSON) · dnc.ts (do-not-call list)
│
├─ web/                      Dashboard (React + TypeScript + Tailwind, Vite → web/dist)
│  └─ src/
│      ├─ App.tsx              layout and routing between pages
│      ├─ components/          LiveCall, Overview, Conversations, Leads, Bookings, Questions, ScriptView, ui
│      └─ lib/                 voice.js (mic, recognition, playback) · types.ts
│
├─ data/                     Runtime data
│  ├─ leads.example.csv        sample leads (copied to leads.csv on first run)
│  ├─ dnc.csv                  do-not-call numbers
│  └─ calls.json, rag-index.json   generated, git-ignored
│
├─ scripts/                  Developer tools: build-knowledge-pdf.ts · mail-test.ts · voices.ts
├─ tests/                    Vitest; mirrors src/ (conversation · script · booking · rag · llm · web)
└─ .github/workflows/ci.yml  typecheck + tests + dashboard build
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Backend with auto-reload |
| `npm start` | Backend without reload |
| `npm run web:dev` | Dashboard dev server (hot reload) |
| `npm run web:build` | Production dashboard build into `web/dist` |
| `npm run ingest` | Build the PDF search index |
| `npm run kb:build` | Regenerate the knowledge PDF from `scripts/build-knowledge-pdf.ts` |
| `npm run mail:test` | Send a test email to verify Gmail credentials |
| `npm run voices` | List available Edge TTS voices |
| `npm run sim` / `npm run dial` | Simulate a call in the terminal / place a Vapi call |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest |
| `npm run verify` | typecheck + tests + dashboard build (what CI runs) |

## Configuration

Copy `.env.example` to `.env`. `.env` is git-ignored — never commit it.

| Feature | Variables |
|---|---|
| Server | `PORT`, `COMPANY_NAME`, `FOUNDER_NAME` |
| Intent classification | `GROQ_API_KEY`, `GROQ_MODEL` |
| PDF answers (RAG) | `GEMINI_API_KEY` |
| Hinglish / Indian English voice | `SARVAM_API_KEY`, `SARVAM_TTS_MODEL`, `SARVAM_SPEAKER_HINGLISH`, `SARVAM_SPEAKER_EN_IN` (without a key, Edge voices are used) |
| Calendar booking | `CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_BOOKING_URL` |
| Calendar-link email | `MAIL_USER`, `MAIL_APP_PASSWORD` (Gmail app password), `MAIL_FROM_NAME` |
| Real phone calls | `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `PUBLIC_BASE_URL` |
| Content paths | `SCRIPT_PATH`, `RAG_PDF_PATH` (defaults point into `content/`) |

## Common tasks

**Change what the agent says.** Edit `content/call-script.yaml` and restart. A missing or misspelled field fails at startup, not mid-call. New placeholders must be registered in `src/script/scriptFile.ts`.

**Change what the agent knows.** Edit the Q&A in `scripts/build-knowledge-pdf.ts`, then `npm run kb:build && npm run ingest`. Or drop your own PDF in `content/knowledge/`, point `RAG_PDF_PATH` at it, and run `npm run ingest`.

**Add leads.** Add rows to `data/leads.csv` (columns as in `data/leads.example.csv`, including `email`). The `.example` demo addresses cannot receive mail — use a real address to receive the invite.

**Change the voice.** Set the `SARVAM_*` or `TTS_*` variables in `.env` and restart.

**Add a conversation rule.** Put the logic in `src/conversation/`, the spoken text in `content/call-script.yaml` with a matching accessor in `src/script/lines.ts`, and a test in `tests/conversation/`.

## Testing

`npm test` runs Vitest. Tests mirror `src/`. Web-side listener logic (`web/src/lib/voice.js`) is tested under `tests/web/` with jsdom. A few booking tests call the real Cal.com availability API when keys are set and have extended timeouts.

CI (`.github/workflows/ci.yml`) runs typecheck, tests and the dashboard build on every push.

## Notes

- **Call history** is stored as text in `data/calls.json` (transcript, outcome, booking, follow-up email). Audio is not recorded.
- **Voice routing:** `hi-IN-hinglish` and `en-IN` use Sarvam when a key is set; `en-US` always uses Edge.
- **Booking:** calendar writes are skipped for `.example` email addresses; the call is still scored.
