# Visual Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小幅视觉优化：增加科技感、减小卡片圆角、将主题切换移至顶部右侧

**Architecture:** Three independent changes: (1) relocate ThemeToggle from sidebar bottom to header right side for all viewports, (2) reduce card border-radius from `rounded-xl` to `rounded-lg` across the UI, (3) add tech-inspired visual effects — subtle glow on cards in dark mode, gradient accent on header border, and a cyan-accent variable for tech feel.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui base-nova, @base-ui/react, next-themes, Lucide icons

## Global Constraints

- All changes must work in both light and dark mode
- No new dependencies — use existing Tailwind + CSS only
- Mobile-first: test collapsed sidebar + mobile Sheet
- Keep existing component APIs unchanged (no prop changes)

---

### Task 1: Move ThemeToggle to Header Right Side

**Files:**
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` from `./theme-toggle` (existing export, no changes)
- Produces: No new exports. ThemeToggle is now visible at all breakpoints in header, removed from sidebar.

- [ ] **Step 1: Add ThemeToggle to header right side, remove mobile-only restriction**

Open `src/components/layout/header.tsx`. Change the right-side div from `md:hidden` to always-visible:

```tsx
// Before (line 54):
<div className="md:hidden">
  <ThemeToggle />
</div>

// After:
<div className="flex items-center gap-2">
  <ThemeToggle />
</div>
```

The full header should now read:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const BREADCRUMB_MAP: Record<string, string> = {
  "/": "仪表盘",
  "/stocks": "个股分析",
  "/industry": "行业分析",
  "/sentiment": "舆情分析",
  "/financials": "财报 & 研报",
  "/agents": "Agent 管理",
  "/settings": "设置",
};

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [{ label: "仪表盘", href: "/" }];

  let current = "";
  for (const seg of segments) {
    current += `/${seg}`;
    const label = BREADCRUMB_MAP[current] || seg.toUpperCase();
    crumbs.push({ label, href: current });
  }

  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/40">/</span>}
            <span
              className={cn(
                i === breadcrumbs.length - 1 && "text-foreground font-medium"
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      {/* Right side: theme toggle (all viewports) */}
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Remove ThemeToggle from sidebar bottom actions**

Open `src/components/layout/sidebar.tsx`. Remove the `ThemeToggle` import and its usage.

First, remove the import (line 8):
```tsx
// Remove this line:
import { ThemeToggle } from "./theme-toggle";
```

Then, in the `sidebarContent` JSX, change the bottom actions div (lines 111-128):

```tsx
// Before:
<div className="border-t border-sidebar-border p-3 flex items-center gap-2">
  {!collapsed && <ThemeToggle />}
  <Button
    variant="ghost"
    size="icon"
    className={cn(
      "h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground",
      collapsed && "mx-auto"
    )}
    onClick={toggle}
  >
    {collapsed ? (
      <ChevronRight className="h-4 w-4" />
    ) : (
      <ChevronLeft className="h-4 w-4" />
    )}
  </Button>
</div>

// After:
<div className="border-t border-sidebar-border p-3 flex items-center justify-center">
  <Button
    variant="ghost"
    size="icon"
    className={cn(
      "h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
    )}
    onClick={toggle}
  >
    {collapsed ? (
      <ChevronRight className="h-4 w-4" />
    ) : (
      <ChevronLeft className="h-4 w-4" />
    )}
  </Button>
</div>
```

- [ ] **Step 3: Verify the changes compile**

Run: `cd D:/trading/open-trading && npx tsc --noEmit`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/header.tsx src/components/layout/sidebar.tsx
git commit -m "feat: move theme toggle from sidebar to header right side"
```

---

### Task 2: Reduce Card Border-Radius

**Files:**
- Modify: `src/components/ui/card.tsx` — change card's `rounded-xl` → `rounded-lg`
- Modify: `src/components/ui/card.tsx` — change child corners to match
- Modify: `src/app/loading.tsx` — change skeleton corners to match

**Interfaces:**
- Consumes: CSS variable `--radius` from `globals.css` (unchanged)
- Produces: Cards now use `rounded-lg` (~10px) instead of `rounded-xl` (~14px), giving a sharper, more "tech/dashboard" aesthetic

- [ ] **Step 1: Update card border-radius**

Open `src/components/ui/card.tsx`. Change all `rounded-xl` to `rounded-lg` and child corner classes to match:

```tsx
// Card component (line 15): rounded-xl → rounded-lg, and child corners
// Before:
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",

// After:
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
```

CardHeader (line 27): `rounded-t-xl` → `rounded-t-lg`:
```tsx
// Before:
"group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",

// After:
"group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
```

CardFooter (line 87): `rounded-b-xl` → `rounded-b-lg`:
```tsx
// Before:
"flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",

// After:
"flex items-center rounded-b-lg border-t bg-muted/50 p-(--card-spacing)",
```

- [ ] **Step 2: Update loading skeleton corners**

