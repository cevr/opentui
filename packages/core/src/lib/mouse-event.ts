import type { Renderable } from "../Renderable"
import type { MouseEventType, RawMouseEvent, ScrollInfo } from "./parse.mouse"
import { TUIEvent } from "./event"

export class MouseEvent extends TUIEvent {
  declare readonly type: MouseEventType
  public readonly button: number
  public readonly x: number
  public readonly y: number
  public readonly source?: Renderable
  public readonly modifiers: {
    shift: boolean
    alt: boolean
    ctrl: boolean
  }
  public readonly scroll?: ScrollInfo
  public readonly isDragging?: boolean

  constructor(target: Renderable | null, attributes: RawMouseEvent & { source?: Renderable; isDragging?: boolean }) {
    super(attributes.type)
    this.target = target
    this.button = attributes.button
    this.x = attributes.x
    this.y = attributes.y
    this.modifiers = attributes.modifiers
    this.scroll = attributes.scroll
    this.source = attributes.source
    this.isDragging = attributes.isDragging
  }
}
