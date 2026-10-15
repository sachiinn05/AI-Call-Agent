# Lipi.ai — AI sales voice agent

A voice agent that **calls a lead, holds a real conversation, answers their questions from a PDF, and books a meeting** on your calendar. Press *Start call* in the dashboard, talk to it in the browser, and watch the booking land in Cal.com — no phone number needed for the demo (real phone calls go through Vapi).

## Quick start

```bash
npm install            # backend
npm run web:install    # dashboard (React) — one time
cp .env.example .env   # then fill in the keys you have (see "Configuration")
npm run web:build      # build the dashboard into web/dist
npm run dev            # http://localhost:<PORT from .env>
```

Open the page, pick an **agent**, pick a **lead**, click **Start call**, allow the mic and talk. It runs with just a Groq key; every other key unlocks one more feature (see the table below).

## How a call works

```
 caller's voice ─► browser speech recognition ─► text
                                                   │
                                  ┌────────────────▼─────────────────┐
                                  │ conversation/turn.ts             │
                                  │  1. tone/channel cues  (voicemail, annoyed, hurry, "who is this?")
                                  │  2. intent             (Groq, keyword fallback)
                                  │  3. a question?  ──► RAG over the PDF ──► grounded answer
                                  │  4. otherwise    ──► call state machine ──► next scripted line
                                  └────────────────┬─────────────────┘
                                                   │ line from content/call-script.yaml
 caller hears ◄── text-to-speech (Sarvam / Edge) ◄─┘
```

The agent **never invents what it says**: every opening, pitch, objection answer and close is a line in [`content/call-script.yaml`](content/call-script.yaml); Groq only works out *what the caller meant* (and lightly rephrases script lines). Questions are answered strictly from the knowledge PDF — when it isn't there, the agent says so and points to the demo instead of guessing.

The call moves through five beats — **opening → discovery → pitch → close → wrap-up**. In the close it asks for the caller's own day and time first; if they don't give one it offers 2–3 times that are free on your Cal.com calendar, then books it and Cal.com emails the invite.

## Project structure

```
.
├─ content/                  What the agent SAYS and KNOWS — edit these, no code needed
│  ├─ call-script.yaml         every spoken line: opening, pitch, objections, close, exits
│  └─ knowledge/               the PDF the agent answers questions from (RAG source)
│
├─ src/                      The backend (TypeScript, Express)
│  ├─ server.ts                entry point: mounts the routes, serves the dashboard
│  ├─ cli.ts                   command line: simulate a call, dial a lead, build the PDF index
│  ├─ config.ts                reads .env once; every setting lives here
│  ├─ types.ts                 shared types + validation (Lead, CallResult, Session, …)
│  │
│  ├─ routes/                  HTTP API, one file per area
│  │   ├─ simulate.ts            the browser call (start / reply / nudge / hangup)
│  │   ├─ voice.ts               agents, text-to-speech, speech-to-text, backchannels
│  │   ├─ dashboard.ts           leads, calls, bookings, questions, script, overview numbers
│  │   ├─ phone.ts               real calls via Vapi (dial + webhook)
│  │   └─ health.ts              what is configured / which providers are active
│  │
│  ├─ conversation/            The call brain
│  │   ├─ turn.ts                handles one caller utterance end to end
│  │   ├─ stateMachine.ts        the five beats, the close (times, booking), objections
│  │   ├─ signals.ts             voicemail · annoyed · in a hurry · confused · "who is this?" · wants a link
│  │   ├─ intent.ts              keyword intent detection (fallback when Groq is off)
│  │   └─ router.ts              is this a question for the knowledge base?
│  │
│  ├─ script/                  Turns call-script.yaml into spoken lines
│  │   ├─ scriptFile.ts          loads + validates the YAML
│  │   ├─ lines.ts               one function per line (opening, close, ask_time, …)
│  │   ├─ objections.ts          the objection rebuttals
│  │   └─ prompt.ts              system prompt for real phone calls (Vapi)
│  │
│  ├─ rag/                     Answers from the PDF: extract → chunk → embed → search → grounded answer
│  ├─ llm/groq.ts              Groq client: intent, natural rephrasing, steering
│  ├─ voice/                   tts.ts (Sarvam / Edge) · stt.ts (Whisper fallback) · agents · voice routing
│  ├─ booking/                 calendar.ts (Cal.com) · offer.ts (free slots) · slotTime.ts ("Friday 5 baje" → a real time)
│  ├─ mail/mailer.ts           Gmail: sends the calendar-link email
│  ├─ phone/                   dialer.ts + vapi.ts: real outbound phone calls
│  ├─ scoring/scorer.ts        outcome of a call: Meeting Booked / Follow-up / Not Interested / …
│  └─ storage/                 leads.ts (CSV) · calls.ts (call history JSON) · dnc.ts (do-not-call list)
│
├─ web/                      The dashboard (React + TypeScript + Tailwind, built with Vite → web/dist)
│  └─ src/
│      ├─ App.tsx              layout: sidebar + pages
│      ├─ components/          LiveCall (the call screen), Overview, Conversations, Leads, Bookings, Questions, ScriptView, ui
│      └─ lib/                 voice.js (mic, speech recognition, playback) · types.ts
│
├─ data/                     Runtime data
│  ├─ leads.example.csv        sample leads (copied to leads.csv on first run)
│  ├─ dnc.csv                  do-not-call numbers
│  └─ calls.json · rag-index.json   generated — call history and the PDF index (git-ignored)
│
├─ scripts/                  Developer tools:  build-knowledge-pdf.ts · mail-test.ts · voices.ts
├─ tests/                    Vitest, mirrors src/:  conversation/ · script/ · booking/ · rag/ · llm/ · web/
└─ .github/workflows/ci.yml  typecheck + tests + dashboard build on every push
```

