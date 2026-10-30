# UI.md — Layout-first, component-first, UX-driven screens

> Read this before building or changing any page, layout, modal, or component.
> Applies to the Frontend Engineer (builds) and the UX Reviewer (checks).
> Default stack: Vue 3 + Inertia + TypeScript + Tailwind. For React, Livewire or Blade, use the equivalents in Section 12. **Match the project's existing folder names and kit over the names here.**

## 0. The five rules

1. **Layout first.** Every page lives inside a layout from the layouts folder. No page builds its own header or sidebar.
2. **Components first.** Before writing markup, reuse an existing component, then a kit component, then build **one reusable component**. Never paste the same markup into a second page.
3. **Composables for logic.** Stateful UI logic (modal state, filters, tabs, tables, forms, permissions) goes in composables, not in page files.
4. **Design for the user, not for the data.** Decide the pattern (page, modal, drawer, tab, step) from the user's task, then build it. Break dense screens into smaller ones that navigate to each other.
5. **Minimal blast radius.** Do not change a shared layout or shared component unless required. If you must, keep it backward compatible (new optional prop or slot) and flag it in the report.

## 1. Ask once, then follow

Ask together, one time, unless the project already answers them:
- Framework for authenticated pages (Vue + Inertia suggested).
- UI kit or template (shadcn-vue / shadcn/ui, Flowbite, DaisyUI, Preline, or your own). If one is installed, follow it without asking.
- **App type** (Section 2.2), because it decides the layout.

If you cannot ask: Vue + Inertia, the kit already in `package.json` (else Tailwind with own components), app type inferred from the routes and navigation. Record the assumption in the Team Brief.

Inspect first: `npm run ai:context -- --find Layout`, `--find Components`, `--find Composables`. Open the real files before you decide.

## 2. Layouts

### 2.1 Where and what

Layouts live in one folder (`resources/js/Layouts/`, or `resources/views/layouts/` for Blade/Livewire). Every authenticated layout is made of the same three parts:

| Part | Contains |
|---|---|
| **Header** | Brand or logo, global search (when there is lots of content), notifications, user menu, tenant/company switcher (multi-tenant), sidebar toggle on mobile |
| **Sidebar** | Grouped navigation, active state, permission-filtered, collapsible, becomes a drawer below `lg` |
| **Main** | `PageHeader` (title, breadcrumbs, primary action) and the page content slot; flash/toast outlet |

Rules:
- **One layout file per audience and shape**, built from shared partials (`AppHeader`, `AppSidebar`, `SidebarGroup`, `MobileNav`). Admin side and client side are separate guards (ACCESS.md) and get separate layouts. Never one layout full of `if admin`.
- Navigation comes from **one config** (`config/navigation.ts` or a shared Inertia prop), filtered by `can()` permissions. Never hard-code menu items in a page. Hidden menu items are convenience only; the server still authorizes.
- Pages declare their layout (Inertia persistent layout: `defineOptions({ layout: AppLayout })`) so the sidebar does not remount between visits.
- If the layout you need does not exist, **create it first**, once, then build the page. Do not start with a page and bolt a header on later.
- Nested layouts for sub-areas (for example `SettingsLayout` inside `AppLayout`, with a secondary nav).

### 2.2 Choose the layout by app type

The header and sidebar are always there for authenticated work; what goes in them depends on the app.

| App type | Header | Sidebar | Notes |
|---|---|---|---|
| Admin / back-office / CRUD | Search, notifications, user menu | Grouped modules, collapsible | Tables and modals first |
| Multi-tenant SaaS | Tenant/workspace switcher, search, user menu | Modules, plan or usage hint at the bottom | Tenant always visible |
| HRIS / ERP / finance | Search, period or branch filter, user menu | Many modules in collapsible groups | Dense data: keep one pattern per page type |
| Booking / appointment | Today, quick "New booking", notifications | Calendar, bookings, customers, services, settings | Calendar is the home page |
| Ecommerce seller / merchant dashboard | Store switcher, notifications | Orders, products, customers, marketing, settings | KPI cards then tables |
| POS / cashier | Compact: store, shift, user | Icon-only rail or none; large touch targets | Speed over density; exception to "full sidebar", record it |
| Client / customer portal | Brand, user menu | Short sidebar (5 items or fewer) or top nav | Simpler language, fewer features |
| Public storefront / marketing | Brand, nav, search, cart | Filter sidebar only on listing pages | Blade for SEO (TEAM.md Section 8.1) |
| Auth (login, register, reset) | none | none | `GuestLayout`: centered card |
| Wizard / onboarding | Brand, "save and exit" | Step list in place of nav | Linear flow |

