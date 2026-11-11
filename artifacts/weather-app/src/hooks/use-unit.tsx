import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_UNIT, readStoredUnit, storeUnit } from '@/lib/unit-preference';
import type { Unit } from '@/lib/weather';

/*
 * Single authoritative source for the temperature-unit preference.
 *
 * The lazy useState initializer reads storage synchronously before the first
 * render, so a returning Fahrenheit user never sees a Celsius frame. Every
 * consumer (selector, formatting, speech/ask intents) reads the same `unit`
 * from this provider, and every change goes through `setUnit`, which persists
 * the new preference in the same step.
 */
type UnitContextValue = {
  unit: Unit;
  setUnit: (unit: Unit) => void;
};

const UnitContext = createContext<UnitContextValue | null>(null);

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<Unit>(readStoredUnit);
  const setUnit = useCallback((next: Unit) => {
    setUnitState(next);
    storeUnit(next);
  }, []);
  const value = useMemo<UnitContextValue>(() => ({ unit, setUnit }), [unit, setUnit]);
  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit(): UnitContextValue {
  const context = useContext(UnitContext);
  if (!context) throw new Error('useUnit must be used inside UnitProvider');
  return context;
}

export { DEFAULT_UNIT };
