/**
 * Draw a PhotoComposition (src/core/photoComposition.ts) with Skia on an offscreen surface:
 * photo + skyline + labels + bottom frame. No React; runs on the JS thread once per capture.
 */
import {
  ClipOp,
  ImageFormat,
  PaintStyle,
  type SkCanvas,
  type SkFont,
  type SkImage,
  Skia,
  StrokeCap,
  StrokeJoin,
  matchFont,
} from '@shopify/react-native-skia';
import { Platform } from 'react-native';

import {
  type FontSpec,
  type MeasureText,
  PHOTO_COLORS,
  type PhotoComposition,
  type PhotoText,
} from '../core/photoComposition';

const FONT_FAMILY = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });
const WEIGHT = { regular: '400', semibold: '600', bold: '700' } as const;

const fontCache = new Map<string, SkFont>();
function fontFor(spec: FontSpec): SkFont {
  const key = `${spec.weight}:${spec.sizePx.toFixed(2)}`;
  let f = fontCache.get(key);
  if (!f) {
    f = matchFont({
      fontFamily: FONT_FAMILY,
      fontSize: spec.sizePx,
      fontWeight: WEIGHT[spec.weight],
    });
    fontCache.set(key, f);
  }
  return f;
}

/** Real system-font widths, so labels in the photo are sized for the font that draws them. */
export const measureWithSkia: MeasureText = (text, spec) => {
  const font = fontFor(spec);
  const spacing = spec.letterSpacingPx ?? 0;
  if (spacing === 0) return font.measureText(text).width;
  let w = 0;
  for (const ch of text) w += font.measureText(ch).width;
  return w + spacing * Math.max(0, [...text].length - 1);
};

function drawText(canvas: SkCanvas, t: PhotoText): void {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(t.color));
  paint.setAntiAlias(true);
  const font = fontFor(t.font);
  const spacing = t.font.letterSpacingPx ?? 0;
  if (spacing === 0) {
    canvas.drawText(t.text, t.x, t.baselineY, paint, font);
    return;
  }
  let x = t.x;
  for (const ch of t.text) {
    canvas.drawText(ch, x, t.baselineY, paint, font);
    x += font.measureText(ch).width + spacing;
  }
}

export function drawComposition(canvas: SkCanvas, photo: SkImage, c: PhotoComposition): void {
  const fill = (color: string) => {
    const p = Skia.Paint();
    p.setColor(Skia.Color(color));
    p.setAntiAlias(true);
    return p;
  };
  const stroke = (color: string, widthPx: number) => {
    const p = fill(color);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(widthPx);
    p.setStrokeJoin(StrokeJoin.Round);
    p.setStrokeCap(StrokeCap.Round);
    return p;
  };

  // frame background, then the photo
  canvas.drawRect(Skia.XYWHRect(0, 0, c.widthPx, c.heightPx), fill(PHOTO_COLORS.frameBg));
  canvas.drawImageRect(
    photo,
    Skia.XYWHRect(0, 0, photo.width(), photo.height()),
    Skia.XYWHRect(0, 0, c.widthPx, c.photoHeightPx),
    fill('#000'),
  );

  // skyline + labels stay inside the photo area
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, 0, c.widthPx, c.photoHeightPx), ClipOp.Intersect, true);
  const sky = Skia.PathBuilder.Make();
  for (const line of c.skyline) {
    line.forEach((p, i) => (i === 0 ? sky.moveTo(p.x, p.y) : sky.lineTo(p.x, p.y)));
  }
  const skyPath = sky.detach();
  canvas.drawPath(skyPath, stroke(PHOTO_COLORS.skylineShadow, c.skylineWidthPx * 2.3));
  canvas.drawPath(skyPath, stroke(PHOTO_COLORS.skyline, c.skylineWidthPx));

  const lineStroke = stroke(PHOTO_COLORS.line, Math.max(1, c.scale));
  const dotFill = fill(PHOTO_COLORS.accent);
  const dotRing = stroke('#ffffff', Math.max(1, c.scale));
  const pillFill = fill(PHOTO_COLORS.labelBg);
  // all leader lines + summit dots first, so label pills always sit on top of other lines
  for (const l of c.labels) {
    const leader = Skia.PathBuilder.Make();
    l.leader.forEach((p, i) => (i === 0 ? leader.moveTo(p.x, p.y) : leader.lineTo(p.x, p.y)));
    canvas.drawPath(leader.detach(), lineStroke);
    canvas.drawCircle(l.summit.x, l.summit.y, l.dotRadiusPx, dotFill);
    canvas.drawCircle(l.summit.x, l.summit.y, l.dotRadiusPx, dotRing);
  }
  for (const l of c.labels) {
    const b = l.box;
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(b.left, b.top, b.width, b.height), b.radius, b.radius),
      pillFill,
    );
    l.texts.forEach((t) => drawText(canvas, t));
  }
  canvas.restore();

  // bottom frame
  canvas.drawLine(
    0,
    c.frame.dividerY,
    c.widthPx,
    c.frame.dividerY,
    stroke(PHOTO_COLORS.accent, Math.max(1, 1.5 * c.scale)),
  );
  c.frame.texts.forEach((t) => drawText(canvas, t));
}

/** Render offscreen (CPU raster: no GPU texture-size limits) and encode as JPEG bytes. */
export function renderCompositionToJpeg(
  photo: SkImage,
  c: PhotoComposition,
  quality = 92,
): Uint8Array {
  const surface = Skia.Surface.Make(c.widthPx, c.heightPx);
  if (!surface) throw new Error('Could not create a drawing surface for the photo');
  drawComposition(surface.getCanvas(), photo, c);
  surface.flush();
  const bytes = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, quality);
  if (!bytes || bytes.length === 0) throw new Error('Could not encode the photo');
  return bytes;
}
