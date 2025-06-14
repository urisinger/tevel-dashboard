export class HebrewDecoder implements TextDecoder {
    private static readonly codeToChar: { [key: number]: string } = {
        0xD0: 'א', 0xD1: 'ב', 0xD2: 'ג', 0xD3: 'ד', 0xD4: 'ה',
        0xD5: 'ו', 0xD6: 'ז', 0xD7: 'ח', 0xD8: 'ט', 0xD9: 'י',
        0xDA: 'ך', 0xDB: 'כ', 0xDC: 'ל', 0xDD: 'ם', 0xDE: 'מ',
        0xDF: 'ן', 0xE0: 'נ', 0xE1: 'ס', 0xE2: 'ע', 0xE3: 'ף',
        0xE4: 'פ', 0xE5: 'ץ', 0xE6: 'צ', 0xE7: 'ק', 0xE8: 'ר',
        0xE9: 'ש', 0xEA: 'ת', 0xF0: ' ', 0xF1: '(', 0xF2: ')',
        0xF3: "'", 0xF4: '-', 0xF5: '"'
    };


    decodeCode(code: number): string | undefined {
        return HebrewDecoder.codeToChar[code];
    }

    readonly encoding = 'hebrew-custom';
    readonly fatal = false;
    readonly ignoreBOM = true;

    decode(input: BufferSource): string {
        const view =
            input instanceof ArrayBuffer
                ? new DataView(input)
                : new DataView(input.buffer, input.byteOffset, input.byteLength);

        let result = "";
        for (let i = 0; i < view.byteLength; i++) {
            const byte = view.getUint8(i);
            result += HebrewDecoder.codeToChar[byte] ?? '?';
        }

        return result;
    }

}

export class HebrewEncoder implements TextEncoder {
    private static readonly charToCode: { [key: string]: number } = {
        'א': 0xD0, 'ב': 0xD1, 'ג': 0xD2, 'ד': 0xD3, 'ה': 0xD4,
        'ו': 0xD5, 'ז': 0xD6, 'ח': 0xD7, 'ט': 0xD8, 'י': 0xD9,
        'ך': 0xDA, 'כ': 0xDB, 'ל': 0xDC, 'ם': 0xDD, 'מ': 0xDE,
        'ן': 0xDF, 'נ': 0xE0, 'ס': 0xE1, 'ע': 0xE2, 'ף': 0xE3,
        'פ': 0xE4, 'ץ': 0xE5, 'צ': 0xE6, 'ק': 0xE7, 'ר': 0xE8,
        'ש': 0xE9, 'ת': 0xEA, ' ': 0xF0, '(': 0xF1, ')': 0xF2,
        "'": 0xF3, '-': 0xF4, '"': 0xF5
    };


    encodeChar(char: string): number | undefined {
        return HebrewEncoder.charToCode[char];
    }
    readonly encoding = 'hebrew-custom';

    encode(input: string): Uint8Array {
        const encoded = [...input].map(c => HebrewEncoder.charToCode[c] ?? 0x3F); // 0x3F = '?'
        return Uint8Array.from(encoded);
    }

    encodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
        let read = 0, written = 0;
        for (const char of source) {
            const code = HebrewEncoder.charToCode[char] ?? 0x3F;
            if (written >= destination.length) break;
            destination[written++] = code;
            read++;
        }
        return { read, written };
    }
}