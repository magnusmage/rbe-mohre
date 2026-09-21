# D9 — Zone 2 managed as code with the ElevenLabs Agents CLI

**Status:** accepted · **Zone:** 2

The `agent/` folder follows the ElevenLabs Agents CLI layout (`agents.json`,
`tools.json`, `tests.json` + config dirs) and is applied with
`elevenlabs agents push`. A unit test asserts `agent/tool_configs/` and
`app/registry.py` define the same tool set, so the platform and the control
plane cannot drift.

**Why.** Voice-agent behaviour is product behaviour: it must be reviewed in
pull requests, diffed before deploy (`push --dry-run` in CI) and
reproducible for the demo tag. Field names follow the Agents API as of
mid-2026; verify against current docs when configuring.
