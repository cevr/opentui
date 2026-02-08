import { test, expect, beforeEach, afterEach } from "bun:test"
import { KeyHandler, InternalKeyHandler, KeyEvent, PasteEvent } from "./KeyHandler"
import { TUIEvent } from "./event"
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

// ===== KeyHandler base class tests (parsing, not dispatch) =====

test("KeyHandler - processInput emits keypress events", () => {
  const handler = new KeyHandler()

  let receivedKey: KeyEvent | undefined
  handler.on("keypress", (key: KeyEvent) => {
    receivedKey = key
  })

  handler.processInput("a")

  expect(receivedKey).toMatchObject({
    name: "a",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    number: false,
    sequence: "a",
    raw: "a",
    eventType: "press",
  })
})

test("KeyHandler - handles paste via processPaste", () => {
  const handler = new KeyHandler()

  let receivedPaste: string | undefined
  handler.on("paste", (event) => {
    receivedPaste = event.text
  })

  handler.processPaste("pasted content")

  expect(receivedPaste).toBe("pasted content")
})

test("KeyHandler - processPaste handles content directly", () => {
  const handler = new KeyHandler()

  let receivedPaste: string | undefined
  handler.on("paste", (event) => {
    receivedPaste = event.text
  })

  handler.processPaste("chunk1chunk2chunk3")

  expect(receivedPaste).toBe("chunk1chunk2chunk3")
})

test("KeyHandler - strips ANSI codes in paste", () => {
  const handler = new KeyHandler()

  let receivedPaste: string | undefined
  handler.on("paste", (event) => {
    receivedPaste = event.text
  })

  handler.processPaste("text with \x1b[31mred\x1b[0m color")

  expect(receivedPaste).toBe("text with red color")
})

test("KeyHandler - constructor accepts useKittyKeyboard parameter", () => {
  const handler1 = new KeyHandler(false)
  const handler2 = new KeyHandler(true)

  expect(handler1).toBeDefined()
  expect(handler2).toBeDefined()
})

test("KeyHandler - handles string input", () => {
  const handler = new KeyHandler()

  let receivedKey: KeyEvent | undefined
  handler.on("keypress", (key: KeyEvent) => {
    receivedKey = key
  })

  handler.processInput("c")

  expect(receivedKey).toMatchObject({
    name: "c",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    number: false,
    sequence: "c",
    raw: "c",
    eventType: "press",
  })
})

test("KeyHandler - event inheritance from EventEmitter", () => {
  const handler = new KeyHandler()

  expect(typeof handler.on).toBe("function")
  expect(typeof handler.emit).toBe("function")
  expect(typeof handler.removeListener).toBe("function")
})

test("KeyHandler - filters out mouse events", () => {
  const handler = new KeyHandler()

  let keypressCount = 0
  handler.on("keypress", () => {
    keypressCount++
  })

  handler.processInput("\x1b[<0;10;5M")
  expect(keypressCount).toBe(0)

  handler.processInput("\x1b[<0;10;5m")
  expect(keypressCount).toBe(0)

  handler.processInput("\x1b[M ab")
  expect(keypressCount).toBe(0)

  handler.processInput("c")
  expect(keypressCount).toBe(1)

  handler.processInput("a")
  expect(keypressCount).toBe(2)
})

test("KeyHandler - emits paste event even with empty content", () => {
  const handler = new KeyHandler()

  let pasteEventReceived = false
  let receivedPaste = "not-empty"

  handler.on("paste", (event) => {
    pasteEventReceived = true
    receivedPaste = event.text
  })

  handler.processPaste("")

  expect(pasteEventReceived).toBe(true)
  expect(receivedPaste).toBe("")
})

test("KeyHandler - KeyEvent source is 'kitty' when using Kitty keyboard protocol", () => {
  const handler = new KeyHandler(true)

  let receivedKey: KeyEvent | undefined
  handler.on("keypress", (key: KeyEvent) => {
    receivedKey = key
  })

  handler.processInput("\x1b[97u")

  expect(receivedKey).toBeDefined()
  expect(receivedKey?.source).toBe("kitty")
  expect(receivedKey?.name).toBe("a")
})

