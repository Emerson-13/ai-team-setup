# BOARD.md: Live agent board, plan progress, and activity log

See what your AI agents are doing, how far the plan is, and whether something stalled, in any tool (Codex, Claude Code, Cursor, Copilot, Gemini). No dependencies beyond Node 18+. It does not touch the Laravel app, routes, or database.

## 1. Quick start (once per project)

```bash
node docs/ai/board/setup.mjs        # npm scripts + .gitignore  (add --claude-hooks for Claude Code)
npm run ai:doctor                   # checks everything
npm run ai:board                    # dashboard at http://127.0.0.1:4177
```

In VS Code: `Ctrl+Shift+P` > **Simple Browser: Show** > paste the address, and keep it in a side panel while Codex works. `docs/ai/progress.md` is the plain-text version of the same plan.

## 2. Three layers, from most to least certain

| Layer | Source | Needs the agent to obey? | Shows |
|---|---|---|---|
| 1. Wrapped commands | `npm run ai:run -- <command>` (`wrap.mjs`) | **No**: the script writes the log | start, end, exit code, duration, last output lines, **stalled** (no output for 120 s, then the command is stopped) |
| 2. Tool's own record | Codex session files (`~/.codex/sessions`), or Claude Code hooks | **No** | commands run, files edited, messages, and the tool's own plan (Codex `update_plan`, Claude `TodoWrite`) |
| 3. Agent self-report | `node docs/ai/board/log.mjs ...` | **Yes** | agent names and status (`running / completed / timed_out / blocked`), plan tasks, evidence, findings |

Layers 1 and 2 are what you can trust when an agent forgets the rules. Only layer 3 knows **which role** (agent name) is working; in Codex the "agents" are roles Codex plays itself, so that part cannot be guaranteed.

Limits: you see status, steps, and evidence, not the model's private reasoning. The Codex file format is not a public contract: run `npm run ai:probe` to see what it can read on your machine, and again after a Codex update.

## 3. Commands (agents use these; `AI_AGENT=<name>` sets the author)

```bash
node docs/ai/board/log.mjs plan "Orders module" --task "Schema :: Database Engineer" --task "Orders API :: Backend Engineer" --mode "new system" --size L
node docs/ai/board/log.mjs task T1 in_progress "writing migration"
node docs/ai/board/log.mjs task T1 done "migration runs on MySQL"          # pending | in_progress | blocked | review | done
node docs/ai/board/log.mjs add "Extra step" --owner "QA Engineer"
node docs/ai/board/log.mjs agent qa-playwright running "E2E for orders"     # running | completed | timed_out | blocked
node docs/ai/board/log.mjs agent qa-playwright blocked "E2E for orders" --needs "MySQL is not running"
node docs/ai/board/log.mjs finding high "Missing tenant check in OrderPolicy::view"   # later: finding F-1 fixed
node docs/ai/board/log.mjs next "Run regression suite"
node docs/ai/board/log.mjs status        # print the current state
node docs/ai/board/log.mjs finish        # refuses while a task, agent or high finding is still open
node docs/ai/board/log.mjs reset         # start clean
```

Every command rewrites `docs/ai/progress.md` and prints one line such as `PROGRESS 2/5 tasks (40%) [####------] | now: T3 Orders page`. Agents paste that line into their reply.

Heavy commands go through the wrapper so a stall is caught by a script:

```bash
npm run ai:run -- npm run e2e
npm run ai:run -- php artisan test
node docs/ai/board/wrap.mjs --stall 180 --timeout 900 --agent qa-playwright -- npm run e2e
```

Exit code is the command's own; **124** means stalled or timed out: report `blocked` and do not run the same command again.

## 4. How plan progress stays current

1. As soon as a plan exists (Team Brief task list, a step list, Codex `update_plan`), the agent registers it with `log.mjs plan`.
2. Each task is `in_progress` before work starts and `done` (with evidence) right after its check passes, never in a batch at the end.
3. If the agent forgets: Codex's `update_plan` and Claude's `TodoWrite` are copied into `progress.md` automatically (by the running board, or by the Claude hook). A plan the agent registered itself is never overwritten.

## 5. Files

```text
docs/ai/board/   lib, log, wrap, board (+ board.html), codex, hook, setup, doctor   (installed, overwritten on update)
docs/ai/state/   agents.json, plan.json, events.jsonl                               (generated, git-ignored)
docs/ai/progress.md                                                                  (generated, git-ignored)
```

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard shows no Codex activity | `npm run ai:probe`. If it lists a different working folder (WSL vs Windows path), run the board where Codex runs, or set `AI_BOARD_CODEX_HOME` to the `.codex` folder |
| Port 4177 busy | The board uses the next free port and prints it |
| Red "No activity" banner | Work is marked in progress but nothing moved for 120 s: check the agent, run `npm run e2e:doctor`, do not restart the same command blindly |
| Codex asks approval for each `node docs/ai/board/...` command | Allow that command prefix in the Codex approval settings (check the current Codex docs for the exact setting) |
| `log.mjs: no plan yet` | Register one with `log.mjs plan` |
