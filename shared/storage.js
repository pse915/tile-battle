// localStorage 래퍼 — 사생활 보호 모드나 차단 환경에서도 게임이 멈추지 않게
// 게임마다 접두어를 달리해서 서로의 저장값이 섞이지 않게 함

export const DEFAULT_SETTINGS = { bgm: 0.35, sfx: 0.8, muted: false, quality: 'auto' };

export function createStore(prefix) {
  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    } catch {
      /* 저장할 수 없는 환경이면 조용히 무시 */
    }
  };
  return {
    load,
    save,
    loadSettings: () => ({ ...DEFAULT_SETTINGS, ...load('settings', {}) }),
    saveSettings: (s) => save('settings', s),
  };
}

/** 모든 게임이 같이 쓰는 값 (닉네임 등) */
export const common = createStore('games:');