Open `src/app/loading.tsx`. Change `rounded-xl` → `rounded-lg` on skeleton placeholders:

```tsx
// Lines 12 and 16-18: rounded-xl → rounded-lg
<Skeleton key={i} className="h-[104px] rounded-lg" />
// ...
<Skeleton className="h-[280px] rounded-lg" />
<Skeleton className="h-[280px] rounded-lg" />
<Skeleton className="h-[280px] rounded-lg" />
```

The full updated file:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function GlobalLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
        <Skeleton className="h-[280px] rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the changes compile**

Run: `cd D:/trading/open-trading && npx tsc --noEmit`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/card.tsx src/app/loading.tsx
git commit -m "feat: reduce card border-radius from rounded-xl to rounded-lg"
```

---

### Task 3: Add Tech-Inspired Visual Effects

**Files:**
- Modify: `src/app/globals.css` — add tech accent colors, card glow, and header gradient
- Modify: `src/components/ui/card.tsx` — add subtle tech-effect class to card

**Interfaces:**
- Consumes: Existing CSS variable system. No component API changes.
- Produces: New CSS custom properties (`--accent-tech`, `--card-glow`), card receives subtle dark-mode glow, header gains gradient bottom-border highlight.

- [ ] **Step 1: Add tech accent colors and card glow to globals.css**

Open `src/app/globals.css`. Add new CSS variables and effects.

Add after the existing `@theme inline` block (after line 49), before the `:root` block:

```css
@theme inline {
  /* ... existing theme variables remain unchanged ... */
  --color-accent-tech: var(--accent-tech);
}
```

Wait — that's the wrong approach. `@theme inline` maps CSS variables to Tailwind utility classes. Since we don't need Tailwind utility classes for these (we'll reference them as CSS custom properties directly), we should just add them to `:root` and `.dark`.

Add to `:root` (after line 76, before the closing `}`):

```css
:root {
  /* ... existing variables ... */
  --radius: 0.625rem;
  /* ... existing sidebar variables ... */
  --sidebar-ring: oklch(0.708 0 0);
  /* NEW: tech accent */
  --accent-tech: oklch(0.62 0.18 200); /* cyan accent for tech feel */
  --card-glow: none;
}
```

Add to `.dark` (after line 117, before the closing `}`):

```css
.dark {
  /* ... existing variables ... */
  --sidebar-ring: oklch(0.556 0 0);
  /* NEW: tech glow for dark mode */
  --accent-tech: oklch(0.7 0.18 200);
  --card-glow: 0 0 1px 0 oklch(0.7 0.18 200 / 15%);
}
```

- [ ] **Step 2: Add card glow in dark mode via card.tsx**

Open `src/components/ui/card.tsx`. Add a subtle glow effect to the Card component:

```tsx
// In the Card function, add shadow-[var(--card-glow)] to the className:
// Before (line 15):
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",

// After (add hover glow and shadow transition):
"group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg bg-card py-(--card-spacing) text-sm text-card-foreground shadow-[var(--card-glow)] ring-1 ring-foreground/10 transition-shadow duration-300 hover:ring-foreground/15 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
```

The key additions:
- `shadow-[var(--card-glow)]` — applies the glow only in dark mode (invisible in light mode since `--card-glow: none`)
- `transition-shadow duration-300` — smooth glow transition
- `hover:ring-foreground/15` — ring intensifies slightly on hover

- [ ] **Step 3: Add header gradient accent border**

Open `src/components/layout/header.tsx`. Add a subtle gradient accent to the header bottom border:

```tsx
// Before:
<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">

// After: add relative positioning and a gradient accent bar
<header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 after:absolute after:bottom-0 after:left-0 after:h-[1px] after:w-full after:bg-gradient-to-r after:from-transparent after:via-[var(--accent-tech)]/30 after:to-transparent">
```

- [ ] **Step 4: Verify build**

Run: `cd D:/trading/open-trading && npx tsc --noEmit`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/ui/card.tsx src/components/layout/header.tsx
git commit -m "feat: add tech-inspired visuals — card glow, cyan accent, header gradient"
```

---

### Verification Checklist

After all tasks are complete, verify:

1. **Theme toggle appears in header right** — visible on desktop and mobile, icon-only button with dropdown (亮色/暗色/跟随系统)
2. **Theme toggle removed from sidebar** — bottom bar only shows collapse toggle button
3. **Card border-radius reduced** — cards at 10px radius (`rounded-lg`) not 14px (`rounded-xl`); inner corners match
4. **Dark mode card glow** — toggle to dark mode, each card has a subtle cyan-tinged outer glow
5. **Header accent** — header bottom border has a subtle gradient accent (visible in both modes)
6. **Light mode unaffected** — no glow visible, cards render cleanly
7. **Mobile sidebar** — Sheet-based sidebar still works, no regressions
8. **Build passes** — `npm run build` succeeds with no errors
