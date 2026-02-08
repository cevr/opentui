import { test, expect, beforeEach, afterEach } from "bun:test"
import { KeyEvent } from "./KeyHandler"
import { createTestRenderer, type TestRenderer } from "../testing/test-renderer"
import { Renderable, type RenderableOptions } from "../Renderable"
import type { RenderContext } from "../types"

/**
 * Integration tests demonstrating real-world scenarios with the
 * DOM-like capture/bubble event dispatch model.
 */

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

test("Integration - Modal scope captures ESC and prevents parent handlers", async () => {
  const modal = new TestRenderable(renderer, { id: "modal", width: 30, height: 15 })
  renderer.root.add(modal)

  const modalInput = new TestRenderable(renderer, { id: "modal-input", width: 20, height: 3 })
  modal.add(modalInput)
  await renderOnce()
  modalInput.focus()

  let modalClosed = false
  let backgroundHandledEsc = false

  // Modal catches ESC on bubble, stops it from reaching root
  modal.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "escape") {
      modalClosed = true
      event.stopPropagation()
    }
  })

  // Background/app-level handler on root (bubble) — should not run
  renderer.root.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "escape") {
      backgroundHandledEsc = true
    }
  })

  pressKey("\x1b") // ESC

  expect(modalClosed).toBe(true)
  expect(backgroundHandledEsc).toBe(false)
})

test("Integration - Focused input field handles key, parent sees it in capture", async () => {
  const container = new TestRenderable(renderer, { id: "container", width: 30, height: 15 })
  renderer.root.add(container)

  const input = new TestRenderable(renderer, { id: "input", width: 20, height: 3 })
  container.add(input)
  await renderOnce()
  input.focus()

  const inputValue: string[] = []
  let parentSawKey = false

  // Parent sees event in capture phase (before input)
  container.addEventListener(
    "keypress",
    () => {
      parentSawKey = true
    },
    { capture: true },
  )

  // Input handles key in bubble phase
  input.addEventListener("keypress", (event) => {
    const key = event as KeyEvent
    inputValue.push(key.name)
  })

  pressKey("a")
  pressKey("b")
  pressKey("c")

  expect(inputValue).toEqual(["a", "b", "c"])
  expect(parentSawKey).toBe(true)
})

test("Integration - Dialog system: innermost scope wins via bubble order", async () => {
  const outerModal = new TestRenderable(renderer, { id: "outer-modal", width: 40, height: 20 })
  renderer.root.add(outerModal)

  const innerModal = new TestRenderable(renderer, { id: "inner-modal", width: 30, height: 15 })
  outerModal.add(innerModal)

  const innerInput = new TestRenderable(renderer, { id: "inner-input", width: 20, height: 3 })
  innerModal.add(innerInput)
  await renderOnce()
  innerInput.focus()

  let outerModalClosed = false
  let innerModalClosed = false
  const closeLog: string[] = []

  // Inner modal catches ESC first (closer to target in bubble phase)
  innerModal.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "escape") {
      closeLog.push("inner")
      innerModalClosed = true
      event.stopPropagation()
    }
  })

  // Outer modal ESC handler — should not run due to stopPropagation
  outerModal.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "escape") {
      closeLog.push("outer")
      outerModalClosed = true
    }
  })

  pressKey("\x1b") // ESC

  expect(closeLog).toEqual(["inner"])
  expect(innerModalClosed).toBe(true)
  expect(outerModalClosed).toBe(false)
})

test("Integration - Global shortcut (capture) always fires before scope isolation", async () => {
  const scope = new TestRenderable(renderer, { id: "scope", width: 30, height: 15 })
  renderer.root.add(scope)

  const input = new TestRenderable(renderer, { id: "input", width: 20, height: 3 })
  scope.add(input)
  await renderOnce()
  input.focus()

  const actions: string[] = []

  // Global Ctrl+C handler (capture on root — always fires first)
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.ctrl && key.name === "c") {
      actions.push("global-exit")
    }
  })

  // Scope isolation (bubble phase)
  scope.addEventListener("keypress", (event) => {
    actions.push("scope-isolate")
    event.stopPropagation()
  })

  pressKey("\x03") // Ctrl+C

  // Global capture fires first, then scope isolation stops bubble
  expect(actions).toEqual(["global-exit", "scope-isolate"])

  renderer.keyInput.removeAllListeners("keypress")
})

