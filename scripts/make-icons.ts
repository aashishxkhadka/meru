/// <reference types="node" />
/**
 * Placeholder app icon + splash for Meru (step 11), drawn in code so they can be regenerated:
 * a snow-capped peak on the app's night-blue, with the orange summit dot + leader line used for
 * labels in the app. Replace with designed artwork before a public release.
 *
 *   npm run make-icons
 */

import { type SKRSContext2D, createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BG = '#0b1220';
const BG_TOP = '#16233d';
const ACCENT = '#f2a541';
const assets = join(__dirname, '..', 'assets');

/**
 * Draw the mark centred in a square of `size`, filling `scale` of it.
 * mono: single colour (Android themed icon).
 */
function drawMark(o: SKRSContext2D, size: number, scale: number, mono = false): void {
  const u = (size * scale) / 100; // mark is designed on a 100×100 grid
  const ox = (size - 100 * u) / 2;
  const oy = (size - 100 * u) / 2;
  const P = (x: number, y: number): [number, number] => [ox + x * u, oy + y * u];
  const poly = (pts: [number, number][], fill: string) => {
    o.beginPath();
    pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)));
    o.closePath();
    o.fillStyle = fill;
    o.fill();
  };

  // back ridge
  poly([P(4, 86), P(30, 52), P(42, 64), P(58, 46), P(96, 86)], mono ? '#ffffff' : '#3a4d6e');
  // main peak
  poly([P(16, 86), P(50, 26), P(84, 86)], mono ? '#ffffff' : '#dfe8f2');
  if (!mono) {
    // shadow side
    poly([P(50, 26), P(84, 86), P(56, 86), P(54, 58)], '#a9bad0');
    // snow cap
    poly(
      [P(50, 26), P(61.3, 46), P(56, 43), P(52, 48), P(47, 43), P(42, 47), P(38.7, 46)],
      '#ffffff',
    );
  }
  // leader line + summit dot (the label pin used in the app)
  o.strokeStyle = mono ? '#ffffff' : ACCENT;
  o.lineWidth = 2.6 * u;
  o.lineCap = 'round';
  o.beginPath();
  o.moveTo(...P(50, 8));
  o.lineTo(...P(50, 21));
  o.stroke();
  o.beginPath();
  o.arc(...P(50, 26), 4.4 * u, 0, Math.PI * 2);
  o.fillStyle = mono ? '#ffffff' : ACCENT;
  o.fill();
  if (!mono) {
    o.lineWidth = 1.4 * u;
    o.strokeStyle = '#ffffff';
    o.stroke();
  }
}

function background(o: SKRSContext2D, size: number): void {
  const g = o.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, BG);
  o.fillStyle = g;
  o.fillRect(0, 0, size, size);
}

function png(name: string, size: number, draw: (o: SKRSContext2D) => void): void {
  const c = createCanvas(size, size);
  draw(c.getContext('2d'));
  writeFileSync(join(assets, name), c.toBuffer('image/png'));
  console.log(`assets/${name} ${size}×${size}`);
}

// iOS / generic icon: opaque, full bleed (iOS rounds the corners itself).
png('icon.png', 1024, (o) => {
  background(o, 1024);
  drawMark(o, 1024, 0.72);
});
// Android adaptive icon: background layer + foreground inside the 66% safe zone.
png('android-icon-background.png', 512, (o) => background(o, 512));
png('android-icon-foreground.png', 512, (o) => drawMark(o, 512, 0.5));
png('android-icon-monochrome.png', 432, (o) => drawMark(o, 432, 0.5, true));
// Splash: mark only, on the splash backgroundColor from app.json (#0b1220).
png('splash-icon.png', 1024, (o) => drawMark(o, 1024, 0.9));
png('favicon.png', 48, (o) => {
  background(o, 48);
  drawMark(o, 48, 0.86);
});