An exception to header + sidebar is allowed only when this table says so or the user asks; write it in the Team Brief.

## 3. Page anatomy

```
Layout (header + sidebar)
  PageHeader        title, breadcrumbs, description, primary action (one)
  Toolbar           search, filters, view switch (tabs)
  Content           table | cards | form sections | detail tabs
  Modals / Drawers  owned by the page, opened by the page's composables
```

The page file is thin: receive Inertia props, call composables, compose components. No business logic (AGENTS.md), no repeated markup, no raw styling of things a component already covers. If a page passes about 250 lines, split it.

## 4. Components

### 4.1 Decision order (every element, every page)

1. **Existing project component** (`ai:context --find`). Use it as is.
2. **Kit component** (the chosen UI kit). Wrap it once in `Components/ui` if the project needs a house default.
3. **Build one reusable component** from the layout's tokens and the kit's utilities. Generic name, props and slots, no page knowledge (`StatusBadge`, not `InvoiceStatusBadge`).
4. **Page-specific component** only when it truly belongs to one page (`Pages/Invoices/partials/`). If a second page needs it, promote it to a shared component then.

A reusable "CSS component" (shared class such as `.btn` or `.card` in `@layer components`) is allowed when a Vue component would be overkill, but only for patterns shared by several pages. **No page-scoped one-off CSS** and no arbitrary values repeated across files. Tokens (colors, radius, spacing, font) are set once in the Tailwind theme.

**Always reused, never rebuilt per page:** tabs, buttons, form fields, modal/drawer shell, confirm dialog, cards, badges, table, pagination, filter bar, empty state, skeleton, toast/alert, dropdown menu, page header, breadcrumbs.

### 4.2 Component catalog (create once, reuse everywhere)

| Group | Components |
|---|---|
| Actions | `Button` (primary, secondary, ghost, danger; sizes; loading), `IconButton`, `DropdownMenu` |
| Fields | `TextField`, `TextareaField`, `SelectField`, `Checkbox`, `Toggle`, `RadioGroup`, `DateField`, `FileField`, `MoneyField`, `SearchInput`. Each has label, hint, error, required marker and `v-model` |
| Containers | `Card`, `StatCard`, `Section` (form group with title), `Tabs` / `TabPanel`, `Accordion` |
| Overlays | `Modal` (size, title, footer slot), `Drawer`, `ConfirmDialog` |
| Data | `DataTable` (sort, select, row actions, mobile cards), `Pagination`, `FilterBar`, `BulkActionBar`, `Badge` / `StatusBadge`, `Avatar` |
| Feedback | `Alert`, `Toast`, `EmptyState`, `Skeleton`, `Spinner`, `ErrorState` |
| Navigation | `PageHeader`, `Breadcrumbs`, `Stepper` |

Build only what the page needs now, but build it generic. The first page that needs a `Tabs` creates the real `Tabs`; the second page reuses it.

### 4.3 Props contract

- Typed props (`defineProps<{ ... }>()`), typed emits, `defineModel` for `v-model`.
- Variants and sizes are union types (`variant: 'primary' | 'secondary' | 'danger'`), not a pile of booleans.
- Content through slots (`#header`, `#footer`, `#actions`, `#empty`), data through props.
- UI components never fetch, never call the router, never know a model. Pages and composables do.
- Accessibility inside the component: labels tied to inputs, `aria-*`, focus ring, keyboard, focus trap and `Esc` in overlays.
- Changing a shared component: add an optional prop with the old behavior as default. Never change existing behavior silently.

### 4.4 Component manifest (write it before coding)

For every page, list what it uses. This is part of the Team Brief.

| Component | Source | Props / slots it needs | Used by |
|---|---|---|---|
| `Tabs` | existing | `tabs`, `v-model` | Show, Settings |
| `InvoicePreviewCard` | new, page-specific | `invoice` | Show |
| `StatusBadge` | new, shared | `status`, `map` | Index, Show |

Build the missing shared components first, then the page.

## 5. Composables

Location: `resources/js/Composables/` (`resources/js/hooks/` for React). Name: `useXxx`.

