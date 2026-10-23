# PROTOCOL.md: Agent Status, Routing, Briefs, No-Guessing, Token Discipline

Read this before delegating to any agent and before finishing any task. It makes agents predictable: the right agent is used, its state is always visible, nobody guesses, and tokens are not wasted.

Tools cannot force an AI to obey a file. These rules work because they are short, checkable, and repeated in `AGENTS.md`. The Orchestrator checks them; so does the user (Section 2 shows what to look for).

---

## 1. Use the project's agents (no silent substitution)

When a task matches a row below, delegate to that **named** agent (`.claude/agents/<name>.md`). In tools without sub-agents, run the same role as a separate written pass (TEAM.md Section 31).

| Task | Agent |
|---|---|
| New system, module, pricing, onboarding; "is this the best way?" | `product-strategist` |
| Positioning, public pages, SEO, launch plan | `marketing-strategist` |
| Workflow, handoffs, state maps, automation, unit economics | `systems-thinker` |
| Competitor and customer evidence | `market-researcher` |
| Pre-mortem before L/XL work | `challenger` |
| Write, run, debug Playwright tests | `qa-playwright` |
| Packages, Reverb, queues, scheduler, infrastructure wiring | `platform-realtime-engineer` |
| Roles, permissions, guards, super admin, policies | `access-control-reviewer` (review) |

Rules:

- **Never fall back to a default or general-purpose agent without telling the user.** If a named agent is unavailable, say: `AGENT UNAVAILABLE: <name>. Options: run as a written pass, or you fix the setup.` and wait.
- **Do not do an agent's job yourself and report it as the agent's work.**
- Do not use an agent for XS/S tasks (TEAM.md Section 5). Do the work and keep the review pass.
- Do not delegate and also repeat the same work.

## 2. Agent status (always visible, always checked)

Every delegated agent has exactly one status:

| Status | Meaning | Set by |
|---|---|---|
| `running` | Launched, no result yet | Orchestrator, at launch |
| `completed` | Returned a result and its output was checked against real files | Agent reports it; Orchestrator confirms |
| `blocked` | Cannot proceed: missing info, missing access, failed check, tool error | Agent reports it, with the reason |
| `timed_out` | No result within the time budget, or the tool reported a timeout | Orchestrator |

**Time budget:** 10 minutes per agent unless the Team Brief says otherwise.

**Status board.** The Orchestrator keeps it in `docs/ai/progress.md` (TEAM.md Section 3.2) **and prints it in the chat before every dependent step**:

```text
AGENT STATUS
| Agent | Task | Status | Evidence / reason |
| product-strategist | Strategy Brief | completed | docs/ai/briefs/orders.md |
| qa-playwright | E2E for orders | blocked | app not running on 8001 |
| challenger | Pre-mortem | timed_out | no result after 10 min |
```

**Gate (this is the "before you continue" rule):**

1. Do not start work that depends on an agent until its status is `completed`.
2. On `blocked` or `timed_out`: **stop, show the board, and ask the user** to choose: retry with a narrower brief, fix the blocker, or skip that agent. Retry at most once automatically, and only with a narrower brief.
3. Independent work may continue while an agent is `running`.
4. The final report lists every agent with its final status. A task is not done while any required agent is `running`, `blocked` or `timed_out`.

**What an agent returns (first lines of its reply, nothing before them):**

```text
AGENT: <name>
STATUS: completed | blocked
SUMMARY: <max 5 lines>
EVIDENCE: <file paths, command output, or finding ids>
NEEDS: <only when blocked: exactly what is missing>
```

An agent never reports `running` or `timed_out` about itself. If it ran out of budget, it returns `STATUS: blocked` with `NEEDS: more time or a narrower scope` and what it finished.

## 3. Brief every agent the same way

A vague prompt wastes tokens and invites guessing. Use this brief for every delegation (it extends TEAM.md Section 32):

```text
AGENT: <name>
GOAL: <one sentence: the decision or file this must produce>
CONTEXT: <Team Brief section numbers or file paths. Never paste whole files.>
YOU OWN (may edit): <files, or "read-only">
DO NOT TOUCH: <everything else>
RULES: AGENTS.md, plus <the specific sections: for example ACCESS.md Section 4>
DONE WHEN: <testable: AC ids, command that must pass>
BUDGET: read only what you need; max <N> minutes; report in <=30 lines
IF UNSURE: say UNKNOWN and what you need. Do not guess.
RETURN: the status block from Section 2, then your result
```

