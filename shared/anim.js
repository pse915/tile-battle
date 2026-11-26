// 아주 작은 트윈 엔진 — scene의 렌더 루프에서 update(dt)를 호출

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  inCubic: (t) => t * t * t,
};

const active = new Set();

/**
 * tween({ duration, delay, ease, update(k), complete() }) → Promise
 * update에는 보간된 0..1 값이 들어간다.
 */
export function tween({ duration = 0.4, delay = 0, ease: e = ease.outCubic, update, complete }) {
  return new Promise((resolve) => {
    active.add({ t: -delay, duration: Math.max(duration, 0.0001), e, update, complete, resolve });
  });
}

export function updateTweens(dt) {
  for (const tw of active) {
    tw.t += dt;
    if (tw.t < 0) continue;
    const k = Math.min(tw.t / tw.duration, 1);
    tw.update?.(tw.e(k));
    if (k >= 1) {
      active.delete(tw);
      tw.complete?.();
      tw.resolve();
    }
  }
}

export const wait = (sec) => tween({ duration: sec });

export const lerp = (a, b, k) => a + (b - a) * k;
