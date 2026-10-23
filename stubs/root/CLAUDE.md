# CLAUDE.md

Follow the instructions in @AGENTS.md. Full team rules are in @docs/ai/TEAM.md (read for M/L/XL tasks).
Read on demand: @docs/ai/STRATEGY.md (strategy/marketing/systems thinking), @docs/ai/PACKAGES.md (packages, Reverb/WebSockets), @docs/ai/PLAYWRIGHT.md (E2E QA), @docs/ai/ACCESS.md (roles/permissions, admin and client side), @docs/ai/PROTOCOL.md (agent status, briefs, no guessing; read before delegating or finishing), @docs/ai/PROMPTS.md, @docs/ai/STORAGE.md (files/uploads), @docs/ai/UI.md (UI kit), @docs/ai/N8N.md (AI features).

Sub-agents for this repo live in `.claude/agents/`: product-strategist, marketing-strategist, systems-thinker, market-researcher, challenger, qa-playwright, platform-realtime-engineer, access-control-reviewer. Use them **by name** (Agent tool, `subagent_type` = the agent name) for the Strategy Council, Playwright, package, and permission-review work. Never substitute a default/general agent without telling the user. Track each agent's status (`running | completed | timed_out | blocked`), print the status table, and stop at `blocked` or `timed_out`. Verify their output against the real files.
