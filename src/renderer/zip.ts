const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

interface Entry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
  time: number;
  date: number;
}

/** Escritor ZIP "store" (sem compressão): suficiente para .md pequenos e imagens já comprimidas. */
export class ZipWriter {
  private parts: Uint8Array[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  private enc = new TextEncoder();

  async add(path: string, content: string | Blob | Uint8Array) {
    const data = typeof content === "string" ? this.enc.encode(content) : content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;
    const name = this.enc.encode(path);
    const { time, date } = dosDateTime(new Date());
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true);
    header.setUint16(8, 0, true);
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true);
    this.entries.push({ name, data, crc, offset: this.offset, time, date });
    this.push(new Uint8Array(header.buffer), name, data);
  }

  private push(...chunks: Uint8Array[]) {
    for (const c of chunks) {
      this.parts.push(c);
      this.offset += c.length;
    }
  }

  finish(): Blob {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, e.time, true);
      h.setUint16(14, e.date, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.data.length, true);
      h.setUint32(24, e.data.length, true);
      h.setUint16(28, e.name.length, true);
      h.setUint16(30, 0, true);
      h.setUint16(32, 0, true);
      h.setUint16(34, 0, true);
      h.setUint16(36, 0, true);
      h.setUint32(38, 0, true);
      h.setUint32(42, e.offset, true);
      this.push(new Uint8Array(h.buffer), e.name);
    }
    const cdSize = this.offset - cdStart;
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, cdStart, true);
    end.setUint16(20, 0, true);
    this.push(new Uint8Array(end.buffer));
    return new Blob(this.parts as BlobPart[], { type: "application/zip" });
  }
}
