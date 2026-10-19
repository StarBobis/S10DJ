<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mixerAnalyser, useDesk } from '../stores/desk';

const state = useDesk();
const canvas = ref<HTMLCanvasElement | null>(null);

let frame = 0;
let time = 0;
let width = 0;
let height = 0;
let observer: ResizeObserver | null = null;
const wave = new Uint8Array(1024);
const bars = new Uint8Array(512);

function resize(context: CanvasRenderingContext2D) {
  const element = canvas.value;
  if (!element) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = element.clientWidth;
  height = element.clientHeight;
  element.width = Math.max(1, Math.floor(width * ratio));
  element.height = Math.max(1, Math.floor(height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function draw(context: CanvasRenderingContext2D) {
  if (!canvas.value) return;
  if (width === 0 || height === 0) resize(context);
  const w = width;
  const h = height;
  time += 0.016;
  context.clearRect(0, 0, w, h);

  const analyser = mixerAnalyser();
  const live = Boolean(analyser && state.status === 'playing');

  let deviation = 0;
  if (analyser && live) {
    analyser.getByteTimeDomainData(wave);
    analyser.getByteFrequencyData(bars);
    for (const value of wave) deviation = Math.max(deviation, Math.abs(value - 128));
  }
  let energy = 0;
  if (live) {
    for (let index = 0; index < 64; index += 1) energy = Math.max(energy, bars[index] / 255);
  }
  // Headless audio can report a perfectly flat time-domain buffer while the
  // spectrum still moves; a synthetic wave keeps the display alive in that
  // case (and when the transport is stopped).
  const synthetic = !live || deviation < 5;
  const amplitude = live ? 0.035 + energy * 0.26 : 0.075;

  // Mirrored spectrum behind the line.
  const barCount = 56;
  const gap = 2;
  const barWidth = Math.max(1, (w - gap * (barCount - 1)) / barCount);
  const barGradient = context.createLinearGradient(0, h, 0, 0);
  barGradient.addColorStop(0, 'rgba(92, 200, 255, 0.12)');
  barGradient.addColorStop(0.45, 'rgba(192, 132, 255, 0.48)');
  barGradient.addColorStop(1, 'rgba(255, 95, 162, 0.82)');
  context.fillStyle = barGradient;
  for (let index = 0; index < barCount; index += 1) {
    const source = live
      ? Math.pow(bars[Math.floor((index / barCount) * 220)] / 255, 0.68)
      : 0.08 + 0.06 * Math.sin(time * 2.2 + index * 0.35);
    const barHeight = Math.max(2, source * h * 0.9);
    const x = index * (barWidth + gap);
    context.fillRect(x, h - barHeight, barWidth, barHeight);
    context.globalAlpha = 0.28;
    context.fillRect(x, 0, barWidth, Math.min(barHeight * 0.24, h * 0.2));
    context.globalAlpha = 1;
  }

  // Build the waveform points once, then fill a mirrored ribbon and stroke a
  // bright line so quiet mixes still look alive.
  const points = 192;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= points; index += 1) {
    const x = (index / points) * w;
    let value = 0.5;
    if (synthetic) {
      value =
        0.5 +
        Math.sin(index * 0.09 + time * 2.4) * amplitude +
        Math.sin(index * 0.031 - time * 1.7) * amplitude * 0.55 +
        Math.sin(index * 0.23 + time * 3.1) * amplitude * 0.22;
    } else {
      const sample = Math.floor((index / points) * wave.length);
      value = 0.5 + ((wave[sample] / 255) - 0.5) * 1.45;
    }
    xs.push(x);
    ys.push(h / 2 + (value - 0.5) * h * 1.3);
  }

  const ribbon = context.createLinearGradient(0, 0, w, 0);
  ribbon.addColorStop(0, 'rgba(92, 200, 255, 0.34)');
  ribbon.addColorStop(0.5, 'rgba(192, 132, 255, 0.44)');
  ribbon.addColorStop(1, 'rgba(255, 95, 162, 0.36)');
  context.fillStyle = ribbon;
  context.beginPath();
  context.moveTo(xs[0], h / 2);
  for (let index = 0; index <= points; index += 1) context.lineTo(xs[index], ys[index]);
  for (let index = points; index >= 0; index -= 1) {
    context.lineTo(xs[index], h - (ys[index] - h / 2));
  }
  context.closePath();
  context.fill();

  const gradient = context.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#5cc8ff');
  gradient.addColorStop(0.5, '#d8a4ff');
  gradient.addColorStop(1, '#ff5fa2');
  context.strokeStyle = gradient;
  context.lineWidth = 1.8;
  context.shadowColor = 'rgba(192, 132, 255, 0.85)';
  context.shadowBlur = 14;
  context.beginPath();
  for (let index = 0; index <= points; index += 1) {
    if (index === 0) context.moveTo(xs[index], ys[index]);
    else context.lineTo(xs[index], ys[index]);
  }
  context.stroke();
  context.shadowBlur = 0;

  context.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, h / 2);
  context.lineTo(w, h / 2);
  context.stroke();

  frame = requestAnimationFrame(() => draw(context));
}

onMounted(() => {
  const element = canvas.value;
  if (!element) return;
  const context = element.getContext('2d');
  if (!context) return;
  resize(context);
  observer = new ResizeObserver(() => resize(context));
  observer.observe(element);
  frame = requestAnimationFrame(() => draw(context));
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="waveform" aria-hidden="true" />
</template>