## 4. No guessing (anti-hallucination)

- **Read before you claim.** Only state what you read in a file, ran in a command, or saw in a tool result this session. Cite `path:line` or the command.
- **Do not invent** package names, versions, config keys, flags, methods, routes, table names, or file contents. Check them: `composer show <pkg>`, the vendor source, the installed version's docs, `php artisan route:list`, `php artisan about`.
- **Label uncertainty.** `Verified` (checked just now), `Unverified` (from memory), `UNKNOWN`. Never present an Unverified item as fact.
- **No fake results.** Never write "tests pass" without running them and showing the command and counts. If you could not run something: **Not Tested**.
- **Missing information:** ask once, together with the other questions (TEAM.md Section 6). If a reasonable assumption is safe, state it as an Assumption and continue.
- **Never invent data:** statistics, market sizes, quotes, benchmark numbers, citations. No source means Hypothesis.
- **Do not trust another agent's summary.** Check its claims against the files before building on them.

## 5. Spend tokens carefully

- **Find, then read.** `grep`/glob first, then read only the needed line ranges. Do not open whole large files (`TEAM.md` is long: read the section you need, not the file).
- **Read once.** Do not re-read a file that has not changed. Keep a short note of what you learned instead of re-deriving it.
- **Do not paste files into replies or briefs.** Point to paths and sections.
- **Short outputs.** Reports follow the formats already defined (handoff, findings, E2E report). No recaps of what the user just said. No repeated explanations.
- **Right-size the team** (TEAM.md Section 5): no agent for XS/S work; parallel agents only for truly independent work.
- **Stop loops.** After 3 failed attempts at the same problem, stop and report `blocked` with what you tried. Do not keep retrying the same thing.
- **Reuse the Team Brief** as the shared source of truth. Do not restate it in every message.

## 6. Verify before you finish (the fix loop)

A task is not finished when the code is written. It is finished when the checks pass or the failure is reported honestly.

1. Run the checks that apply: PHP syntax/lint, Pest tests for what changed plus the regression set, frontend type check/build, Playwright for critical journeys (L/XL), `php artisan route:list` when routes changed.
2. If something fails: read the real error, find the cause, fix it, **re-run the same check**. Do not weaken, skip, or delete a test to get green.
3. Repeat at most 3 times per failure. Then stop: status `blocked`, with the error, what you tried, and what you suspect.
4. Check every agent's output against the real files before accepting it.
5. Only then write the final report, and it must show: commands run, results (counts), anything **Not Tested**, agent status board, remaining risks.
6. Never end an answer with known failures described as done.

## 7. Orchestrator checklist (before each reply that moves on)

- [ ] Right agent used, by name? Any silent fallback? (Section 1)
- [ ] Status board printed and current? Any `blocked` or `timed_out` not shown to the user? (Section 2)
- [ ] Every claim backed by a file, command, or label? (Section 4)
- [ ] Briefs short and complete? No pasted files? (Sections 3, 5)
- [ ] Checks run and re-run after fixes? (Section 6)
- [ ] Preflight run before Pest/Playwright; stalls and tool failures reported as `blocked`, not retried blindly? (Section 8)

## 8. Stalls, busy ports, and tool failures

Tests and browsers fail for boring reasons (MySQL down, port taken, tool unavailable). Handle them the same way every time:

1. **Preflight before running anything heavy:** `php docs/ai/templates/laravel/test-doctor.php` before Pest, `npm run e2e:doctor` before Playwright. Any FAIL: stop, report `blocked` with the exact output, wait for the user. Do not run the suite hoping it works.
2. **No hanging.** A command with no output for 120 seconds is stalled. Stop it, run the doctor, report `blocked`. Never wait indefinitely and never launch the same command again.
3. **One retry at most**, and only after the cause changed (you fixed something). Repeating an identical failing command is wasted tokens.
4. **Ports:** the E2E config picks a free port itself. If you must free one, name the process and port to the user before killing anything you did not start.
5. **A tool that fails (in-app browser, MCP, bridge) is not retried.** Use another route that does not need it (for E2E: Playwright from the shell). If there is none, label the result **Not Tested** with the exact error text.
6. **Report, do not hide:** the final report lists each blocked check, the error, what was tried, and what the user must fix.

