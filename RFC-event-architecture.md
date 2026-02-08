# RFC: DOM-like Capture/Bubble Event Architecture

## Context

OpenTUI's event handling is fragmented across three models:

- **Keyboard**: `InternalKeyHandler` with 3-tier dispatch (global EventEmitter, scope-aware renderable dispatch, internal `renderableHandlers` Set). The `feat/focus-scope` branch adds dual-path dispatch (`emitScopeFirst` vs `emitGlobalFirst`) based on `findClosestKeyboardScope()`, increasing complexity.
- **Mouse**: Simple parent-chain bubbling via `processMouseEvent()` — closest to DOM but no capture phase.
- **Paste**: Piggybacked onto the keyboard handler path.

This creates a growing set of special cases: `trapFocus` needs scope-first dispatch, global handlers need global-first dispatch, `InternalKeyHandler` maintains parallel listener stores, `focusedRenderableProvider` inverts renderer state into the key handler, and framework hooks must explicitly discover scopes.

A unified capture/bubble model eliminates all of this.

## Proposal

All propagating events (keyboard, mouse, paste) follow a two-phase dispatch through the renderable tree:

1. **Capture** (root → target): Listeners registered with `{ capture: true }` fire top-down
2. **Bubble** (target → root): Listeners registered without capture fire bottom-up

### Event Target Resolution

| Event Type | Target |
|---|---|
| `keypress`, `keyrelease`, `paste` | Currently focused renderable (or root if null) |
| `mousedown`, `mouseup`, etc. | Hit-test result (existing) |
| `resize` | Root only, no propagation |

### Propagation

```
path = [root, ..., grandparent, parent, target]
```

- **Capture**: Walk path forward, invoke capture listeners
- **Target**: Invoke both capture and bubble listeners
- **Bubble**: Walk path backward, invoke bubble listeners
- `stopPropagation()` halts traversal after current node
- `stopImmediatePropagation()` halts remaining listeners on current node too
- `preventDefault()` suppresses default behavior (e.g., `handleKeyPress`)

### Listener API

New methods on `Renderable`:

```typescript
addEventListener(type: string, handler: (event: TUIEvent) => void, options?: { capture?: boolean; once?: boolean }): void
removeEventListener(type: string, handler: (event: TUIEvent) => void, options?: { capture?: boolean }): void
```

Existing `.on("keypress")` and property handlers (`onKeyDown`, `onMouse*`) become sugar for bubble-phase `addEventListener`.

### Event Base Type

```typescript
class TUIEvent {
  readonly type: string
  readonly target: Renderable
  currentTarget: Renderable | null
  eventPhase: EventPhase  // NONE | CAPTURE | AT_TARGET | BUBBLE

  stopPropagation(): void
  stopImmediatePropagation(): void
  preventDefault(): void
}
```

`KeyEvent`, `PasteEvent`, `MouseEvent` extend `TUIEvent`.

## What This Simplifies

### trapFocus

Becomes a bubble-phase listener that calls `stopPropagation()`:

```typescript
// On scope activation:
this.addEventListener("keypress", (e) => {
  if (e instanceof KeyEvent && e.ctrl && e.name === "c") return
  e.stopPropagation()
})
```

Events bubble up from the focused renderable, hit the scope boundary, stop. No `findClosestKeyboardScope` dispatch logic. No `emitScopeFirst`/`emitGlobalFirst`.

### Global Handlers

Become capture-phase listeners on root:

```typescript
// renderer.keyInput.on("keypress", handler)
// internally becomes:
root.addEventListener("keypress", handler, { capture: true })
```

Root capture fires first — before any scope trapper on bubble. `preventDefault()` blocks default behavior. `stopPropagation()` prevents the event from reaching the target.

### Framework Hooks

```typescript
useKeyboard(handler, { ref, capture })
// → ref.current.addEventListener("keypress", handler, { capture })
// Falls back to root if no ref
```

No `findClosestKeyboardScope` needed. Tree topology handles isolation.

### InternalKeyHandler

Collapses to a thin bridge:

```typescript
emit(event, ...args) {
  const target = focusedRenderable ?? root
  const tuiEvent = new KeyEvent(target, args[0])
  dispatchEvent(tuiEvent)
}
```

All tier logic, scope detection, and parallel listener stores deleted.

## What Gets Deleted

- `InternalKeyHandler.renderableHandlers` / `onInternal` / `offInternal`
- `emitScopeFirst` / `emitGlobalFirst` / `emitGlobalListeners` / `emitInternalListeners`
- `eventPreventedOrStopped` / `eventPropagationStopped`
- `Renderable.processMouseEvent` / `processKeyEvent` / `processKeyReleaseEvent` / `processPasteEvent`
- `_internalKeyInput` on `RenderContext`

## Edge Cases

- **Ctrl+C**: Root capture listener, fires before any scope bubble trapper
- **Destroyed during dispatch**: Check `target.isDestroyed` after each listener
- **No focused renderable**: Target = root
- **Auto-focus on click**: Post-dispatch in renderer, checks `defaultPrevented`

## Event Type Naming

Mouse events rename for consistency: `"down"` → `"mousedown"`, `"up"` → `"mouseup"`, etc. Keyboard/paste names unchanged.

## Performance

Path building is O(depth), depth is typically 3-8 nodes. Keyboard events arrive at human typing speed (~8/sec). Negligible overhead.
