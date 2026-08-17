import { vi } from 'vitest';

// the scenarios in helpers.ts freeze their clock at 2026-08-03, but the domain
// functions default to the real one, so the whole suite became a time bomb the
// moment that week's deadline passed. Faking only Date pins the default clock
// to the same instant the scenarios use; timers stay real.
vi.useFakeTimers({ now: new Date('2026-08-03T10:00:00Z'), toFake: ['Date'] });
