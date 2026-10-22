# PROJECT KNOWLEDGE BASE

**Generated:** 2026-10-18
**Commit:** 260d380
**Branch:** main

## OVERVIEW

Local-first design studio (Vite + React 18 + TypeScript). Ports core concepts of [jangtrinh/design-os-studio](https://github.com/jangtrinh/design-os-studio) (Rust) to the web: NodeSpec document model, auto-layout engine, live Light/Dark design variables, Dev Mode codegen. No backend, no telemetry; data lives in localStorage + exported JSON. Deployed: https://younghai.github.io/design-studio/

## STRUCTURE

```
src/
├── model/     # Pure domain — NO React imports allowed
│   ├── types.ts        # StudioNode/LayoutSpec/Document/VariableCollection, textWidth/textHeight approximations
│   ├── variables.ts    # $alias resolution (recursive, depth-8 cap, unknown alias → literal)
│   ├── relayout.ts     # relayoutTree: bottom-up sizing (hug/fixed/fill) + top-down placement
│   └── fixtures.ts     # NodeSpec(snake_case) → model(camelCase) parser, preset table, default collections
├── state/store.tsx     # useReducer + Context. Undo = document snapshots, cap 50
├── canvas/CanvasView.tsx  # DOM rendering + all pointer interactions; drags commit once on pointerup
├── panels/             # Toolbar, LayersPanel, Inspector, VariablesPanel
├── devmode/            # codegen.ts (pure: toReact/toCss/toTailwind) + CodegenPanel
├── io/documentIo.ts    # validateSpec/validateDocument (atomic), export blob, localStorage autosave
└── app/                # shortcuts.ts (window keydown), ErrorBoundary
```

## WHERE TO LOOK

| Task | Location |
| --- | --- |
| Add codegen target (SwiftUI, Compose…) | `src/devmode/codegen.ts` — add `to<Target>`, register in CodegenPanel tabs |
| Change layout math | `src/model/relayout.ts` (sizeNode/placeChildren) |
| Add a variable token | `src/model/fixtures.ts` collections (`CORE_COLLECTION`, `EASEUI_COLLECTION`) |
| Undo/redo behavior | `src/state/store.tsx` (`withUndo` call sites define what is undoable) |
| Keyboard shortcuts | `src/app/shortcuts.ts` (canvas-local: Space pan lives in CanvasView) |
| NodeSpec field mapping | in: `fixtures.ts specNodeToNode` · out: `documentIo.ts specFromDocument` |
| CI/deploy | `.github/workflows/deploy.yml` (push main → build → Pages) |

## CONVENTIONS (deviations only)

- `src/model/` stays framework-free. It must import nothing from React/DOM.
- `$`-prefixed color = variable alias (`$collection.path`). Unresolvable aliases render literally, never throw.
- `relayoutTree` is pure: clones input, never mutates. Callers re-run it per render (memoized on `doc.root`).
- Undo discipline: document mutations push one snapshot; UI state (tool/zoom/pan/selection) and `mode` never do. `mode` is view-state — undo/redo preserve the current mode; autosave restore (`restore` action) pushes nothing; explicit import/spec-apply (`load-document`) is undoable.
- Pointer drags keep live geometry in `dragRef.latest` (mutable ref) and dispatch exactly ONE action on pointerup. Never commit from React state — same-frame move+up races exist.
- Storage: key `design-studio-doc-v1`, `schemaVersion: 1`. Mismatch ⇒ discard silently (import surfaces the error, autosave just drops).
- `.npmrc`/`pnpm-workspace.yaml` are LOCAL-ONLY (shared pnpm store at `../.pnpm-store` per workspace policy) and untracked. CI uses pnpm defaults. Do not commit them.
- NodeSpec JSON (external format) is snake_case (`font_size`); internal model is camelCase. Only `fixtures.ts`/`documentIo.ts` translate.

## ANTI-PATTERNS (THIS PROJECT)

- No backend, no network calls, no telemetry. Local-first is a product stance, not an accident.
- No state libraries (Redux/Zustand). `useReducer` + Context is the settled choice.
- No new canvas interactions without re-scoping first — the MVP interaction set was frozen by plan (`.omo/plans/design-studio-service.md`, untracked).
- User's global policy: no auto-run tests/lint/build/browser QA after producing work; label skipped checks `검증 미실행 (사용자 전역 정책)`. Commits/pushes only on explicit request.

## UNIQUE STYLES

- UI copy is Korean; code identifiers and comments English.
- Theme tokens are pinned (UI3 port): `#1e1e1e` panel, `#2c2c2c` control, `#0d99ff` selection, `#9747ff` component, `#0c8ce9` dev-mode; Inter 11/12px. CSS vars in `src/theme.css`.

## COMMANDS

```bash
pnpm dev     # dev server, port 5173 (pinned)
pnpm build   # tsc --noEmit + vite build → dist/
```

## NOTES

- QA in embedded browsers: synthetic clicks (CUA/Playwright `click`) do not reach React pointer handlers here. Drive interactions with dispatched native `PointerEvent`/`WheelEvent`/`KeyboardEvent`; file inputs via `DataTransfer` injection. Read results AFTER a React commit (next task/microtask), not synchronously.
- `setPointerCapture` throws for synthetic/embedded pointer ids — already guarded in `beginDrag`.
- Workflow artifacts (plan/ledger/evidence) live in `.omo/` (untracked). Upstream concept source: `/tmp/design-os-studio` clone may not persist.
