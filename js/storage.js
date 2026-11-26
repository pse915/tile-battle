// localStorage 래퍼 — 사생활 보호 모드나 차단 환경에서도 게임이 멈추지 않게

const PREFIX = 'tilebattle:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* 저장할 수 없는 환경이면 조용히 무시 */
  }
}

export const DEFAULT_SETTINGS = { bgm: 0.35, sfx: 0.8, muted: false, quality: 'auto' };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function saveSettings(s) {
  save('settings', s);
}
