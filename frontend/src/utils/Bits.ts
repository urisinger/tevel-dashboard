import { HebrewEncoder } from "./hebrew";

export class BitWriter {
    private buffer: ArrayBuffer;
    private view: DataView;
    private capacity: number;
    private bytePos = 0;
    private bitPos = 0; // 0–7 within current byte

    constructor(initialBytes = 8) {
        this.capacity = initialBytes;
        this.buffer = new ArrayBuffer(this.capacity);
        this.view = new DataView(this.buffer);
    }

    /** Ensure we have at least `needed` more bytes capacity. */
    private ensureCapacity(needed: number) {
        if (this.bytePos + needed > this.capacity) {
            // double until it fits
            let newCap = this.capacity;
            while (this.bytePos + needed > newCap) newCap *= 2;
            const newBuf = new ArrayBuffer(newCap);
            new Uint8Array(newBuf).set(new Uint8Array(this.buffer));
            this.buffer = newBuf;
            this.view = new DataView(this.buffer);
            this.capacity = newCap;
        }
    }

    /** Write the low `width` bits of `value` (0 ≤ width ≤ 32). */
    writeBits(value: number, width: number) {
        if (width < 0 || width > 32) {
            throw new Error(`Invalid bit width ${width}, must be 0..32`);
        }
        for (let i = width - 1; i >= 0; i--) {
            const bit = (value >>> i) & 1;
            this.ensureCapacity(1);
            if (this.bitPos === 0) this.view.setUint8(this.bytePos, 0);
            const curr = this.view.getUint8(this.bytePos);
            this.view.setUint8(this.bytePos, curr | (bit << (7 - this.bitPos)));
            this.bitPos++;
            if (this.bitPos === 8) {
                this.bitPos = 0;
                this.bytePos++;
            }
        }
    }

    /**
     * Write the low `width` bits of a bigint (0 ≤ width ≤ 64), MSB first.
     */
    writeBits64(value: bigint, width: number) {
        if (width < 0 || width > 64) {
            throw new Error(`Invalid bit width ${width}, must be 0..64`);
        }
        // mask off any bits above `width`
        const mask = (1n << BigInt(width)) - 1n;
        const v = value & mask;
        for (let i = BigInt(width - 1); i >= 0n; i--) {
            const bit = Number((v >> i) & 1n);
            this.ensureCapacity(1);
            if (this.bitPos === 0) this.view.setUint8(this.bytePos, 0);
            const curr = this.view.getUint8(this.bytePos);
            this.view.setUint8(this.bytePos, curr | (bit << (7 - this.bitPos)));
            this.bitPos++;
            if (this.bitPos === 8) {
                this.bitPos = 0;
                this.bytePos++;
            }
        }
    }

    /**
     * Write a 32-bit IEEE-754 float in little endian.
     */
    writeFloat32(value: number) {
        // pack into 4-byte buffer
        const tmp = new ArrayBuffer(4);
        new DataView(tmp).setFloat32(0, value, true);
        // write each byte MSB-first in the bitstream
        const bytes = new Uint8Array(tmp);
        for (const b of bytes) this.writeBits(b, 8);
    }

    /**
     * Write a 64-bit IEEE-754 float in little endian.
     */
    writeFloat64(value: number) {
        const tmp = new ArrayBuffer(8);
        new DataView(tmp).setFloat64(0, value, true);
        const bytes = new Uint8Array(tmp);
        for (const b of bytes) this.writeBits(b, 8);
    }

    /**
     * Write an array of raw bytes (each 0–255) to the bitstream,
     * MSB-first in each byte.
     */
    writeBytes(bytes: Uint8Array) {
        for (const b of bytes) {
            this.writeBits(b, 8);
        }
    }

    /**
     * Write a null-terminated UTF-8 C-string.
     */
    writeCString(str: string) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        this.writeBytes(bytes);
        this.writeBits(0, 8); // trailing NUL
    }

    /**
     * Write a null-terminated HebrewString (using your custom encoder).
     */
    writeHebrewString(str: string) {
        const encoder = new HebrewEncoder();
        const bytes = encoder.encode(str);
        this.writeBytes(bytes);
        this.writeBits(0, 8); // trailing NUL
    }

    /**
     * Write an unsigned bigint of up to 64 bits.
     */
    writeUInt(value: bigint, width: number) {
        this.writeBits64(value, width);
    }

    /**
     * Write a signed two’s-complement bigint of up to 64 bits.
     */
    writeInt(value: bigint, width: number) {
        const widthBig = BigInt(width);
        const bits = 1n << widthBig;
        const mask = bits - 1n;
        const twos = value & mask;
        this.writeBits64(twos, width);
    }

    /** 
     * Finalize and return an ArrayBuffer trimmed to the exact length used.
     * Any partial byte at the end is zero-padded.
     */
    finish(): ArrayBuffer {
        const usedBytes = this.bytePos + (this.bitPos > 0 ? 1 : 0);
        return this.buffer.slice(0, usedBytes);
    }
}


export class BitReader {
    private view: DataView;
    private bytePos = 0;
    private bitPos = 0;

    constructor(buffer: ArrayBuffer) {
        this.view = new DataView(buffer);
    }

    /** Read `width` bits (0 ≤ width ≤ 32) as unsigned number. */
    readBits(width: number): number | undefined {
        let value = 0;
        for (let i = width - 1; i >= 0; i--) {
            if (this.bytePos >= this.view.byteLength) return undefined;
            const byte = this.view.getUint8(this.bytePos);
            const bit = (byte >>> (7 - this.bitPos)) & 1;
            value |= bit << i;
            this.advanceBit();
        }
        return value;
    }

    /** Read `width` bits (0 ≤ width ≤ 64) as unsigned bigint. */
    readBits64(width: number): bigint | undefined {
        if (width < 0 || width > 64) {
            throw new Error(`Invalid bit width ${width}, must be 0..64`);
        }
        let value = 0n;
        for (let i = BigInt(width - 1); i >= 0n; i--) {
            if (this.bytePos >= this.view.byteLength) return undefined;
            const byte = this.view.getUint8(this.bytePos);
            const bit = BigInt((byte >>> (7 - this.bitPos)) & 1);
            value |= bit << i;
            this.advanceBit();
        }
        return value;
    }

    /** Read `width` bits as an unsigned bigint. */
    readUInt(width: number): bigint | undefined {
        return this.readBits64(width);
    }

    /**
     * Read `width` bits as a signed two’s-complement bigint
     * in range [−2^(width−1) … 2^(width−1)−1].
     */
    readInt(width: number): bigint | undefined {
        const raw = this.readBits64(width);
        if (raw === undefined) return undefined;

        const signBit = 1n << BigInt(width - 1);
        // if sign bit is set, subtract 2^width
        return raw & signBit ? raw - (1n << BigInt(width)) : raw;
    }

    /** Helper to advance one bit, moving to next byte as needed. */
    private advanceBit() {
        this.bitPos++;
        if (this.bitPos === 8) {
            this.bitPos = 0;
            this.bytePos++;
        }
    }

    isEOF(): boolean {
        return this.bytePos >= this.view.byteLength;
    }
}
