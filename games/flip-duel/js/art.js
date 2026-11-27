// 흑백 뒤집기 대전 캔버스 그림 (Three.js·Babylon.js 장면이 같이 씀)

export function drawFelt(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#6b4a2f');
  g.addColorStop(1, '#3d2716');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 나뭇결
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = i % 2 ? '#24140a' : '#8a6340';
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    const y = Math.random() * h;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + 20 * Math.sin(i), w * 0.6, y - 20, w, y + 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawBoard(ctx, w) {
  ctx.fillStyle = '#1f6b46';
  ctx.fillRect(0, 0, w, w);
  const m = w * 0.04;
  const s = (w - m * 2) / 8;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#22774e' : '#25804f';
      ctx.fillRect(m + c * s, m + r * s, s, s);
    }
  ctx.strokeStyle = '#0d3a24';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(m + i * s, m);
    ctx.lineTo(m + i * s, w - m);
    ctx.moveTo(m, m + i * s);
    ctx.lineTo(w - m, m + i * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#0d3a24';
  [
    [2, 2],
    [2, 6],
    [6, 2],
    [6, 6],
  ].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(m + x * s, m + y * s, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `${Math.round(m * 0.7)}px Jua, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    ctx.fillText('ABCDEFGH'[i], m + (i + 0.5) * s, m / 2);
    ctx.fillText(String(i + 1), m / 2, m + (i + 0.5) * s);
  }
}
