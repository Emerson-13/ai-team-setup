# PROMPTS.md: Copy-Paste Prompts For Reliable Results

Use these templates when you give the team a task. Fill in the brackets, delete lines that do not apply, send. The more of the "Done when" you fill in, the less the agent has to guess and the fewer tokens it spends.

Every template starts with the same line, so the rules in `AGENTS.md` and `docs/ai/PROTOCOL.md` are always applied.

---

## 0. One-liner (small tasks, XS/S)

```text
Follow AGENTS.md. Task: <what to change> in <file or area>. Done when: <how I will know>. Show the commands you ran.
```

## 1. New feature (M/L/XL)

```text
Follow AGENTS.md and docs/ai/PROTOCOL.md. Use the project agents by name. Show the agent status board before each step and stop if any agent is blocked or timed out.

TASK: <one sentence: the feature>
WHY: <the problem it solves / who needs it>
WHO: <user types and what each may do: admin side / client side roles>
RULES: <business rules, limits, edge cases you already know>
SCREENS: <pages or flows, or "propose them">
DATA: <what is stored; files/uploads? AI features?>
UI KIT: <name, or "ask me">   FRAMEWORK: <Vue / React / Livewire, or "ask me">
OUT OF SCOPE: <what must not change>
DONE WHEN: <acceptance checks you can verify, for example "staff cannot delete", "works with no cloud storage">

Ask all questions once, together, before coding. Then give me the Team Brief to approve.
```

## 2. Bug fix

```text
Follow AGENTS.md and docs/ai/PROTOCOL.md.

BUG: <what happens>
EXPECTED: <what should happen>
STEPS: <how to reproduce, or the error text / log lines>
WHERE: <page, route, or file if you know>
Do not change anything outside the cause. Write a failing test first, fix it, run the test and the related regression tests, and show the results. Say what you could not verify.
```

## 3. Refactor / cleanup

```text
Follow AGENTS.md and docs/ai/PROTOCOL.md.

REFACTOR: <what to restructure and why>
KEEP: behavior must not change; the existing tests must still pass
SCOPE: <files or module>
Run the tests before and after and show both results. Do not touch files outside the scope.
```

## 4. Review (read-only)

```text
Follow AGENTS.md and docs/ai/PROTOCOL.md. Do not edit code.

REVIEW: <files, branch, or diff>
FOCUS: <security / roles and permissions / performance / UX / all>
Use the matching reviewer agent. Return findings (F-n with severity, file:line, failure scenario). If none, list exactly what you checked.
```

## 5. Roles and permissions

```text
Follow AGENTS.md and docs/ai/ACCESS.md.

TASK: <add a role / add a permission / new admin screen / per-company roles>
SIDE: <admin side / client side / both>
ROLES: <names, or "propose them">
First write the role matrix and the AD-n decisions for me to approve. Then implement, then run the matrix, cross-tenant, cross-guard and escalation tests, then have access-control-reviewer review it.
```

## 6. File uploads / storage

```text
Follow AGENTS.md and docs/ai/STORAGE.md.

TASK: <what is uploaded, by whom, who may see it>
PUBLIC OR PRIVATE: <each file type>
Use StorageService only. Cloud if configured, otherwise the public/local fallback. Show tests for both cases.
```

## 7. AI feature through n8n

```text
Follow AGENTS.md and docs/ai/N8N.md.

TASK: <what the AI should do, for whom>
Use one of the workflows in docs/ai/n8n/, or tell me which new one is needed and build it with built-in AI nodes only. Call it from a Laravel Service, queue slow calls, fake the client in tests.
```

## 8. Resume after a pause

```text
Follow AGENTS.md and docs/ai/PROTOCOL.md. Read docs/ai/progress.md, print the agent status board, and tell me what is done, what is blocked, and the next step. Do not redo finished work.
```

---

## What a good run looks like (what to check)

- The first reply states the mode and size, and asks its questions **once**.
- You see an **AGENT STATUS** table, and the work stops at any `blocked` or `timed_out`.
- Claims have a file path, a command, or a label (Verified / Unverified / Not Tested).
- The final report lists commands run, test counts, agent statuses, and remaining risks.

If a run does not do these, reply: `Follow docs/ai/PROTOCOL.md Section 2 and Section 6.`
