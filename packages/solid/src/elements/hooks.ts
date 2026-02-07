import {
  engine,
  FocusScopeRenderable,
  PasteEvent,
  Renderable,
  Selection,
  Timeline,
  type CliRenderer,
  type KeyEvent,
  type TimelineOptions,
} from "@opentui/core"
import { createContext, createSignal, onCleanup, onMount, useContext } from "solid-js"

export const RendererContext = createContext<CliRenderer>()

export const useRenderer = () => {
  const renderer = useContext(RendererContext)

  if (!renderer) {
    throw new Error("No renderer found")
  }

  return renderer
}

export const onResize = (callback: (width: number, height: number) => void) => {
  const renderer = useRenderer()

  onMount(() => {
    renderer.on("resize", callback)
  })

  onCleanup(() => {
    renderer.off("resize", callback)
  })
}

export const useTerminalDimensions = () => {
  const renderer = useRenderer()
  const [terminalDimensions, setTerminalDimensions] = createSignal<{
    width: number
    height: number
  }>({ width: renderer.width, height: renderer.height })

  const callback = (width: number, height: number) => {
    setTerminalDimensions({ width, height })
  }

  onResize(callback)

  return terminalDimensions
}

// ── Scope detection ──────────────────────────────────────────────────

function closestFocusScope(node: Renderable): FocusScopeRenderable | null {
  let current: Renderable | null = node.parent
  while (current) {
    if (current instanceof FocusScopeRenderable) return current
    current = current.parent
  }
  return null
}

// ── Keyboard hooks ───────────────────────────────────────────────────

export interface UseKeyboardOptions {
  /** Include release events - callback receives events with eventType: "release" */
  release?: boolean
  /** Ref to a renderable inside a focus scope. Enables scope-aware dispatch. */
  ref?: () => Renderable
}

export const useKeyboard = (callback: (key: KeyEvent) => void, options?: UseKeyboardOptions) => {
  const renderer = useRenderer()

  onMount(() => {
    const target = (options?.ref ? closestFocusScope(options.ref()) : null) ?? renderer.keyInput
    target.on("keypress", callback)
    if (options?.release) target.on("keyrelease", callback)

    onCleanup(() => {
      target.off("keypress", callback)
      if (options?.release) target.off("keyrelease", callback)
    })
  })
}

export const usePaste = (callback: (event: PasteEvent) => void) => {
  const renderer = useRenderer()
  const keyHandler = renderer.keyInput
  onMount(() => {
    keyHandler.on("paste", callback)
  })

  onCleanup(() => {
    keyHandler.off("paste", callback)
  })
}

/**
 * @deprecated renamed to useKeyboard
 */
export const useKeyHandler = useKeyboard

export const useSelectionHandler = (callback: (selection: Selection) => void) => {
  const renderer = useRenderer()

  onMount(() => {
    renderer.on("selection", callback)
  })

  onCleanup(() => {
    renderer.off("selection", callback)
  })
}

export const useTimeline = (options: TimelineOptions = {}): Timeline => {
  const timeline = new Timeline(options)

  onMount(() => {
    if (options.autoplay !== false) {
      timeline.play()
    }
    engine.register(timeline)
  })

  onCleanup(() => {
    timeline.pause()
    engine.unregister(timeline)
  })

  return timeline
}

// ── Hotkey ────────────────────────────────────────────────────────────

interface ParsedCombo {
  key: string
  ctrl: boolean
  shift: boolean
  meta: boolean // meta/alt/option are treated as the same modifier
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split("+")
  const key = parts.pop()!
  return {
    key,
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta") || parts.includes("alt"),
  }
}

// Normalize key names so combos work regardless of parser output.
// e.g. "space" matches both "space" and " "
const keyAliases: Record<string, string[]> = {
  space: ["space", " "],
}

function matchesCombo(event: KeyEvent, parsed: ParsedCombo): boolean {
  const aliases = keyAliases[parsed.key]
  const keyMatches = aliases ? aliases.includes(event.name) : event.name === parsed.key
  if (!keyMatches) return false
  if (parsed.ctrl !== event.ctrl) return false
  if (parsed.shift !== event.shift) return false
  if (parsed.meta !== event.meta) return false
  return true
}

export interface UseHotkeyOptions {
  when?: () => boolean
  /** Ref to a renderable inside a focus scope. Enables scope-aware dispatch. */
  ref?: () => Renderable
}

/**
 * Declarative hotkey binding.
 *
 * Pass `ref` to make it scope-aware (see `useKeyboard`).
 *
 * @example
 * useHotkey('ctrl+p', () => openCommandPalette())
 * useHotkey('j', () => scrollDown(), { ref: () => boxRef, when: () => !isEditing() })
 */
export const useHotkey = (combo: string, handler: () => void, options?: UseHotkeyOptions) => {
  const parsed = parseCombo(combo)

  useKeyboard(
    (key) => {
      if (options?.when && !options.when()) return
      if (matchesCombo(key, parsed)) {
        handler()
      }
    },
    { ref: options?.ref },
  )
}