| Put in a composable | Example |
|---|---|
| Open/close state with a selected record | `useModal`, `useDrawer` |
| Confirm before a destructive action | `useConfirm` |
| List query state synced with the URL (search, filters, sort, page) and Inertia partial reload | `useDataTable`, `useFilters` |
| Tab state kept in `?tab=` | `useTabs` |
| Form helper (wraps Inertia `useForm`: submit, errors, reset, toast, unsaved-changes guard) | `useAppForm` |
| Permissions from shared props | `usePermission` (`can('invoices.create')`) |
| Flash and toast | `useToast` |
| Debounce, clipboard, breakpoints | `useDebounce`, `useClipboard`, `useBreakpoint` |
| Formatting (money, date, number) | `useFormat` (or pure functions in `utils/`) |

Rules:
- Composable = reusable **UI state and behavior**. Component = markup. Pure function with no state = `utils/`. Business rules = Service class on the server (AGENTS.md).
- A composable that two pages need is shared from day one. Do not copy it into a page.
- Page-only logic that is small stays in the page; if it grows or repeats, extract it.

## 6. UX decision-making

Decide like a frontend and UX expert: choose what is good for the user, then build it. Before drawing anything, answer four questions and write the answers in the UX Decision Record (Section 8):

1. **Who** uses this page and how often (daily power user, occasional user, customer)?
2. **What** is the main task, and what is the one primary action?
3. **How much** data and how many fields (rows, columns, fields, states)?
4. **How risky** is a mistake (money, deletion, permissions)?

### 6.1 Too many elements on one page: break it down

| Situation | Do this |
|---|---|
| A form with more than about 7 fields or 2 groups | Group into sections; put it in a **modal with tabs** (or a **stepper** if the order matters) |
| A form with about 12+ fields, files, or nested lists | A **dedicated Create/Edit page** with sections and a sticky action bar |
| 1 to 5 simple fields | A **modal** or **drawer**; for one value, **inline edit** |
| List with many columns | Show the 4 to 6 that decide a click; the rest in a detail drawer or detail page |
| Record with many related areas | **Detail page with tabs** (Overview, Activity, Documents, ...), URL-synced, each tab loaded only when opened |
| Dashboard with many widgets | 3 to 5 KPI cards, then one chart and one table; everything else on a sub-page reached from "View all" |
| Settings with many options | `SettingsLayout` with a secondary nav, one topic per page |
| Long process | `Stepper`, progress shown, draft saved |
| Rarely used options | Progressive disclosure: "Advanced" accordion or filter panel, collapsed by default |

The broken-out parts must **navigate to each other**: the table row opens the drawer or detail page, the detail page links back with breadcrumbs, a modal's success state returns to the list and refreshes only the data that changed. No dead ends.

### 6.2 Page, modal, drawer, or tab

| Use | When |
|---|---|
| **Page** | Needs its own URL, is long, needs back/refresh, is shared by link, or is the main work of the user |
| **Modal** | Short, focused task that returns to the list: create, edit a few fields, confirm. One level only; never a modal inside a modal |
| **Drawer** | View or edit while keeping the list visible; quick detail |
| **Tabs** | Peer views of the same record or the same list; keep tab state in the URL |
| **Confirm dialog** | Destructive or irreversible action, with the specific consequence in the text |

Modals and drawers are owned by the page (state through `useModal`), open from a row action or a primary button, and trap focus. If a modal needs deep links, drive it with a query string.

### 6.3 Patterns that apply everywhere

- **Hierarchy:** one primary action per view; destructive actions are visually separate and red; the same action has the same label and place on every page.
- **Navigation:** at most about 7 top-level sidebar items, grouped by the user's job (not by database tables); breadcrumbs when depth is 3 or more; active state always visible.
- **Tables:** table-first for lists. Search, filters, sort, server-side pagination, at most 2 visible row actions (rest in a menu), bulk action bar, sticky header, mobile becomes a card list.
- **Forms:** single column, label above the field, grouped sections, correct input types, inline validation after blur plus server errors on submit, data kept on error, submit disabled with a spinner while processing, unsaved-changes guard, sensible defaults.
- **Feedback:** toast for success, inline message for errors, specific confirm text ("Delete 3 invoices?"), undo when it is possible, no silent failures.
- **States (all of them):** loading (skeleton, not a blank page), empty (with the next action), no results after filtering (with "Clear filters"), error (with retry), forbidden, success, disabled, very long text, 0, 1 and many records.
- **Responsive:** design for mobile first; touch targets at least 44px; tables become cards; sidebar becomes a drawer.
- **Accessibility:** contrast 4.5:1, visible focus, full keyboard use, labels on every control, no information by color alone, `Esc` closes overlays.
- **Speed that users feel:** skeletons, Inertia partial reloads (`only`), deferred props for heavy blocks, lazy tab content, debounced search, optimistic updates only when a failure is harmless.
- **Copy:** verbs on buttons ("Save changes", not "Submit"), plain words, the user's language and terms.

