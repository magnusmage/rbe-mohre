# agent/ — Zone 2 source of truth (configured, not coded)

Everything the ElevenLabs platform runs is defined here and reviewed like
code. Nothing in this folder executes locally; it is applied to the platform
with the official **ElevenLabs Agents CLI** and checked by a unit test
(`tests/test_usecases.py::PlatformContract`) so that `tool_configs/` and
`app/registry.py` cannot drift apart.

## Layout (Agents-CLI compatible)

```
agent/
├── agents.json            index of agents → agent_configs/
├── tools.json             index of tools  → tool_configs/   (8 webhook tools)
├── tests.json             index of tests  → test_configs/   (S1–S10, 5 runs each)
├── agent_configs/rbe_agent.json
├── tool_configs/*.json    one file per server tool; the contract with Zone 3
├── test_configs/s01..s10.json
├── system_prompt.md       hard limits; first line of defence, not the last
├── workflow.md            five nodes, per-node tool scoping, error edges
├── keyterms.txt           Scribe v2 keyterms (Arabic/Urdu pay terms included)
├── voices.md              one Eleven v3 voice per language
└── kb/sources.md          public rule texts only, always cited
```

## Applying to the platform

```bash
npm install -g @elevenlabs/cli        # or: npx @elevenlabs/cli
export ELEVENLABS_API_KEY=...         # workspace key, never committed
elevenlabs agents push --dry-run      # preview the diff
elevenlabs agents push                # apply
```

Field names follow the ElevenLabs Agents API as of mid-2026 — **verify
against the current docs when you configure**, and fill in the
placeholders: control-plane host URL in every `tool_configs/*.json`,
`AGENT_TOOL_TOKEN` as a workspace secret referenced by ID, voice IDs in
`voices.md`, the post-call webhook URL and HMAC secret.

## Two details that carry security

1. `conversation_id` is filled by the platform from the system dynamic
   variable (`system__conversation_id`), **never by the LLM** — otherwise a
   manipulated model could send another call's ID.
2. The bearer token is a workspace secret referenced by ID, so it never
   appears in the prompt, the repo or the model context.
