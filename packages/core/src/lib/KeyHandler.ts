import { EventEmitter } from "events"
import { parseKeypress, type KeyEventType, type ParsedKey } from "./parse.keypress"
import type { Renderable } from "../Renderable"
import { TUIEvent } from "./event"
import { dispatchEvent } from "./event-dispatch"

export class KeyEvent extends TUIEvent implements ParsedKey {
  name: string
  ctrl: boolean
  meta: boolean
  shift: boolean
  option: boolean
  sequence: string
  number: boolean
  raw: string
  eventType: KeyEventType
  source: "raw" | "kitty"
  code?: string
  super?: boolean
  hyper?: boolean
  capsLock?: boolean
  numLock?: boolean
  baseCode?: number
  repeated?: boolean

  constructor(key: ParsedKey, type: string = key.eventType === "release" ? "keyrelease" : "keypress") {
    super(type)
    this.name = key.name
    this.ctrl = key.ctrl
    this.meta = key.meta
    this.shift = key.shift
    this.option = key.option
    this.sequence = key.sequence
    this.number = key.number
    this.raw = key.raw
    this.eventType = key.eventType
    this.source = key.source
    this.code = key.code
    this.super = key.super
    this.hyper = key.hyper
    this.capsLock = key.capsLock
    this.numLock = key.numLock
    this.baseCode = key.baseCode
    this.repeated = key.repeated
  }
}

export class PasteEvent extends TUIEvent {
  text: string

  constructor(text: string) {
    super("paste")
    this.text = text
  }
}

export type KeyHandlerEventMap = {
  keypress: [KeyEvent]
  keyrelease: [KeyEvent]
  paste: [PasteEvent]
}

export class KeyHandler extends EventEmitter<KeyHandlerEventMap> {
  protected useKittyKeyboard: boolean

  constructor(useKittyKeyboard: boolean = false) {
    super()
    this.useKittyKeyboard = useKittyKeyboard
  }

  public processInput(data: string): boolean {
    const parsedKey = parseKeypress(data, { useKittyKeyboard: this.useKittyKeyboard })

    if (!parsedKey) {
      return false
    }

    try {
      switch (parsedKey.eventType) {
        case "press":
          this.emit("keypress", new KeyEvent(parsedKey))
          break
        case "release":
          this.emit("keyrelease", new KeyEvent(parsedKey))
          break
        default:
          this.emit("keypress", new KeyEvent(parsedKey))
          break
      }
    } catch (error) {
      console.error(`[KeyHandler] Error processing input:`, error)
      return true
    }

    return true
  }

  public processPaste(data: string): void {
    try {
      const cleanedData = Bun.stripANSI(data)
      this.emit("paste", new PasteEvent(cleanedData))
    } catch (error) {
      console.error(`[KeyHandler] Error processing paste:`, error)
    }
  }
}

/**
 * Internal key handler used by the renderer. Routes keyboard and paste events
 * through the capture/bubble dispatch system on the renderable tree.
 *
 * Global handlers registered via .on() run first (conceptually "above" root
 * in capture order), then the event dispatches through the renderable tree
 * via the standard capture/bubble path.
 */
export class InternalKeyHandler extends KeyHandler {
  private root: Renderable | null = null
  private focusedRenderableProvider: (() => Renderable | null) | null = null

  constructor(useKittyKeyboard: boolean = false) {
    super(useKittyKeyboard)
  }

  public setRoot(root: Renderable): void {
    this.root = root
  }

  public setFocusedRenderableProvider(provider: () => Renderable | null): void {
    this.focusedRenderableProvider = provider
  }

  public override emit<K extends keyof KeyHandlerEventMap>(event: K, ...args: KeyHandlerEventMap[K]): boolean {
    const root = this.root
    if (!root) return false

    const tuiEvent = args[0]
    const focused = this.focusedRenderableProvider?.()
    const target = focused && !focused.isDestroyed ? focused : root
    tuiEvent.target = target

    // Global listeners run first, before tree dispatch. They act as
    // capture-phase handlers "above" root — always first, deterministic order.
    for (const listener of this.listeners(event as string)) {
      try {
        ;(listener as Function)(tuiEvent)
      } catch (err) {
        console.error(`[KeyHandler] Error in global ${event} handler:`, err)
      }
      if (tuiEvent.propagationStopped || tuiEvent._immediateStopped) break
    }

    // Dispatch through the renderable tree (capture root→target, bubble target→root)
    if (!tuiEvent.propagationStopped) {
      dispatchEvent(tuiEvent)
    }

    return true
  }
}
