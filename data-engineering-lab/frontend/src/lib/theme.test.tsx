import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './theme'

function Probe() {
  const { theme, toggle } = useTheme()
  return <button onClick={toggle}>theme:{theme}</button>
}

// Node 25 ships an experimental global `localStorage` that shadows jsdom's; use a deterministic in-memory store.
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  }
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); document.documentElement.classList.remove('dark') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('theme', () => {
  it('defaults to dark and applies the class', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('theme:dark')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
  it('toggles to light, removes the dark class and persists the choice', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>)
    act(() => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByText('theme:light')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('delab.theme')).toBe('light')
  })
  it('restores the saved theme on the next start', () => {
    localStorage.setItem('delab.theme', 'light')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByText('theme:light')).toBeTruthy()
  })
})
