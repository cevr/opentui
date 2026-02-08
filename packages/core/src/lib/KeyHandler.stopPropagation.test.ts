import { test, expect, beforeEach, afterEach } from "bun:test"
import { KeyEvent } from "./KeyHandler"
import { createTestRenderer, type TestRenderer } from "../testing/test-renderer"
import { Renderable, type RenderableOptions } from "../Renderable"
import type { RenderContext } from "../types"

class TestRenderable extends Renderable {
  _focusable = true
  constructor(ctx: RenderContext, options: RenderableOptions) {
    super(ctx, options)
  }
}

let renderer: TestRenderer
let renderOnce: () => Promise<void>

beforeEach(async () => {
  ;({ renderer, renderOnce } = await createTestRenderer({}))
})

afterEach(() => {
  renderer.destroy()
})

function pressKey(key: string = "a") {
  ;(renderer as any)._keyHandler.processInput(key)
}

test("stopPropagation - capture listener stops bubble listeners", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  renderer.root.addEventListener(
    "keypress",
    (event) => {
      callOrder.push("root-capture")
      event.stopPropagation()
    },
    { capture: true },
  )

  child.addEventListener("keypress", () => {
    callOrder.push("child-bubble")
  })

  pressKey()

  expect(callOrder).toEqual(["root-capture"])
})

test("stopPropagation - bubble listener stops parent bubble listeners", async () => {
  const parent = new TestRenderable(renderer, { id: "parent", width: 20, height: 10 })
  renderer.root.add(parent)

  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  parent.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  child.addEventListener("keypress", (event) => {
    callOrder.push("child-bubble")
    event.stopPropagation()
  })

  parent.addEventListener("keypress", () => {
    callOrder.push("parent-bubble")
  })

  renderer.root.addEventListener("keypress", () => {
    callOrder.push("root-bubble")
  })

  pressKey()

  // Capture phase runs (root → parent → child), then bubble stops at child
  expect(callOrder).toEqual(["child-bubble"])
})

test("stopPropagation - does not affect preventDefault", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  let stoppedPropagation = false
  let preventedDefault = false

  child.addEventListener("keypress", (event) => {
    event.stopPropagation()
    event.preventDefault()
    stoppedPropagation = event.propagationStopped
    preventedDefault = event.defaultPrevented
  })

  pressKey()

  expect(stoppedPropagation).toBe(true)
  expect(preventedDefault).toBe(true)
})

test("stopPropagation - without calling it, full capture/bubble chain runs", async () => {
  const parent = new TestRenderable(renderer, { id: "parent", width: 20, height: 10 })
  renderer.root.add(parent)

  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  parent.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  renderer.root.addEventListener("keypress", () => callOrder.push("root-capture"), { capture: true })
  parent.addEventListener("keypress", () => callOrder.push("parent-capture"), { capture: true })
  child.addEventListener("keypress", () => callOrder.push("child-target"))
  parent.addEventListener("keypress", () => callOrder.push("parent-bubble"))
  renderer.root.addEventListener("keypress", () => callOrder.push("root-bubble"))

  pressKey()

  expect(callOrder).toEqual(["root-capture", "parent-capture", "child-target", "parent-bubble", "root-bubble"])
})

test("stopPropagation - paste events support stopPropagation", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  child.addEventListener("paste", (event) => {
    callOrder.push("child")
    event.stopPropagation()
  })

  renderer.root.addEventListener("paste", () => {
    callOrder.push("root-bubble")
  })

  ;(renderer as any)._keyHandler.processPaste("hello")

  expect(callOrder).toEqual(["child"])
})

test("stopPropagation - works with keyrelease events", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  child.addEventListener("keyrelease", (event) => {
    callOrder.push("child")
    event.stopPropagation()
  })

  renderer.root.addEventListener("keyrelease", () => {
    callOrder.push("root-bubble")
  })

  ;(renderer as any)._keyHandler.emit(
    "keyrelease",
    new KeyEvent({
      name: "a",
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: "a",
      number: false,
      raw: "a",
      eventType: "release",
      source: "kitty",
    }),
  )

  expect(callOrder).toEqual(["child"])
})

test("stopPropagation - error in handler does not affect propagation stopped state", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  renderer.root.addEventListener(
    "keypress",
    (event) => {
      callOrder.push("root-capture")
      event.stopPropagation()
      throw new Error("Test error")
    },
    { capture: true },
  )

  child.addEventListener("keypress", () => {
    callOrder.push("child-bubble")
  })

  // dispatchEvent catches errors in handlers
  pressKey()

  expect(callOrder).toEqual(["root-capture"])
})

test("stopPropagation - scope isolation: child stops events from reaching parent", async () => {
  const scope = new TestRenderable(renderer, { id: "scope", width: 20, height: 10 })
  renderer.root.add(scope)

  const input = new TestRenderable(renderer, { id: "input", width: 10, height: 5 })
  scope.add(input)
  await renderOnce()
  input.focus()

  const callOrder: string[] = []
  let appHandledEsc = false

  // Scope acts as an isolation boundary (like trapFocus would)
  scope.addEventListener("keypress", (event) => {
    callOrder.push("scope")
    event.stopPropagation()
  })

  // App-level handler on root (bubble phase)
  renderer.root.addEventListener("keypress", () => {
    callOrder.push("app")
    appHandledEsc = true
  })

  pressKey("\x1b") // ESC

  // Event bubbles from input → scope (stops here), never reaches root bubble
  expect(callOrder).toEqual(["scope"])
  expect(appHandledEsc).toBe(false)
})

test("stopPropagation - global capture still fires before scope isolation", async () => {
  const scope = new TestRenderable(renderer, { id: "scope", width: 20, height: 10 })
  renderer.root.add(scope)

  const input = new TestRenderable(renderer, { id: "input", width: 10, height: 5 })
  scope.add(input)
  await renderOnce()
  input.focus()

  const callOrder: string[] = []

  // Global handler (becomes capture on root) — fires first
  renderer.keyInput.on("keypress", () => {
    callOrder.push("global-capture")
  })

  // Scope isolation (bubble phase)
  scope.addEventListener("keypress", (event) => {
    callOrder.push("scope-bubble")
    event.stopPropagation()
  })

  pressKey()

  // Global capture fires before scope's bubble handler
  expect(callOrder).toEqual(["global-capture", "scope-bubble"])

  renderer.keyInput.removeAllListeners("keypress")
})

test("stopImmediatePropagation - stops other listeners on same node", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  const callOrder: string[] = []

  child.addEventListener("keypress", (event) => {
    callOrder.push("handler1")
    event.stopImmediatePropagation()
  })

  child.addEventListener("keypress", () => {
    callOrder.push("handler2")
  })

  pressKey()

  expect(callOrder).toEqual(["handler1"])
})