test("Integration - preventDefault vs stopPropagation are independent", async () => {
  const parent = new TestRenderable(renderer, { id: "parent", width: 20, height: 10 })
  renderer.root.add(parent)

  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  parent.add(child)
  await renderOnce()
  child.focus()

  const log: string[] = []

  // Child: preventDefault only (does NOT stop propagation)
  child.addEventListener("keypress", (event) => {
    log.push("child")
    event.preventDefault()
  })

  // Parent bubble: should still run (preventDefault doesn't stop propagation)
  parent.addEventListener("keypress", (event) => {
    log.push("parent")
    if (event.defaultPrevented) {
      log.push("parent-saw-prevented")
    }
  })

  pressKey()

  expect(log).toEqual(["child", "parent", "parent-saw-prevented"])
})

test("Integration - Form submission: input consumes Enter, form doesn't see it", async () => {
  const form = new TestRenderable(renderer, { id: "form", width: 30, height: 15 })
  renderer.root.add(form)

  const input = new TestRenderable(renderer, { id: "input", width: 20, height: 3 })
  form.add(input)
  await renderOnce()
  input.focus()

  let formSubmitted = false
  let inputValue = ""

  // Input handles Enter and stops propagation
  input.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "return") {
      inputValue += "\n"
      event.stopPropagation()
    }
  })

  // Form listens for Enter to submit (bubble) — should not run
  form.addEventListener("keypress", (event) => {
    if ((event as KeyEvent).name === "return") {
      formSubmitted = true
    }
  })

  pressKey("\r") // Enter

  expect(inputValue).toBe("\n")
  expect(formSubmitted).toBe(false)
})

test("Integration - Event bubbling with multiple nested components", async () => {
  const container = new TestRenderable(renderer, { id: "container", width: 40, height: 20 })
  renderer.root.add(container)

  const panel = new TestRenderable(renderer, { id: "panel", width: 30, height: 15 })
  container.add(panel)

  const button = new TestRenderable(renderer, { id: "button", width: 10, height: 3 })
  panel.add(button)
  await renderOnce()
  button.focus()

  const eventLog: Array<{ component: string; phase: string }> = []

  // Capture phase listeners
  renderer.root.addEventListener("keypress", () => eventLog.push({ component: "root", phase: "capture" }), {
    capture: true,
  })
  container.addEventListener("keypress", () => eventLog.push({ component: "container", phase: "capture" }), {
    capture: true,
  })

  // Target/bubble phase listeners
  button.addEventListener("keypress", (event) => {
    eventLog.push({ component: "button", phase: "target" })
    if ((event as KeyEvent).name === "space") {
      event.stopPropagation()
    }
  })
  panel.addEventListener("keypress", () => eventLog.push({ component: "panel", phase: "bubble" }))
  container.addEventListener("keypress", () => eventLog.push({ component: "container", phase: "bubble" }))
  renderer.root.addEventListener("keypress", () => eventLog.push({ component: "root", phase: "bubble" }))

  pressKey(" ") // Space

  expect(eventLog).toEqual([
    { component: "root", phase: "capture" },
    { component: "container", phase: "capture" },
    { component: "button", phase: "target" },
    // Space stopped propagation — no bubble beyond target
  ])
})

test("Integration - once listener fires once then is removed", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()
  child.focus()

  let callCount = 0
  child.addEventListener(
    "keypress",
    () => {
      callCount++
    },
    { once: true },
  )

  pressKey("a")
  pressKey("b")

  expect(callCount).toBe(1)
})
