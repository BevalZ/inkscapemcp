import { inflateSync } from "node:zlib";

export interface PngDiffMetrics {
  comparable: boolean;
  reason?: string;
  width?: number;
  height?: number;
  meanAbsoluteError?: number;
  rootMeanSquareError?: number;
  exactPixelMatchRatio?: number;
}

interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function diffPngBuffers(expected: Buffer, actual: Buffer): PngDiffMetrics {
  const left = decodePng(expected);
  const right = decodePng(actual);
  if (!left || !right) {
    return { comparable: false, reason: "unsupported_png" };
  }
  if (left.width !== right.width || left.height !== right.height) {
    return {
      comparable: false,
      reason: "dimension_mismatch",
      width: right.width,
      height: right.height,
    };
  }

  let absolute = 0;
  let squared = 0;
  let exactPixels = 0;
  for (let index = 0; index < left.rgba.length; index += 4) {
    let exact = true;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(left.rgba[index + channel] - right.rgba[index + channel]);
      absolute += delta;
      squared += delta * delta;
      if (delta !== 0) exact = false;
    }
    if (exact) exactPixels += 1;
  }
  const channelCount = left.rgba.length;
  const pixelCount = left.width * left.height;
  return {
    comparable: true,
    width: left.width,
    height: left.height,
    meanAbsoluteError: absolute / channelCount,
    rootMeanSquareError: Math.sqrt(squared / channelCount),
    exactPixelMatchRatio: exactPixels / pixelCount,
  };
}

function decodePng(buffer: Buffer): DecodedPng | undefined {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) return undefined;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) return undefined;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      const compression = data[10] ?? 0;
      const filter = data[11] ?? 0;
      const interlace = data[12] ?? 0;
      if (bitDepth !== 8 || compression !== 0 || filter !== 0 || interlace !== 0) return undefined;
      if (colorType !== 2 && colorType !== 6) return undefined;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || idatChunks.length === 0) return undefined;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterRow(row, previous, bytesPerPixel, filterType);
    for (let x = 0; x < width; x += 1) {
      const src = x * bytesPerPixel;
      const dst = (y * width + x) * 4;
      rgba[dst] = row[src] ?? 0;
      rgba[dst + 1] = row[src + 1] ?? 0;
      rgba[dst + 2] = row[src + 2] ?? 0;
      rgba[dst + 3] = colorType === 6 ? (row[src + 3] ?? 255) : 255;
    }
    previous = row;
  }
  return { width, height, rgba };
}

function unfilterRow(row: Buffer, previous: Buffer, bytesPerPixel: number, filterType: number): void {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] ?? 0 : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
    if (filterType === 0) continue;
    if (filterType === 1) row[index] = (row[index] + left) & 0xff;
    else if (filterType === 2) row[index] = (row[index] + up) & 0xff;
    else if (filterType === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    else if (filterType === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
