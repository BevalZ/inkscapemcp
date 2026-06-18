import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { diffPngBuffers } from "../src/core/png-diff.js";

describe("PNG diff metrics", () => {
  it("compares simple RGBA PNG buffers", () => {
    const red = makePng(1, 1, [255, 0, 0, 255]);
    const blue = makePng(1, 1, [0, 0, 255, 255]);

    expect(diffPngBuffers(red, red)).toMatchObject({
      comparable: true,
      meanAbsoluteError: 0,
      rootMeanSquareError: 0,
      exactPixelMatchRatio: 1,
    });
    expect(diffPngBuffers(red, blue)).toMatchObject({
      comparable: true,
      exactPixelMatchRatio: 0,
    });
  });
});

function makePng(width: number, height: number, rgba: number[]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rows: number[] = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) {
      rows.push(...rgba);
    }
  }
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}
