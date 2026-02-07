import type { Renderable } from "../Renderable"

export function collectFocusableDescendants(root: Renderable): Renderable[] {
  const result: Renderable[] = []
  walkFocusable(root, result)
  return result
}

function walkFocusable(node: Renderable, result: Renderable[]): void {
  for (const child of node.getChildren()) {
    if (!child.visible) continue
    if (child.focusable) {
      result.push(child)
    }
    walkFocusable(child, result)
  }
}

export function focusNext(root: Renderable, current: Renderable | null): Renderable | null {
  const focusables = collectFocusableDescendants(root)
  if (focusables.length === 0) return null

  if (!current) return focusables[0]!

  const idx = focusables.indexOf(current)
  if (idx === -1) return focusables[0]!

  return focusables[(idx + 1) % focusables.length]!
}

export function focusPrev(root: Renderable, current: Renderable | null): Renderable | null {
  const focusables = collectFocusableDescendants(root)
  if (focusables.length === 0) return null

  if (!current) return focusables[focusables.length - 1]!

  const idx = focusables.indexOf(current)
  if (idx === -1) return focusables[focusables.length - 1]!

  return focusables[(idx - 1 + focusables.length) % focusables.length]!
}
