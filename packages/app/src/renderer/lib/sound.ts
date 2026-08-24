/**
 * 音效（DESIGN.md §7.4：走子/吃子/将军/终局，可关）。
 * WebAudio 现场合成（木子敲击 = 短噪声爆发 + 低频衰减），不携带音频素材；
 * AudioContext 惰性创建（浏览器要求用户手势后才允许发声）。
 */
export type SoundKind = 'move' | 'capture' | 'check' | 'end';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

function audioContext(): AudioContext | null {
  if (!enabled) return null;
  if (ctx === null) {
    try {
      ctx = new AudioContext();
    } catch {
      return null; // 环境不支持（如自动化无头）时静默
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 木子落盘：短噪声 + 低频正弦衰减 */
function clack(ac: AudioContext, at: number, freq: number, gainValue: number): void {
  const out = ac.destination;

  const noise = ac.createBufferSource();
  const buffer = ac.createBuffer(1, ac.sampleRate * 0.03, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  }
  noise.buffer = buffer;
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = freq * 3;
  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(gainValue, at);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  noise.connect(noiseFilter).connect(noiseGain).connect(out);
  noise.start(at);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, at + 0.08);
  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(gainValue, at);
  oscGain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
  osc.connect(oscGain).connect(out);
  osc.start(at);
  osc.stop(at + 0.1);
}

/** 提示音（将军 / 终局） */
function tone(
  ac: AudioContext,
  at: number,
  freq: number,
  duration: number,
  gainValue: number,
): void {
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(gainValue, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration);
}

export function playSound(kind: SoundKind): void {
  const ac = audioContext();
  if (ac === null) return;
  const t = ac.currentTime;
  switch (kind) {
    case 'move':
      clack(ac, t, 210, 0.5);
      break;
    case 'capture':
      clack(ac, t, 180, 0.6);
      clack(ac, t + 0.06, 140, 0.45);
      break;
    case 'check':
      tone(ac, t, 660, 0.12, 0.25);
      tone(ac, t + 0.13, 660, 0.12, 0.25);
      break;
    case 'end':
      tone(ac, t, 523, 0.18, 0.25);
      tone(ac, t + 0.16, 392, 0.3, 0.25);
      break;
  }
}
