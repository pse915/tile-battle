// 공용 튜토리얼 진행기: 말풍선 + 강조 테두리, 건너뛰기, 이전/다음, '직접 해 보기' 단계
// shell.js가 만든 #tutorial-layer를 씀.
//
// steps: [{ title, html, spot?: () => Element|DOMRect|null, enter?: (t) => void|Promise,
//           task?: (t) => Promise   // 직접 해 보는 단계: 끝날 때까지 '다음'이 잠김
//           exit?: () => void }]
import { $ } from './ui-core.js';

export class TutorialRunner {
  constructor({ steps, store, onDone }) {
    this.steps = steps;
    this.store = store;
    this.onDone = onDone;
    this.i = 0;
    this.token = 0;
    this.onResize = () => this.place();
    this.handlers = {
      next: () => this.next(),
      prev: () => this.prev(),
      skip: () => this.finish(true),
    };
  }

  start() {
    $('#tutorial-layer').hidden = false;
    $('#tut-next').addEventListener('click', this.handlers.next);
    $('#tut-prev').addEventListener('click', this.handlers.prev);
    $('#tut-skip').addEventListener('click', this.handlers.skip);
    window.addEventListener('resize', this.onResize);
    this.show(0);
  }

  async show(i) {
    const prev = this.steps[this.i];
    if (prev && prev !== this.steps[i]) prev.exit?.();
    this.i = i;
    const token = ++this.token;
    const s = this.steps[i];
    $('#tut-progress').textContent = `${i + 1}/${this.steps.length}`;
    $('#tut-title').textContent = s.title;
    $('#tut-body').innerHTML = s.html;
    $('#tut-prev').hidden = i === 0;
    const last = i === this.steps.length - 1;
    $('#tut-next').textContent = last ? '시작하기!' : '다음';
    $('#tut-next').hidden = !!s.task;
    $('#tut-skip').hidden = last;
    await s.enter?.(this);
    if (token !== this.token) return;
    this.place();
    if (s.task) {
      await s.task(this);
      if (token !== this.token) return;
      $('#tut-body').insertAdjacentHTML('beforeend', '<p class="tut-ok">✔ 잘했어요!</p>');
      $('#tut-next').hidden = false;
      $('#tut-next').focus({ preventScroll: true });
    }
  }

  /** 강조 테두리 위치 다시 잡기 (화면 크기 바뀔 때도) */
  place() {
    const s = this.steps[this.i];
    const spot = $('#tut-spot');
    let r = s?.spot?.();
    if (r instanceof Element) r = r.getBoundingClientRect();
    if (!r || !r.width) {
      spot.classList.add('is-none');
      $('#tut-bubble').classList.remove('at-bottom');
      return;
    }
    spot.classList.remove('is-none');
    const pad = 8;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // 강조할 곳이 위쪽이면 말풍선을 아래로
    $('#tut-bubble').classList.toggle('at-bottom', r.top + r.height / 2 < innerHeight * 0.45);
  }

  next() {
    if (this.i >= this.steps.length - 1) return this.finish(false);
    this.show(this.i + 1);
  }

  prev() {
    if (this.i > 0) this.show(this.i - 1);
  }

  finish(skipped) {
    this.token++;
    this.steps[this.i]?.exit?.();
    $('#tutorial-layer').hidden = true;
    $('#tut-next').removeEventListener('click', this.handlers.next);
    $('#tut-prev').removeEventListener('click', this.handlers.prev);
    $('#tut-skip').removeEventListener('click', this.handlers.skip);
    window.removeEventListener('resize', this.onResize);
    this.store.save('tutorialDone', true);
    this.onDone?.(skipped);
  }
}
