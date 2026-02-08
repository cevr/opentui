import type { Renderable } from "../Renderable"
import { EventPhase, type TUIEvent } from "./event"

export interface EventListenerEntry {
  handler: (event: TUIEvent) => void
  capture: boolean
  once: boolean
}

export function buildPropagationPath(target: Renderable): Renderable[] {
  const path: Renderable[] = []
  let current: Renderable | null = target
  while (current) {
    path.push(current)
    current = current.parent
  }
  path.reverse()
  return path
}

export function dispatchEvent(event: TUIEvent): boolean {
  const target = event.target
  if (!target || target.isDestroyed) return false

  const path = buildPropagationPath(target)

  // Capture phase: root → target
  event.eventPhase = EventPhase.CAPTURE
  for (let i = 0; i < path.length; i++) {
    const node = path[i]!
    event.currentTarget = node
    invokeListeners(node, event, true)
    if (event._immediateStopped || event.propagationStopped) break
    if (target.isDestroyed) return true
  }

  // Bubble phase: target → root (includes AT_TARGET on the target node)
  if (!event.propagationStopped) {
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i]!
      event.eventPhase = node === target ? EventPhase.AT_TARGET : EventPhase.BUBBLE
      event.currentTarget = node
      invokeListeners(node, event, false)
      if (event._immediateStopped || event.propagationStopped) break
      if (target.isDestroyed) return true
    }
  }

  event.eventPhase = EventPhase.NONE
  event.currentTarget = null
  return !event.defaultPrevented
}

function invokeListeners(node: Renderable, event: TUIEvent, capturePhase: boolean): void {
  const entries = node._getEventListeners(event.type)
  if (!entries || entries.length === 0) return

  // Snapshot to avoid mutation during iteration
  const snapshot = [...entries]
  for (const entry of snapshot) {
    if (entry.capture !== capturePhase) continue

    try {
      entry.handler.call(node, event)
    } catch (err) {
      console.error(`[EventDispatch] Error in ${event.type} handler on ${node.id}:`, err)
    }

    if (entry.once) {
      node.removeEventListener(event.type, entry.handler, { capture: entry.capture })
    }

    if (event._immediateStopped) return
  }
}
