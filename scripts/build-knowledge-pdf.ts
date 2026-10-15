/**
 * Rebuilds content/knowledge/lipi-ai-knowledge-base.pdf — the document the agent's RAG
 * answers come from — using the company and founder names from .env, so the PDF
 * can never disagree with what the agent says in its opening line.
 *
 *   npm run kb:build     (then)     npm run ingest
 *
 * Rendering uses Edge/Chrome in headless mode, so no extra dependency. Edit the
 * SECTIONS below to change what the agent knows. Rules this content follows:
 *  - Every fact is one the product/script already states. Anything not known is
 *    written as "Sachin covers that in the demo" so the agent pivots instead of guessing.
 *  - Answers are short and spoken: 1-2 sentences, no lists, no jargon.
 *  - Questions include the way callers actually phrase them, in Hinglish too.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";

const company = config.companyName;
const founder = config.founderName;

type QA = [string, string];
type Section = { title: string; intro?: string; qa: QA[] };

const SECTIONS: Section[] = [
  {
    title: "1. Company & founder",
    intro: `${company} is an AI voice agent company, founded and run by ${founder}. ${founder} personally runs every product demo and walks new customers through pricing, data handling, and setup before anything is signed. ${company} is based in India and works with businesses across the country, handling calls in Hindi, Hinglish, Indian English, and US English.`,
    qa: [
      [`What is the name of your company? / Aapki company ka naam kya hai?`, `The company is called ${company}.`],
      [`Who is the founder? / Who is ${founder}? / ${founder} kaun hai?`, `${founder} founded and runs ${company}, and personally runs every demo for new customers.`],
      [`Who am I speaking with? / Aap kaun bol rahe hain?`, `This is ${company}'s AI voice assistant, calling on behalf of ${founder}, who runs the company.`],
      [`Where are you based? / Company kahan hai? / Aap kahan se ho?`, `We're based in India and work with businesses across the country.`],
      [`How big is the company? / Team kitni badi hai?`, `I don't have the team size to hand, and I won't guess — ${founder} can tell you more in the demo.`],
    ],
  },
  {
    title: "2. What the product is",
    intro: `${company} is an AI voice agent that answers a business's phone when nobody else can: nights, weekends, lunch hours, or whenever the line is busy. It talks to the caller in a real conversation, handles the routine requests itself, and hands anything it cannot resolve to the business's own team, with a summary of the call attached.`,
    qa: [
      [`What do you do? / Company kya karti hai? / What is this about?`, `We build an AI voice agent that picks up the calls your team is missing, handles the routine ones, and passes the rest to you with a summary.`],
      [`Tell me about your product. / Product kya hai?`, `It's an AI voice agent for your business phone line — it answers calls, handles common questions, books appointments or takes orders, and hands over anything it can't resolve.`],
      [`How does it work? / Ye kaise kaam karta hai?`, `Your calls are forwarded to the agent when you're closed or busy; it talks to the caller, handles the routine requests, and passes the rest to your team with a summary.`],
      [`Who is it for? / Kis ke liye hai?`, `Businesses that lose calls they can't staff around the clock — hospitals and clinics, grocery and pharmacy delivery, dental clinics and salons, gyms, auto shops, law firms, real estate and insurance offices.`],
    ],
  },
  {
    title: "3. What the agent can do on a call",
    intro: `On a single phone call the agent can answer inbound calls around the clock, after hours, or as overflow when the line is busy, configured per business. It greets the caller by the business's name, understands what they need, answers common questions about the business from the information it is given, and books appointments, takes order details, or captures a callback time, then confirms by SMS or WhatsApp. It recognises urgent or emergency-sounding calls, tells the caller what to do immediately, and alerts the on-duty person at the same time. It takes a message when a request is outside what it can handle, or transfers live to a person if that is set up. After every call it sends the team a written summary.`,
    qa: [
      [`What services do you provide? / Kya kya karta hai?`, `It answers calls, handles common questions, books appointments or takes orders, recognises emergencies, and escalates anything it can't resolve — with a summary sent after every call.`],
      [`Can it book appointments or take orders? / Appointment book kar sakta hai?`, `Yes — it books appointments, takes order details, or captures a callback time, and confirms by SMS or WhatsApp.`],
      [`What if it can't answer something? / Agar jawab na pata ho toh?`, `It takes a message and flags your team right away, or transfers the call live to a person if that's set up. It never guesses on medical or account-specific questions.`],
      [`What about emergencies? / Emergency calls ka kya?`, `Emergencies are the priority case: the agent recognises when something's serious, tells the caller what to do immediately, and alerts your on-duty person at the same time.`],
      [`Do you send WhatsApp or SMS? / WhatsApp pe confirmation aata hai?`, `Yes — bookings and confirmations go out by SMS or WhatsApp.`],
      [`Do I get a record of the calls? / Call ka summary milta hai?`, `Yes — your team gets a written summary right after every call.`],
    ],
  },
  {
    title: "4. Pricing & contract",
    intro: `Pricing is based on call volume rather than a single flat number, because a business handling a few dozen calls a month has very different needs from one handling thousands. ${founder} shows exact pricing in the live demo once he knows roughly how many relevant calls the business receives. Pricing is deliberately never quoted cold over the phone. There is no lock-in contract: billing is month to month and a customer can stop at any time. Exact contract terms are confirmed during the demo.`,
    qa: [
      [`How much does it cost? / Price kya hai? / Kitna kharcha aayega?`, `Pricing depends on your call volume, so there isn't one fixed number — ${founder} shows the exact pricing in the demo once we know roughly how many calls you get.`],
      [`What are your plans? / Plans kya hain?`, `Plans scale with call volume rather than being one-size-fits-all; the demo walks through the pricing that fits your actual volume.`],
      [`Is there a contract or lock-in? / Contract hai?`, `No lock-in — billing is month to month and you can stop whenever you like. Exact terms are confirmed in the demo.`],
      [`Can we cancel anytime? / Kabhi bhi band kar sakte hain?`, `Yes, it's month to month with no lock-in contract.`],
      [`Is there a setup fee or discount? / Setup charge ya discount?`, `I don't have that detail, and I won't guess — ${founder} goes through every number in the demo.`],
    ],
  },
  {
    title: "5. Setup & integration",
    intro: `The business keeps its existing phone number, so nothing changes on the customer-facing side. Calls are forwarded to the agent when the business is closed, busy, or otherwise unable to pick up. There is no new hardware to install and no app for staff to learn; the team keeps using the phones they already have. Setup usually takes a few days: the team's details and the answers the agent should give are loaded in, it is tested on the business's own line, and then it goes live.`,
    qa: [
      [`Does it work with our existing number? / Number badalna padega?`, `Yes — your number stays exactly the same. Calls forward to the agent when you're closed or busy.`],
      [`Do we need new hardware or an app? / Koi hardware ya app?`, `No — no new number, hardware or app. Your team keeps using the phones they already have.`],
      [`How long does setup take? / Setup mein kitna time lagta hai?`, `Usually a few days — we load your details and the answers you want it to give, test it on your line, and go live.`],
      [`Is it only after hours or all the time? / Sirf raat ko ya hamesha?`, `Whatever you want — most start with after-hours and overflow coverage, and some run it around the clock as the first voice on the line.`],
      [`Does it integrate with our software or CRM? / Integration hota hai?`, `I don't have the full list of integrations to hand, and I won't guess — ${founder} covers what connects to your setup in the demo.`],
    ],
  },
  {
    title: "6. Privacy, security & infrastructure",
    intro: `Call recordings and call details stay private to the customer's own account and are never used to train any model. Exactly what is stored, and for how long, is covered in detail during the demo, since retention needs vary by industry, for example healthcare versus retail.`,
    qa: [
      [`Is our data safe? / Security kaisi hai? / Data secure hai?`, `Your call recordings and details stay private to your own account and are never used to train any model. ${founder} walks through exactly what's stored, and for how long, in the demo.`],
      [`Where is data stored? / Data kahan store hota hai?`, `It stays private to your own account. The exact storage and retention details are covered in the demo, since they vary by industry.`],
      [`Where are your servers hosted? / Servers kahan hain? / Cloud kaun sa hai?`, `I don't have the hosting details to hand, and I won't guess — ${founder} covers exactly where and how it runs in the demo.`],
      [`Who can see the recordings? / Recordings kaun dekh sakta hai?`, `Only your own account — they're private to you.`],
      [`What is your infrastructure / hosting / tech stack? / Infrastructure kya hai?`, `I don't have the technical infrastructure details, and I won't guess — that's exactly what ${founder} goes through in the demo.`],
      [`Do you have security certifications? / Certification hai?`, `I don't have that to hand, and I won't guess — ${founder} can answer it properly in the demo.`],
    ],
  },
  {
    title: "7. Languages & how it sounds",
    intro: `The agent speaks Hindi, Hinglish, Indian English, or US English, chosen per phone line. It is built to hold a real back-and-forth conversation rather than play back fixed lines, and it tells callers up front that they are speaking with an AI assistant. In practice, most callers are simply relieved someone answered the phone at all.`,
    qa: [
      [`Do you support Hindi? / Hindi support karte ho? / Hindi mein baat kar sakta hai?`, `Yes — it handles Hindi, Hinglish, Indian English and US English, chosen per phone line.`],
      [`Does it sound like a robot? / Robot jaisa lagta hai?`, `You're hearing it right now — judge for yourself. It's built to hold a real conversation, and it tells callers up front that it's an AI assistant.`],
      [`Will callers know it's AI? / Kya callers ko pata chalega?`, `Yes, it tells them up front. Most people are just relieved someone picked up.`],
    ],
  },
  {
    title: "8. The demo & trying it first",
    intro: `The demo is a short 15-minute session run by ${founder} against the prospect's real scenario, not a generic script. If it makes sense, the agent can be set up on a single phone line first, so the business can hear real calls handled before committing to a wider rollout.`,
    qa: [
      [`What happens in the demo? / Demo mein kya hota hai?`, `${founder} runs it live for about 15 minutes on your real scenario, and shows exact pricing, data handling and setup.`],
      [`Can we try it before committing? / Trial hai?`, `Yes — the demo runs on your real scenario, and if it makes sense we can set it up on a single line first so you hear real calls before committing.`],
      [`How long is the demo? / Demo kitne time ka hai?`, `About 15 minutes.`],
      [`What is the demo of? / Demo kis cheez ka hai? / Kya dikhayenge?`, `It's a live demo of the AI voice agent handling a call from your own business scenario, and ${founder} also shows exact pricing, data handling and setup.`],
      [`Who runs the demo? / Demo kaun dega?`, `${founder} runs every demo personally.`],
    ],
  },
  {
    title: "9. Industries & the missed-call problem",
    intro: `The pitch is tailored to the kind of call a business is missing. Hospitals and clinics miss after-hours patient calls, and one missed call can be a patient needing urgent help who gets a dead line. Grocery and pharmacy delivery businesses are flooded with "where is my order" calls, and a missed one can be a frustrated customer who never orders again. Dental clinics, salons and spas miss appointment booking calls, and the patient books the clinic down the street instead. Everyone else misses general calls, and the customer calls a competitor next.`,
    qa: [
      [`Do you work with my kind of business? / Hamare business ke liye hai?`, `It's built for businesses that lose calls they can't staff around the clock — hospitals, clinics, delivery, salons, gyms, auto shops, law firms, real estate and insurance — and ${founder} tailors the demo to your kind of call.`],
    ],
  },
];

function esc(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function html(): string {
  const body = SECTIONS.map(
    (s) => `<h2>${esc(s.title)}</h2>
${s.intro ? `<p>${esc(s.intro)}</p>` : ""}
${s.qa.map(([q, a]) => `<p><b>Q: ${esc(q)}</b><br>A: ${esc(a)}</p>`).join("\n")}`,
  ).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(company)} knowledge base</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;margin:0}
h1{font-size:20pt;margin:0 0 4pt}h2{font-size:14pt;margin:18pt 0 6pt}p{margin:0 0 8pt}.sub{color:#444;margin-bottom:12pt}</style></head><body>
<h1>${esc(company)} AI Voice Agent — Product &amp; Company Knowledge Base</h1>
<p class="sub">Reference for answering caller questions on a live outbound call. Answers are short and spoken. Anything not written here is not known — say so and point to the demo with ${esc(founder)}.</p>
${body}
</body></html>`;
}

function findBrowser(): string {
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Edge/Chrome found to render the PDF. Install one, or edit the PDF by hand.");
  return found;
}

const target = path.resolve(config.root, config.ragPdfPath);
mkdirSync(path.dirname(target), { recursive: true });

if (existsSync(target)) {
  const backupDir = path.join(path.dirname(target), "backup");
  mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(target, ".pdf")}.${Date.now()}.pdf`);
  copyFileSync(target, backup);
  console.log(`Backed up the old PDF to ${path.relative(config.root, backup)}`);
}

const htmlPath = path.join(path.dirname(target), "_kb.html");
writeFileSync(htmlPath, html(), "utf8");
execFileSync(
  findBrowser(),
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${target}`,
    `file:///${htmlPath.replaceAll("\\", "/")}`,
  ],
  { stdio: "ignore", timeout: 60_000 },
);
rmSync(htmlPath, { force: true });
console.log(`Wrote ${path.relative(config.root, target)} for "${company}" / ${founder}. Now run: npm run ingest`);
