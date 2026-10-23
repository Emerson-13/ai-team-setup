# UI.md: Use a UI Kit or Template, Not Hand-Made CSS

Read this when building or changing any screen: public Blade pages, the authenticated app, the admin side, emails with layouts.

**Rule:** do not design components from scratch. Use **one** ready-made UI kit or template per project, and build every screen from its components.

Why: the result looks consistent, accessibility and dark mode come built in, and agents stop inventing a new style on every task.

---

## 1. Choose once (ask with the framework question)

Ask this **together with** the authenticated-framework question (TEAM.md Section 8.1), unless the project already uses a kit (then follow it, do not ask). If you cannot ask, take the suggested default for the chosen framework and record it as an Assumption.

| Question | Options |
|---|---|
| Which UI kit or template? | 1. **The kit that matches the starter kit / framework** (suggested, below). 2. **Flowbite**. 3. **DaisyUI** or **Preline**. 4. **A template you already have** (you give the folder or link). 5. Other |

Suggested default by framework (all Tailwind-based unless noted):

| Framework | Suggested kit | Others to consider |
|---|---|---|
| Vue 3 + Inertia | **shadcn-vue** (the Laravel Vue starter kit uses it) | Flowbite Vue, PrimeVue, Vuetify (not Tailwind) |
| React + Inertia | **shadcn/ui** (the Laravel React starter kit uses it) | Flowbite React, MUI (not Tailwind) |
| Livewire / Blade | The Livewire starter kit's component set (Flux UI) | Flowbite, DaisyUI, Preline |
| Public Blade pages | Same Tailwind tokens as the app, with Flowbite, DaisyUI or Preline components | A bought marketing template (for example Tailwind Plus) |
| Admin / dashboard screens | The chosen kit's dashboard and layout blocks | A bought admin template |

Names, licenses and prices change. **Before choosing, check the kit's current license and price, and record it** in the Team Brief as an AD-n with the reason.

If the user supplies a template (a purchased theme, a downloaded dashboard): use its layout and components as the source of truth, check that its license allows this project, and do not copy parts of it somewhere the license does not cover.

---

## 2. Rules

- **One kit per project.** Never mix two component libraries. Public and authenticated areas share the same colors, fonts and spacing so the brand matches.
- **Set tokens once** (colors, radius, fonts, spacing) in the Tailwind config or CSS variables. Screens use tokens, never hard-coded colors or pixel values.
- **Components first.** Buttons, inputs, selects, tables, modals, dropdowns, tabs, toasts, alerts, pagination, empty states: take them from the kit. Do not rebuild them.
- **Custom CSS only when the kit lacks the thing.** Then make one small shared component, name it, and reuse it. No inline styles. No one-off CSS per page.
- **Install through the package intake checklist** (PACKAGES.md): follow the kit's own install steps, pin the version, and note whether its files are copied into the repo (shadcn style, you own and may edit them) or imported from a package (do not edit; wrap instead).
- **Keep what the kit gives you:** focus rings, aria attributes, keyboard support, dark mode, responsive behavior. Do not strip them.
- **Every screen handles states:** loading, empty, error, forbidden, success. Use the kit's skeleton, alert and empty-state components.
- **Layouts:** one public layout (Blade), one app layout, one admin layout if there is an admin side (ACCESS.md). All three use the same kit and tokens.
- **Existing apps:** do not migrate to a different kit unless the user asks. Match what is there.

## 3. Who does what

| Role | Responsibility |
|---|---|
| Frontend Engineer | Builds screens from kit components; proposes the kit choice |
| UX Reviewer | Checks consistency: spacing, one primary action per view, states present, no off-kit components |
| QA Automation Engineer | Accessibility smoke (`seo-a11y.spec.ts`) and responsive smoke (`@mobile`) |
| Orchestrator | Records the kit as an AD-n and rejects off-kit styling in review |

## 4. Done when

- [ ] Every new screen uses kit components and tokens only (no stray colors, no inline styles).
- [ ] Any custom component is small, named, reusable, and listed in the report.
- [ ] Loading, empty, error and forbidden states exist.
- [ ] Works at phone width and in dark mode (if the kit supports it).
- [ ] Accessibility smoke passes.
