import type { Renderable } from "../Renderable"
import type { KeyEvent } from "../lib/KeyHandler"
import type { RenderContext } from "../types"
import { BoxRenderable, type BoxOptions } from "./Box"
import { collectFocusableDescendants, focusNext, focusPrev } from "../lib/focus-traversal"

export interface FocusScopeOptions extends BoxOptions {
  trapFocus?: boolean
  autoFocus?: boolean
}

export class FocusScopeRenderable extends BoxRenderable {
  private _trapFocus: boolean
  private _autoFocus: boolean
  private _keypressInterceptor: ((key: KeyEvent) => void) | null = null
  private _keyreleaseInterceptor: ((key: KeyEvent) => void) | null = null
  private _activated: boolean = false
  private _didAutoFocus: boolean = false
  private _savedFocus: Renderable | null = null

  constructor(ctx: RenderContext, options: FocusScopeOptions) {
    super(ctx, {
      ...options,
      backgroundColor: options.backgroundColor ?? "transparent",
      shouldFill: options.shouldFill ?? false,
    })

    this._focusable = false
    this._trapFocus = options.trapFocus !== false
    this._autoFocus = options.autoFocus !== false

    this.activate()
  }

  // ── Property setters (for reconciler) ────────────────────────────────

  public set trapFocus(value: boolean | undefined) {
    this._trapFocus = value !== false
  }

  public get trapFocus(): boolean {
    return this._trapFocus
  }

  public set autoFocus(value: boolean | undefined) {
    this._autoFocus = value !== false
  }

  public get autoFocus(): boolean {
    return this._autoFocus
  }

  // ── Activation / Deactivation ────────────────────────────────────────

  private activate(): void {
    if (this._activated) return
    this._activated = true

    this._savedFocus = this._ctx.currentFocusedRenderable

    this._keypressInterceptor = (key: KeyEvent) => {
      if (key.ctrl && key.name === "c") return

      if (key.name === "tab" && this._trapFocus) {
        key.stopPropagation()
        const currentlyFocused = this._ctx.currentFocusedRenderable
        const isDescendant = currentlyFocused ? this.isDescendantOf(currentlyFocused, this) : false
        const current = isDescendant ? currentlyFocused : null

        const next = key.shift ? focusPrev(this, current) : focusNext(this, current)
        if (next) {
          next.focus()
        }
        return
      }

      this.emit("keypress", key)

      if (this._trapFocus) {
        key.stopPropagation()
      }
    }

    this._keyreleaseInterceptor = (key: KeyEvent) => {
      this.emit("keyrelease", key)

      if (this._trapFocus) {
        key.stopPropagation()
      }
    }

    this._ctx._internalKeyInput.prependListener("keypress", this._keypressInterceptor)
    this._ctx._internalKeyInput.prependListener("keyrelease", this._keyreleaseInterceptor)
  }

  private deactivate(): void {
    if (!this._activated) return
    this._activated = false

    if (this._keypressInterceptor) {
      this._ctx._internalKeyInput.removeListener("keypress", this._keypressInterceptor)
      this._keypressInterceptor = null
    }

    if (this._keyreleaseInterceptor) {
      this._ctx._internalKeyInput.removeListener("keyrelease", this._keyreleaseInterceptor)
      this._keyreleaseInterceptor = null
    }

    if (this._savedFocus) {
      this._ctx.focusRenderable(this._savedFocus)
      this._savedFocus = null
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  protected override onUpdate(deltaTime: number): void {
    super.onUpdate(deltaTime)

    // Deferred auto-focus: run once on first update
    if (this._autoFocus && !this._didAutoFocus) {
      this._didAutoFocus = true
      this.performAutoFocus()
    }
  }

  private performAutoFocus(): void {
    const currentlyFocused = this._ctx.currentFocusedRenderable
    if (currentlyFocused && this.isDescendantOf(currentlyFocused, this)) return

    const first = focusNext(this, null)
    if (first) {
      first.focus()
    }
  }

  public override remove(id: string): void {
    const currentlyFocused = this._ctx.currentFocusedRenderable
    const removedChild = this.getRenderable(id)
    const wasFocusedInside =
      currentlyFocused &&
      removedChild &&
      (currentlyFocused === removedChild || this.isDescendantOf(currentlyFocused, removedChild))

    let nextTarget: Renderable | null = null
    if (wasFocusedInside) {
      const focusables = collectFocusableDescendants(this)
      const idx = focusables.indexOf(currentlyFocused!)
      if (focusables.length > 1) {
        nextTarget = focusables[(idx + 1) % focusables.length]!
        // If next is also being removed (same subtree), fall back to first that isn't
        if (
          nextTarget === currentlyFocused ||
          nextTarget === removedChild ||
          this.isDescendantOf(nextTarget, removedChild!)
        ) {
          nextTarget =
            focusables.find(
              (f) => f !== currentlyFocused && f !== removedChild && !this.isDescendantOf(f, removedChild!),
            ) ?? null
        }
      }
    }

    super.remove(id)

    if (wasFocusedInside && nextTarget) {
      nextTarget.focus()
    }
  }

  protected override destroySelf(): void {
    this.deactivate()
    super.destroySelf()
  }

  protected override onRemove(): void {
    this.deactivate()
    super.onRemove()
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private isDescendantOf(renderable: Renderable, ancestor: Renderable): boolean {
    let current: Renderable | null = renderable
    while (current) {
      if (current === ancestor) return true
      current = current.parent
    }
    return false
  }
}
