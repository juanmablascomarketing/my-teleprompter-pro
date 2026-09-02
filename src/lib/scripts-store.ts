export type Script = {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
};

const KEY = "tp.scripts.v1";
const PREFS_KEY = "tp.prefs.v1";

export type Prefs = {
  facingMode: "user" | "environment";
  speed: number;
  fontSize: number;
  mirror: boolean;
};

export const defaultPrefs: Prefs = {
  facingMode: "user",
  speed: 40,
  fontSize: 30,
  mirror: false,
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadScripts(): Script[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Script[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function saveScripts(scripts: Script[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(scripts));
  } catch {
    /* quota / private mode */
  }
}

export function getScript(id: string): Script | undefined {
  return loadScripts().find((s) => s.id === id);
}

export function upsertScript(script: Script) {
  const all = loadScripts().filter((s) => s.id !== script.id);
  saveScripts([script, ...all]);
}

export function deleteScript(id: string) {
  saveScripts(loadScripts().filter((s) => s.id !== id));
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPrefs(): Prefs {
  if (!isBrowser()) return defaultPrefs;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: Partial<Prefs>) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...prefs }));
  } catch {
    /* ignore */
  }
}
