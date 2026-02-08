import type { Renderable } from "../Renderable"

export const enum EventPhase {
  NONE = 0,
  CAPTURE = 1,
  AT_TARGET = 2,
  BUBBLE = 3,
}

export class TUIEvent {
  readonly type: string
  target: Renderable | null = null
  currentTarget: Renderable | null = null
  eventPhase: EventPhase = EventPhase.NONE

  private _propagationStopped = false
  private _immediatePropagationStopped = false
  private _defaultPrevented = false

  constructor(type: string) {
    this.type = type
  }

  get propagationStopped(): boolean {
    return this._propagationStopped
  }

  get defaultPrevented(): boolean {
    return this._defaultPrevented
  }

  stopPropagation(): void {
    this._propagationStopped = true
  }

  stopImmediatePropagation(): void {
    this._propagationStopped = true
    this._immediatePropagationStopped = true
  }

  preventDefault(): void {
    this._defaultPrevented = true
  }

  /** @internal */
  get _immediateStopped(): boolean {
    return this._immediatePropagationStopped
  }
}
