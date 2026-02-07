import { describe, expect, it, afterEach } from "bun:test"
import { testRender } from "../index"
import { createSignal, Show } from "solid-js"
import { createSpy } from "@opentui/core/testing"
import type { BoxRenderable } from "@opentui/core"
import { useHotkey } from "../src/elements/hooks"

let testSetup: Awaited<ReturnType<typeof testRender>>

afterEach(() => {
  testSetup?.renderer.destroy()
})

// ═══════════════════════════════════════════════════════════════════════════════
// Combo parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe("combo parsing", () => {
  it("plain key: 'j'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("j", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)

    testSetup.mockInput.pressKey("k")
    expect(spy.callCount()).toBe(1)
  })

  it("plain key: 'escape'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("escape", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressEscape()
    expect(spy.callCount()).toBe(1)
  })

  it("plain key: 'return'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("return", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressEnter()
    expect(spy.callCount()).toBe(1)
  })

  it("plain key: 'space'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("space", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey(" ")
    expect(spy.callCount()).toBe(1)
  })

  it("modifier: 'ctrl+p'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("ctrl+p", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("p", { ctrl: true })
    expect(spy.callCount()).toBe(1)

    testSetup.mockInput.pressKey("p")
    expect(spy.callCount()).toBe(1) // should not fire again
  })

  it("modifier: 'shift+j'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("shift+j", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("j", { shift: true })
    expect(spy.callCount()).toBe(1)

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)
  })

  it("multiple modifiers: 'ctrl+shift+p'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("ctrl+shift+p", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("p", { ctrl: true, shift: true })
    expect(spy.callCount()).toBe(1)

    testSetup.mockInput.pressKey("p", { ctrl: true })
    expect(spy.callCount()).toBe(1) // should not fire
  })

  it("meta key: 'meta+k'", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("meta+k", () => spy())
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("k", { meta: true })
    expect(spy.callCount()).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Scope awareness
// ═══════════════════════════════════════════════════════════════════════════════

describe("scope awareness", () => {
  it("global useHotkey fires when no scope active", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("j", () => spy())
      return null
    }

    testSetup = await testRender(
      () => (
        <box>
          <Handler />
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)
  })

  it("global useHotkey blocked when scope active", async () => {
    const globalSpy = createSpy()

    const GlobalHandler = () => {
      useHotkey("j", () => globalSpy())
      return null
    }

    testSetup = await testRender(
      () => (
        <box>
          <GlobalHandler />
          <focus_scope>
            <box width={10} height={5} />
          </focus_scope>
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    testSetup.mockInput.pressKey("j")
    expect(globalSpy.callCount()).toBe(0)
  })

  it("scoped useHotkey fires inside scope", async () => {
    const spy = createSpy()

    const ScopedHandler = () => {
      let ref!: BoxRenderable
      useHotkey("j", () => spy(), { ref: () => ref })
      return <box ref={ref} />
    }

    testSetup = await testRender(
      () => (
        <focus_scope>
          <ScopedHandler />
        </focus_scope>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)
  })

  it("scoped useHotkey does not fire when scope inactive", async () => {
    const spy = createSpy()
    const [showScope, setShowScope] = createSignal(true)

    const ScopedHandler = () => {
      let ref!: BoxRenderable
      useHotkey("j", () => spy(), { ref: () => ref })
      return <box ref={ref} />
    }

    testSetup = await testRender(
      () => (
        <box>
          <Show when={showScope()}>
            <focus_scope>
              <ScopedHandler />
            </focus_scope>
          </Show>
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)

    setShowScope(false)
    await testSetup.renderOnce()
    spy.reset()

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Conditional activation
// ═══════════════════════════════════════════════════════════════════════════════

describe("conditional activation", () => {
  it("when=() => false disables hotkey", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("j", () => spy(), { when: () => false })
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(0)
  })

  it("when=() => true enables hotkey", async () => {
    const spy = createSpy()

    const Handler = () => {
      useHotkey("j", () => spy(), { when: () => true })
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)
  })

  it("dynamic when condition", async () => {
    const spy = createSpy()
    const [enabled, setEnabled] = createSignal(false)

    const Handler = () => {
      useHotkey("j", () => spy(), { when: () => enabled() })
      return null
    }

    testSetup = await testRender(() => <Handler />, { width: 40, height: 10, kittyKeyboard: true })

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(0)

    setEnabled(true)

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

describe("cleanup", () => {
  it("hotkey removed on component unmount", async () => {
    const spy = createSpy()
    const [show, setShow] = createSignal(true)

    const Handler = () => {
      useHotkey("j", () => spy())
      return null
    }

    testSetup = await testRender(
      () => (
        <box>
          <Show when={show()}>
            <Handler />
          </Show>
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(1)

    setShow(false)
    await testSetup.renderOnce()
    spy.reset()

    testSetup.mockInput.pressKey("j")
    expect(spy.callCount()).toBe(0)
  })
})