## Common tasks

| I want to… | Do this |
|---|---|
| Change what the agent says | Edit [`content/call-script.yaml`](content/call-script.yaml), restart the server. A typo fails loudly at startup. |
| Change what it knows | Edit the Q&A in [`scripts/build-knowledge-pdf.ts`](scripts/build-knowledge-pdf.ts) → `npm run kb:build` → `npm run ingest`. (Or drop your own PDF in `content/knowledge/` and run `npm run ingest`.) |
| Add leads | Add rows to `data/leads.csv` (columns as in `data/leads.example.csv`, including `email`). |
| Change the agents' voices | `.env` (`SARVAM_*`, `TTS_*`); list free voices with `npm run voices`. |
| Edit the dashboard | Work in `web/src`, run `npm run web:dev` (hot reload) — `npm run web:build` for the served version. |
| Check everything | `npm run verify` (typecheck + tests + dashboard build). |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Backend with auto-reload |
| `npm start` | Backend, no reload |
| `npm run web:dev` / `web:build` | Dashboard dev server / production build |
| `npm run ingest` | Build the PDF search index (needs `GEMINI_API_KEY`) |
| `npm run kb:build` | Rebuild the knowledge PDF from `scripts/build-knowledge-pdf.ts` |
| `npm run mail:test` | Send yourself a test email to check Gmail is working |
| `npm run sim` / `npm run dial` | Simulate a call in the terminal / place a real call via Vapi |
| `npm run verify` · `typecheck` · `test` | Quality checks |

## Configuration (`.env`)

Copy `.env.example` and fill what you have. Only `GROQ_API_KEY` is needed to start; the rest switch features on:

| Feature | Variables |
|---|---|
| Server | `PORT`, `COMPANY_NAME`, `FOUNDER_NAME` |
| Understanding the caller | `GROQ_API_KEY` (free tier) |
| Answers from the PDF | `GEMINI_API_KEY` (free tier) |
| Natural Hindi / Indian-English voice | `SARVAM_API_KEY` (otherwise free Microsoft Edge voices are used) |
| Real meetings on your calendar | `CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, `CAL_BOOKING_URL` |
| Calendar-link email | `MAIL_USER`, `MAIL_APP_PASSWORD` (a Gmail app password) |
| Real phone calls | `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `PUBLIC_BASE_URL` |

Never commit `.env` — it is git-ignored.

## Good to know

- **Call history** is saved as text in `data/calls.json` (transcript, outcome, booking, follow-up). No audio is recorded.
- **Browser support:** Chrome and Edge give the best live recognition; other browsers fall back to record-then-transcribe (Groq Whisper).
- **Demo leads** use `.example` email addresses, which can't receive mail — type your own address in the *Invite email* box before a call to receive the real calendar invite.

## The pitch

> I built a voice agent that holds a real phone-style conversation and books a meeting — not a chatbot you type into. A state machine keeps the spoken lines locked to a script; Groq only works out what the caller meant; questions are answered from a PDF with retrieval so it never invents facts; and it books the real slot on Cal.com.

`Built a voice AI agent that runs a live outbound conversation (speech in/out), handles objections, answers questions from a knowledge base with RAG, and books meetings on a real calendar; Groq + a call state machine, TypeScript/Express/React.`
