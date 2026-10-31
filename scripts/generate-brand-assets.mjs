/** Generate the Nexora PNG brand kit from one embedded, transparent source.
 * No native libraries, remote images, or network calls required during Vercel builds.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const ROOT = process.cwd();
const read32 = (b, at) => b.readUInt32BE(at);
const source = readFileSync(join(ROOT, 'scripts/nexora-logo-source.b64'), 'utf8').trim();
const png = Buffer.from(source, 'base64');

function readPng(buf) {
  const signature = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== signature) throw Error('Invalid PNG logo source');
  let w = 0, h = 0, color = 0, depth = 0, palette = null, alpha = null;
  const chunks = [];
  for (let at = 8; at < buf.length;) {
    const length = read32(buf, at);
    const kind = buf.toString('ascii', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { w = read32(data, 0); h = read32(data, 4); depth = data[8]; color = data[9]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') alpha = data;
    else if (kind === 'IDAT') chunks.push(data);
    at += length + 12;
    if (kind === 'IEND') break;
  }
  if (depth !== 8 || color !== 3 || !palette) throw Error('Expected 8-bit indexed PNG');
  const compressed = inflateSync(Buffer.concat(chunks));
  const decoded = Buffer.alloc(w * h * 4);
  const previous = Buffer.alloc(w);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const type = compressed[pos++];
    const current = Buffer.from(compressed.subarray(pos, pos + w));
    pos += w;
    for (let x = 0; x < w; x++) {
      const left = x ? current[x - 1] : 0;
      const up = previous[x];
      const upperLeft = x ? previous[x - 1] : 0;
      let prediction = 0;
      if (type === 1) prediction = left;
      else if (type === 2) prediction = up;
      else if (type === 3) prediction = Math.floor((left + up) / 2);
      else if (type === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      } else if (type !== 0) throw Error('Unexpected PNG filter');
      current[x] = (current[x] + prediction) & 255;
      const idx = current[x];
      const offset = (y * w + x) * 4;
      decoded[offset] = palette[idx * 3];
      decoded[offset + 1] = palette[idx * 3 + 1];
      decoded[offset + 2] = palette[idx * 3 + 2];
      decoded[offset + 3] = alpha && idx < alpha.length ? alpha[idx] : 255;
    }
    current.copy(previous);
  }
  return { w, h, pixels: decoded };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, check]);
}
function writePng(filename, image) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.w, 0); ihdr.writeUInt32BE(image.h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(image.h * (1 + image.w * 4));
  for (let y = 0; y < image.h; y++) {
    const dest = y * (1 + image.w * 4);
    raw[dest] = 1; // Sub filter: helps keep gradients and transparency lossless.
    for (let x = 0; x < image.w * 4; x++) {
      const v = image.pixels[(y * image.w * 4) + x];
      const prior = x >= 4 ? image.pixels[(y * image.w * 4) + x - 4] : 0;
      raw[dest + 1 + x] = (v - prior + 256) & 255;
    }
  }
  const output = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
  const out = join(ROOT, 'public', filename);
  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(out, output);
  return output;
}
function resize(img, w, h) {
  const result = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sourceY = Math.max(0, Math.min(img.h - 1, (y + 0.5) * img.h / h - 0.5));
    const y0 = Math.floor(sourceY), y1 = Math.min(img.h - 1, y0 + 1), dy = sourceY - y0;
    for (let x = 0; x < w; x++) {
      const sourceX = Math.max(0, Math.min(img.w - 1, (x + 0.5) * img.w / w - 0.5));
      const x0 = Math.floor(sourceX), x1 = Math.min(img.w - 1, x0 + 1), dx = sourceX - x0;
      const out = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = img.pixels[(y0 * img.w + x0) * 4 + c];
        const tr = img.pixels[(y0 * img.w + x1) * 4 + c];
        const bl = img.pixels[(y1 * img.w + x0) * 4 + c];
        const br = img.pixels[(y1 * img.w + x1) * 4 + c];
        result[out + c] = Math.round((tl * (1 - dx) + tr * dx) * (1 - dy) + (bl * (1 - dx) + br * dx) * dy);
      }
    }
  }
  return { w, h, pixels: result };
}
function crop(image, x, y, w, h) {
  const pixels = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) image.pixels.copy(pixels, row * w * 4, ((y + row) * image.w + x) * 4, ((y + row) * image.w + x + w) * 4);
  return { w, h, pixels };
}
function recolorDark(image, onlyWordmark) {
  const result = Buffer.from(image.pixels);
  for (let y = 0; y < image.h; y++) {
    const onWordmark = y >= image.h * 0.69;
    for (let x = 0; x < image.w; x++) {
      const i = (y * image.w + x) * 4;
      if (result[i + 3] === 0) continue;
      const r = result[i], g = result[i + 1], b = result[i + 2];
      if (r < 80 && g < 130 && b < 210) {
        if (onlyWordmark && onWordmark) {
          result[i] = 239; result[i + 1] = 248; result[i + 2] = 255;
        } else {
          result[i] = Math.max(20, r + 30);
          result[i + 1] = Math.max(100, g + 85);
          result[i + 2] = Math.min(255, b + 105);
        }
      }
    }
  }
  return { ...image, pixels: result };
}
/** Transparent PNG for browser tabs: only the official Nexora symbol, never the PWA background. */
function tabFavicon(symbol, size) {
  const pixels = Buffer.alloc(size * size * 4);
  const height = Math.round(size * 0.9);
  const width = Math.round(height * symbol.w / symbol.h);
  const scaled = resize(symbol, width, height);
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  for (let y = 0; y < height; y++) {
    scaled.pixels.copy(
      pixels,
      ((y + top) * size + left) * 4,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  return { w: size, h: size, pixels };
}

function appIcon(symbol, size, maskable = false) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const glow = Math.max(0, 1 - Math.hypot(x / size - 0.17, y / size - 0.12) / 1.1);
      pixels[i] = Math.round(7 + glow * 5);
      pixels[i + 1] = Math.round(18 + glow * 16);
      pixels[i + 2] = Math.round(40 + glow * 32);
      pixels[i + 3] = 255;
    }
  }
  const proportion = maskable ? 0.61 : 0.72;
  const side = Math.round(size * proportion);
  const scaled = resize(recolorDark(symbol, false), side, side);
  const start = Math.floor((size - side) / 2);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const src = (y * side + x) * 4, dst = ((y + start) * size + x + start) * 4;
    const alpha = scaled.pixels[src + 3] / 255;
    for (let c = 0; c < 3; c++) pixels[dst + c] = Math.round(scaled.pixels[src + c] * alpha + pixels[dst + c] * (1 - alpha));
  }
  return { w: size, h: size, pixels };
}