## 7. Build order for every page

1. **Inspect:** layout, kit, components, composables (`ai:context --find`).
2. **Layout:** pick it by app type (Section 2.2); create it first if missing.
3. **UX Decision Record:** answer the four questions, choose page/modal/drawer/tab, decide the breakdown.
4. **Component manifest:** reuse, kit, or new; list props and slots.
5. **Shared pieces first:** new components, then composables.
6. **Pages:** thin pages that compose them, with every state from Section 6.3.
7. **Check:** the UX Reviewer checklist (Section 9); Playwright for the main journey, validation failure and authorization denial (PLAYWRIGHT.md); `npm run ai:gate`.

## 8. Team Brief additions (UI work)

Add these to the Team Brief for any task that touches a screen:

```
LAYOUT: <layout file> (app type: <type>) | new layout? <yes/no>
UX DECISIONS:
| Page / flow | User goal | Pattern (page/modal/drawer/tab/step) | Why | Rejected alternative |
COMPONENT MANIFEST: (table from Section 4.4)
COMPOSABLES: <existing used> | <new, with purpose>
SHARED FILES CHANGED: <none, or file + backward-compatible change>
STATES COVERED: loading, empty, no-results, error, forbidden, validation
```

## 9. UX Reviewer checklist

The reviewer is not the author. Findings get severity (F-n) like any review.

- [ ] Page uses a layout from the layouts folder; no page-level header or sidebar.
- [ ] Navigation comes from the config and is permission-filtered; server authorizes anyway.
- [ ] No copy-pasted markup: tabs, buttons, fields, modal shell, cards, table, badges are shared components.
- [ ] New components are generic, typed, slot-based, accessible; no business logic or fetching inside.
- [ ] Logic that repeats or grows lives in composables; the page file is thin.
- [ ] Dense screens are broken into pages, modals, drawers or tabs per Section 6, and they navigate to each other.
- [ ] One primary action per view; destructive actions are confirmed with specific text.
- [ ] Forms follow Section 6.3; errors show next to the field; data is kept on failure.
- [ ] All states exist (loading, empty, no-results, error, forbidden).
- [ ] Mobile layout works; keyboard and focus work in overlays.
- [ ] No shared layout or component was changed silently; any change is backward compatible and flagged.
- [ ] No page-scoped one-off CSS; tokens come from the theme.

## 10. Do not

- Do not start a page without choosing its layout.
- Do not build a second `Tabs`, `Button`, `Modal`, or field because the first "does not quite fit"; add an optional prop or ask.
- Do not put every field, table and chart on one screen "so nothing is hidden".
- Do not open a modal from a modal.
- Do not put business logic, API calls or permission rules in UI components.
- Do not add a UI package without the intake checklist in PACKAGES.md.
- Do not hard-code mock data in a screen unless a prototype was requested (AGENTS.md).

## 11. Report

End UI work with: layout used, components reused vs created, composables used vs created, the UX decisions (one line each), states covered, shared files changed (or "none"), and what was **Tested / Not Tested** (a screen not opened in a browser is Not Tested).

## 12. Equivalents for other stacks

| Concept | Vue + Inertia | React + Inertia | Livewire / Blade |
|---|---|---|---|
| Layouts | `Layouts/*.vue`, `defineOptions({ layout })` | `Layouts/*.tsx`, `Page.layout` | `resources/views/layouts/*.blade.php` |
| Shared components | `Components/ui/*.vue` | `Components/ui/*.tsx` | `resources/views/components/*.blade.php` (anonymous components) |
| Composables | `Composables/useX.ts` | `hooks/useX.ts` | Livewire traits and Alpine stores |
| Modal state | `useModal` | `useModal` | Livewire property + Alpine `x-data` |
| Tab state in URL | `useTabs` (`?tab=`) | `useTabs` (`?tab=`) | `#[Url]` property |
