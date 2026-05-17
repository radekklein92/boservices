import opentype from "opentype.js";
import fs from "node:fs";

const buf = fs.readFileSync("/tmp/bo-wordmark/Manrope-Var.ttf");
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// Pick ExtraBold variation (wght=800) if variable font
if (font.tables.fvar && font.variation) {
  font.variation.set({ wght: 800 });
}

const text = "BOServices";
const fontSize = 100;

const path = font.getPath(text, 0, fontSize * 0.78, fontSize);
const bbox = path.getBoundingBox();
const d = path.toPathData(3);

const minX = bbox.x1;
const minY = bbox.y1;
const w = bbox.x2 - bbox.x1;
const h = bbox.y2 - bbox.y1;

console.log(JSON.stringify({
  viewBox: `${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
  width: w.toFixed(2),
  height: h.toFixed(2),
  d,
}, null, 2));