// ===== InternalKeyHandler dispatch tests (capture/bubble on renderable tree) =====

test("InternalKeyHandler - global handler receives keypress via capture on root", () => {
  let receivedKey: KeyEvent | undefined
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    receivedKey = key
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(receivedKey).toMatchObject({
    name: "a",
    eventType: "press",
  })

  renderer.keyInput.removeAllListeners("keypress")
})

test("InternalKeyHandler - focused renderable receives keypress via addEventListener", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()

  child.focus()

  let receivedKey: KeyEvent | undefined
  child.addEventListener("keypress", (event) => {
    receivedKey = event as KeyEvent
  })

  ;(renderer as any)._keyHandler.processInput("x")

  expect(receivedKey).toBeDefined()
  expect(receivedKey?.name).toBe("x")
})

test("InternalKeyHandler - capture-phase listener on parent fires before bubble on child", async () => {
  const parent = new TestRenderable(renderer, { id: "parent", width: 20, height: 10 })
  renderer.root.add(parent)

  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  parent.add(child)
  await renderOnce()

  child.focus()

  const callOrder: string[] = []

  parent.addEventListener(
    "keypress",
    () => {
      callOrder.push("parent-capture")
    },
    { capture: true },
  )

  child.addEventListener("keypress", () => {
    callOrder.push("child-bubble")
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(callOrder).toEqual(["parent-capture", "child-bubble"])
})

test("InternalKeyHandler - preventDefault in capture does not stop propagation", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()

  child.focus()

  let captureCalled = false
  let bubbleCalled = false

  renderer.root.addEventListener(
    "keypress",
    (event) => {
      captureCalled = true
      event.preventDefault()
    },
    { capture: true },
  )

  child.addEventListener("keypress", (event) => {
    bubbleCalled = true
    // defaultPrevented should be true
    expect(event.defaultPrevented).toBe(true)
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(captureCalled).toBe(true)
  expect(bubbleCalled).toBe(true)
})

test("InternalKeyHandler - stopPropagation in capture prevents bubble", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()

  child.focus()

  let captureCalled = false
  let bubbleCalled = false

  renderer.root.addEventListener(
    "keypress",
    (event) => {
      captureCalled = true
      event.stopPropagation()
    },
    { capture: true },
  )

  child.addEventListener("keypress", () => {
    bubbleCalled = true
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(captureCalled).toBe(true)
  expect(bubbleCalled).toBe(false)
})

test("InternalKeyHandler - multiple global handlers act as capture listeners", () => {
  const callOrder: string[] = []

  renderer.keyInput.on("keypress", () => {
    callOrder.push("global1")
  })

  renderer.keyInput.on("keypress", () => {
    callOrder.push("global2")
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(callOrder).toEqual(["global1", "global2"])

  renderer.keyInput.removeAllListeners("keypress")
})

test("InternalKeyHandler - paste events dispatch through the tree", async () => {
  const child = new TestRenderable(renderer, { id: "child", width: 10, height: 5 })
  renderer.root.add(child)
  await renderOnce()

  child.focus()

  let receivedPaste: string | undefined
  child.addEventListener("paste", (event) => {
    receivedPaste = (event as PasteEvent).text
  })

  ;(renderer as any)._keyHandler.processPaste("hello")

  expect(receivedPaste).toBe("hello")
})

test("InternalKeyHandler - emit returns true when root is set", () => {
  const hasListeners = (renderer as any)._keyHandler.emit(
    "keypress",
    new KeyEvent({
      name: "a",
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: "a",
      number: false,
      raw: "a",
      eventType: "press",
      source: "raw",
    }),
  )
  expect(hasListeners).toBe(true)
})

test("InternalKeyHandler - emit returns false when root is not set", () => {
  const handler = new InternalKeyHandler()
  // No root set
  const result = handler.emit(
    "keypress",
    new KeyEvent({
      name: "a",
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: "a",
      number: false,
      raw: "a",
      eventType: "press",
      source: "raw",
    }),
  )
  expect(result).toBe(false)
})

test("InternalKeyHandler - paste preventDefault in global handler", () => {
  let globalCalled = false

  renderer.keyInput.on("paste", (event) => {
    globalCalled = true
    event.preventDefault()
  })

  ;(renderer as any)._keyHandler.processPaste("test paste")

  expect(globalCalled).toBe(true)

  renderer.keyInput.removeAllListeners("paste")
})

test("KeyHandler - global handler error is caught and logged", () => {
  let handlerCalled = false

  renderer.keyInput.on("keypress", () => {
    handlerCalled = true
    throw new Error("Test error in global handler")
  })

  expect(() => (renderer as any)._keyHandler.processInput("a")).not.toThrow()
  expect(handlerCalled).toBe(true)

  renderer.keyInput.removeAllListeners("keypress")
})

test("KeyHandler - processInput returns true even when handler throws", () => {
  renderer.keyInput.on("keypress", () => {
    throw new Error("Handler error")
  })

  const result = (renderer as any)._keyHandler.processInput("a")
  expect(result).toBe(true)

  renderer.keyInput.removeAllListeners("keypress")
})

test("KeyHandler - paste handler error is caught and logged", () => {
  let handlerCalled = false

  renderer.keyInput.on("paste", () => {
    handlerCalled = true
    throw new Error("Test error in paste handler")
  })

  expect(() => (renderer as any)._keyHandler.processPaste("test")).not.toThrow()
  expect(handlerCalled).toBe(true)

  renderer.keyInput.removeAllListeners("paste")
})

test("KeyHandler - error in one event type does not prevent other event types from working", () => {
  let keypressCalled = false
  let pasteCalled = false

  renderer.keyInput.on("keypress", () => {
    keypressCalled = true
    throw new Error("Keypress error")
  })

  renderer.keyInput.on("paste", () => {
    pasteCalled = true
  })

  expect(() => (renderer as any)._keyHandler.processInput("a")).not.toThrow()
  expect(() => (renderer as any)._keyHandler.processPaste("test")).not.toThrow()

  expect(keypressCalled).toBe(true)
  expect(pasteCalled).toBe(true)

  renderer.keyInput.removeAllListeners("keypress")
  renderer.keyInput.removeAllListeners("paste")
})

test("KeyHandler - KeyEvent has source field set to 'raw' by default", () => {
  let receivedKey: KeyEvent | undefined
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    receivedKey = key
  })

  ;(renderer as any)._keyHandler.processInput("a")

  expect(receivedKey).toBeDefined()
  expect(receivedKey?.source).toBe("raw")
  expect(receivedKey?.name).toBe("a")

  renderer.keyInput.removeAllListeners("keypress")
})

test("KeyEvent extends TUIEvent", () => {
  const event = new KeyEvent({
    name: "a",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "a",
    number: false,
    raw: "a",
    eventType: "press",
    source: "raw",
  })

  expect(event.type).toBe("keypress")
  expect(event.propagationStopped).toBe(false)
  expect(event.defaultPrevented).toBe(false)
  expect(typeof event.stopPropagation).toBe("function")
  expect(typeof event.preventDefault).toBe("function")
  expect(typeof event.stopImmediatePropagation).toBe("function")
})

test("KeyEvent for release events has type 'keyrelease'", () => {
  const event = new KeyEvent({
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
  })

  expect(event.type).toBe("keyrelease")
})

test("PasteEvent extends TUIEvent", () => {
  const event = new PasteEvent("hello")

  expect(event.type).toBe("paste")
  expect(event.text).toBe("hello")
  expect(event.propagationStopped).toBe(false)
  expect(event.defaultPrevented).toBe(false)
})

test("InternalKeyHandler - without focused renderable, events target root", () => {
  let receivedTarget: Renderable | null = null

  const handler = (event: TUIEvent) => {
    receivedTarget = event.target
  }

  renderer.root.addEventListener("keypress", handler)

  ;(renderer as any)._keyHandler.processInput("a")

  expect(receivedTarget).not.toBeNull()
  expect(receivedTarget!.id).toBe("__root__")

  renderer.root.removeEventListener("keypress", handler)
})