function horizontalLogo(image) {
  const width = 556, height = 128;
  const pixels = Buffer.alloc(width * height * 4);
  const icon = resize(crop(image, 112, 63, 236, 245), 112, 116);
  const name = resize(crop(image, 19, 310, 415, 92), 403, 89);
  const paste = (part, px, py) => {
    for (let y = 0; y < part.h; y++) {
      const targetStart = ((y + py) * width + px) * 4;
      part.pixels.copy(pixels, targetStart, y * part.w * 4, (y + 1) * part.w * 4);
    }
  };
  paste(icon, 4, 6);
  paste(name, 143, 20);
  return { w: width, h: height, pixels };
}

const logo = readPng(png);
const symbol = crop(logo, 112, 63, 236, 245);
writePng('branding/nexora-logo-light.png', logo);
writePng('branding/nexora-logo-dark.png', recolorDark(logo, true));
writePng('branding/nexora-horizontal-light.png', horizontalLogo(logo));
// Compartir la variante PNG transparente de alto contraste con los PDF.
// El build genera el base64 localmente: no depende de red ni de CSS al exportar.
const pdfDarkLogoPng = writePng('branding/nexora-horizontal-dark.png', horizontalLogo(recolorDark(logo, true)));
writeFileSync(join(ROOT, 'scripts/nexora-pdf-logo.b64'), pdfDarkLogoPng.toString('base64'));
writePng('branding/nexora-symbol.png', resize(symbol, 384, 400));
writePng('branding/nexora-symbol-dark.png', resize(recolorDark(symbol, false), 384, 400));
// Tabs use transparent 32/48px PNGs; installed-app icons keep their dark PWA backgrounds.
for (const size of [32, 48]) {
  writePng(`icons/favicon-${size}.png`, tabFavicon(symbol, size));
}
for (const size of [180, 192, 512]) {
  const filename = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writePng(`icons/${filename}`, appIcon(symbol, size));
}
writePng('icons/icon-maskable-512.png', appIcon(symbol, 512, true));
// Mantener URLs históricas que aún puedan estar en caché en Vercel o accesos guardados:
// en cada build también sirven el isotipo oficial, nunca el antiguo logo naranja.
writePng('icons/logo-bodega6a.png', appIcon(symbol, 512));

// Replace the browser's legacy favicon fallback and SVG fallback as well.
const favicon = readFileSync(join(ROOT, 'public/icons/favicon-32.png'));
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2); // ICO format
icoHeader.writeUInt16LE(1, 4); // one image
icoHeader[6] = 32; icoHeader[7] = 32;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(favicon.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync(join(ROOT, 'public/favicon.ico'), Buffer.concat([icoHeader, favicon]));
const icon512 = readFileSync(join(ROOT, 'public/icons/icon-512.png'));
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${icon512.toString('base64')}"/></svg>`;
writeFileSync(join(ROOT, 'public/icons/icon.svg'), svgIcon);
console.log('Nexora branding: PNG logo, light/dark theme, favicon and PWA icons generated');