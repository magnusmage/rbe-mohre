# RBE Console: Resolve Before It Escalates

Front-end prototype for **MoHRE Labour Relations' RBE service** (hotline 80084): an AI voice assistant that helps workers check wage and contract issues against their own records, with **every case reviewed and decided by a qualified human specialist**.

The app has two sides:

| Area | Who uses it | What it does |
| --- | --- | --- |
| **Caller** | Worker | Verify identity, run a voice call with the assistant, see findings and confirm a complaint draft, then get a review reference. |
| **Specialist review** | MoHRE specialist | Work a review queue, compare verified records with the caller's unverified allegations, inspect the agent's audit trail and record a single, signed decision. |

> **Note:** The **Start Call** flow connects to a real backend and an ElevenLabs voice agent. All other screen content (findings, transcript, review queue, and so on) is still static mock data in `src/data/mock.ts`, and there is no authentication.

---

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org) (strict)
- [Vite 6](https://vite.dev) for dev server and bundling
- [Tailwind CSS 4](https://tailwindcss.com) (via `@tailwindcss/vite`, tokens in `@theme`)
- [React Router 7](https://reactrouter.com) (data router)
- [Redux Toolkit](https://redux-toolkit.js.org) + React Redux (thunks via `createAsyncThunk`)
- [ElevenLabs JS client](https://github.com/elevenlabs/packages) (`@elevenlabs/client`, lazy-loaded) for the voice agent
- IBM Plex Sans / IBM Plex Mono (Google Fonts)

## Getting started

**Requirements:** Node.js 20+, npm, and the RBE backend API running (for voice calls).

```bash
npm install
npm run dev
```

No configuration is needed: the dev server proxies API paths to the local
control plane on http://localhost:8000 (override with `RBE_DEV_API`), and
a production build is served by the control plane itself on one origin.

Then open http://localhost:5173.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | No | Optional base URL of a different backend, without a trailing slash. Empty (the default) means same-origin. |

Variables are read at build time by Vite. `.env` is git-ignored; only `.env.example` is committed.

> Voice calls need microphone access, which browsers only allow on `https://` or `localhost` / `127.0.0.1`.

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |

## Routes

| Path | Screen |
| --- | --- |
| `/` | Redirects to `/caller/ready` (home) |
| `/caller/ready` | **Ready to call**: worker ID, case reference, SMS PIN, spoken language, *Start call* |
| `/caller/call` | **In call**: live call panel (timer, mute, transfer, end), session details, findings, draft confirmation, live transcript |
| `/caller/ended` | **Call ended**: review reference (copyable), next steps, call summary, verified transcript |
| `/specialist` | Redirects to the first case in the queue |
| `/specialist/:caseRef` | **Case review**: queue, evidence, complaint draft, agent activity, decision panel, transcript / audit / rule tabs |

Any unknown path redirects to `/`.

### Navigation

- The **RBE logo** always returns to the home screen (`/caller/ready`).
- Top bar tabs switch between **Caller** and **Specialist review**.
- Caller flow: *Start call* -> In call -> *End call* / *Transfer to human* -> Call ended -> *New call*. The In call and Call ended screens have a **Back** button to the previous step.
- Specialist queue items link to `/specialist/:caseRef`. Only `RV-2409-0031` has a full case pack; other cases show a "Case pack not available" state.

## Start Call flow

Pressing **Start call** on `/caller/ready` dispatches the `startCall` thunk, which runs three steps in order:

1. **Microphone**: checks the permission and asks for it only if it hasn't been decided yet (`src/services/media/microphone.ts`).
2. **Session**: dispatches `fetchSignedUrl`, which calls `GET /session/signed-url` on the API base (same-origin by default). The response must be `{ "signed_url": "wss://..." }` (`signedUrl` is also accepted).
3. **Voice agent**: opens an ElevenLabs conversation with that signed URL (`src/services/voice/voiceAgent.ts`), with a 20 s timeout.

The app moves to `/caller/call` only after the ElevenLabs session is connected.

| Redux state (`callSession`) | Values |
| --- | --- |
| `signedUrlRequest.status` | `idle` -> `loading` -> `succeeded` \| `failed` |
| `status` | `idle` -> `requesting-microphone` -> `fetching-session` -> `connecting` -> `connected` -> `ended` \| `failed` |

- **Duplicate starts are blocked** in two places: the button is disabled and shows progress (*Checking microphone... / Preparing secure session... / Connecting to assistant...*), and the thunk's `condition` rejects a second start while one is running.
- **Errors** are shown above the button with a clear message for each source: microphone (blocked, not found, in use, needs HTTPS, unsupported browser), API (network, timeout, 4xx/5xx, bad response; a `502` with `detail: "signed_url_unavailable"` shows a work-in-progress notice linking to the [GitHub repository](https://github.com/magnusmage/rbe-mohre)) and connection (timeout or refused).
- **During a call**, *Mute* toggles the ElevenLabs microphone, *End call* / *Transfer to human* close the session, and the header shows whether the agent is speaking or listening. If the agent hangs up, the app goes to the Call ended screen. If the connection drops, it goes back to Ready and shows an error.
- The ElevenLabs conversation object can't be stored in Redux (it isn't serialisable), so it lives in the `voiceAgent` service. Redux holds only the status, mode and error details.

## Features & interactions

**Global**
- Interface language menu (English / Arabic / Urdu); closes on outside click or `Esc`.
- Specialist identity is shown in the top bar on specialist routes.

**Caller**
- Editable verification form and spoken-language selector.
- Mute toggle (pauses the waveform), end/transfer call.
- Complaint draft confirmation (*Yes, prepare the draft* / *Not yet*).
- Copy review reference to clipboard with feedback.

**Specialist**
- Queue search (ref, title, worker) and tier filters (All / T2 / T1 / T0).
- Transcript status banner: *Decision locked* (transcript pending) or *Ready to decide*.
- Decision panel: pick one of four outcomes (Uphold, Open complaint, Refer, Request more), write an audited note, cancel or confirm. A decision can be recorded **once**, and is disabled while the transcript is pending.
- Side panel tabs: Transcript + case history, Audit log, Rule text.
- *Print pack* opens the browser print dialog (navigation and side panels are hidden in print).

**Not wired (visual only):** *Track my case*, *Download transcript (PDF)*, *Assign to...*.

## Project structure

```
src/
├── app/
│   ├── App.tsx               # Router + providers
│   └── routes.ts             # Route path constants (use these, not string literals)
├── components/
│   ├── icons/                # Inline SVG icon set (createIcon factory)
│   ├── layout/               # AppShell, TopBar, LanguageMenu
│   ├── transcript/           # TranscriptList + TranscriptPanel (shared by caller & specialist)
│   └── ui/                   # Design-system primitives: Button, Card/CardHeader, Badge,
│                             # Orb, Waveform, TextField, LabeledValue, SectionLabel, Kbd,
│                             # Alert, Spinner
├── config/env.ts             # Typed, validated environment variables
├── context/
│   └── LanguageContext.tsx   # Selected interface language
├── data/
│   └── mock.ts               # All mock data (session, transcript, queue, audit, cases, decisions)
├── features/
│   ├── caller/
│   │   ├── CallerLayout.tsx
│   │   ├── hooks/            # useStartCall (drives the Start Call UI)
│   │   ├── state/            # callSessionSlice (thunks, reducers, selectors), callErrors
│   │   ├── components/       # CallHero, SessionStrip, FindingsCard, DraftConfirmCard,
│   │   │                     # RightsCard, TwoColumnLayout, BackButton
│   │   └── screens/          # ReadyScreen, InCallScreen, CallEndedScreen
│   └── specialist/
│       ├── SpecialistLayout.tsx
│       ├── CaseReviewScreen.tsx
│       ├── tiers.ts          # Tier / audit-result -> badge tone mappings
│       └── components/       # ReviewQueue, CaseHeader, TranscriptStatusBanner, EvidenceCards,
│                             # ComplaintDraftCard, AuditLog, DecisionPanel, CaseSidePanel
├── hooks/                    # useDismiss (outside click / Esc), useCopyToClipboard
├── services/
│   ├── http/apiClient.ts     # fetch wrapper: base URL, timeout, typed ApiError
│   ├── session/sessionApi.ts # GET /session/signed-url
│   ├── media/microphone.ts   # Microphone permission check / request
│   └── voice/voiceAgent.ts   # ElevenLabs session lifecycle (connect, mute, end)
├── store/                    # configureStore, RootState/AppDispatch, typed hooks
├── lib/cn.ts                 # className join helper
├── types/index.ts            # Shared domain types
├── index.css                 # Tailwind import, theme tokens, orb/wave animations
└── main.tsx
public/favicon.svg
```

### Conventions

- **Features own their screens**; anything used by more than one feature lives in `src/components`.
- **Import alias:** `@/` -> `src/` (configured in `vite.config.ts` and `tsconfig.app.json`).
- **Styling:** Tailwind utilities only. Use the theme tokens instead of raw hex values, e.g. `text-ink`, `text-muted`, `border-line`, `bg-brand`, `bg-danger-50`, `text-warn-ink`, `text-indigo`. Tokens are defined in the `@theme` block in `src/index.css`.
- **Data:** components read from `src/data/mock.ts` and are typed by `src/types`. To connect a real API, replace these imports with data-fetching hooks that return the same types.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| `ink` | `#14202B` | Primary text, dark surfaces |
| `muted` / `subtle` | `#56616F` / `#8A97A2` | Secondary / tertiary text |
| `line` / `line-soft` | `#D8DEE6` / `#EAEFF4` | Borders, dividers |
| `canvas` | `#EEF1F4` | App background |
| `brand` | `#0B7568` | Primary actions, agent, verified records |
| `success` | `#067647` | OK / verified states |
| `danger` | `#B42318` | Tier 2, end call, deductions |
| `warn` / `warn-ink` | `#A8650E` / `#8A4C0A` | Allegations, tier 1, locked states |
| `indigo` | `#3346A8` | Worker speaker, tool names, specialist avatar |

## Contributing

Contributions are welcome.

1. Fork the repository and create a branch: `git checkout -b feat/short-description`.
2. Install dependencies and run the app with `npm install` and `npm run dev`.
3. Follow the [conventions](#conventions): keep features self-contained, reuse the `ui` primitives, and use theme tokens instead of hard-coded colours.
4. Make sure `npm run build` passes (it runs the TypeScript checks too).
5. Open a pull request that describes the change. Add screenshots for UI changes.

Please use [Conventional Commits](https://www.conventionalcommits.org) for commit messages (for example `feat: add case assignment modal`, `fix: queue filter reset`).

## License

Covered by the repository's [Apache License 2.0](../LICENSE).
