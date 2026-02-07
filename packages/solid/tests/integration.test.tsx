import { describe, expect, it, afterEach } from "bun:test"
import { testRender } from "../index"
import { createSignal, Show } from "solid-js"
import { createSpy } from "@opentui/core/testing"
import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useHotkey } from "../src/elements/hooks"

let testSetup: Awaited<ReturnType<typeof testRender>>

afterEach(() => {
  testSetup?.renderer.destroy()
})

// ═══════════════════════════════════════════════════════════════════════════════
// Integration / edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("integration", () => {
  it("full stack: focus_scope + useHotkey + useKeyboard + escape-to-close", async () => {
    const closeSpy = createSpy()
    const hotkeySpyH = createSpy()
    const hotkeySpyL = createSpy()
    const keyboardSpy = createSpy()

    const Content = () => {
      let ref!: BoxRenderable
      useHotkey("h", () => hotkeySpyH(), { ref: () => ref })
      useHotkey("l", () => hotkeySpyL(), { ref: () => ref })
      useKeyboard(
        (key) => {
          if (key.name === "escape") {
            closeSpy()
            return
          }
          keyboardSpy(key.name)
        },
        { ref: () => ref },
      )
      return <box ref={ref} width={10} height={5} />
    }

    testSetup = await testRender(
      () => (
        <focus_scope>
          <Content />
        </focus_scope>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    // Hotkeys fire inside scope
    testSetup.mockInput.pressKey("h")
    expect(hotkeySpyH.callCount()).toBe(1)

    testSetup.mockInput.pressKey("l")
    expect(hotkeySpyL.callCount()).toBe(1)

    // useKeyboard receives all keys
    expect(keyboardSpy.callCount()).toBe(2)
    expect(keyboardSpy.calls[0]?.[0]).toBe("h")
    expect(keyboardSpy.calls[1]?.[0]).toBe("l")

    // Escape closes
    testSetup.mockInput.pressEscape()
    expect(closeSpy.callCount()).toBe(1)
  })

  it("scope unmount during keypress doesn't crash", async () => {
    const [show, setShow] = createSignal(true)

    const Handler = () => {
      let ref!: BoxRenderable
      useKeyboard(
        () => {
          setShow(false)
        },
        { ref: () => ref },
      )
      return <box ref={ref} />
    }

    testSetup = await testRender(
      () => (
        <box>
          <Show when={show()}>
            <focus_scope>
              <Handler />
            </focus_scope>
          </Show>
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    // Should not throw
    testSetup.mockInput.pressKey("x")
    await testSetup.renderOnce()

    expect(show()).toBe(false)
  })

  it("rapid scope mount/unmount", async () => {
    const [show, setShow] = createSignal(false)
    const globalSpy = createSpy()

    const Global = () => {
      useKeyboard((key) => globalSpy(key.name))
      return null
    }

    testSetup = await testRender(
      () => (
        <box>
          <Global />
          <Show when={show()}>
            <focus_scope>
              <box width={10} height={5} />
            </focus_scope>
          </Show>
        </box>
      ),
      { width: 40, height: 10, kittyKeyboard: true },
    )

    // Mount and immediately unmount
    setShow(true)
    await testSetup.renderOnce()
    setShow(false)
    await testSetup.renderOnce()

    // Global handler should work again
    testSetup.mockInput.pressKey("a")
    expect(globalSpy.callCount()).toBe(1)
    expect(globalSpy.calls[0]?.[0]).toBe("a")
  })
})
