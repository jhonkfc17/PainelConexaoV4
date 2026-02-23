// src/utils/localStorage.ts

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function lsSet<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // se storage estiver cheio ou bloqueado, não quebra o app
  }
}

export function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}
