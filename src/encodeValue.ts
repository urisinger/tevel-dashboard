import { Value } from "./expr";

/**
 * Writes the binary little-endian encoding of the given value into the provided buffer.
 * Returns the number of bytes written.
 *
 * Note: For I64 values, we use BigInt and DataView.setBigInt64.
 */
export function writeInto(value: Value, buf: Uint8Array): number {
    let offset = 0;
    const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  
    switch (value.kind) {
      case "I8": {
        dataView.setInt8(offset, value.value);
        offset += 1;
        break;
      }
      case "I16": {
        dataView.setInt16(offset, value.value, true); // true for little-endian
        offset += 2;
        break;
      }
      case "I32": {
        dataView.setInt32(offset, value.value, true);
        offset += 4;
        break;
      }
      case "I64": {
        // value.value is expected to be a bigint
        dataView.setBigInt64(offset, value.value, true);
        offset += 8;
        break;
      }
      case "F32": {
        dataView.setFloat32(offset, value.value, true);
        offset += 4;
        break;
      }
      case "F64": {
        dataView.setFloat64(offset, value.value, true);
        offset += 8;
        break;
      }
      case "Struct": {
        for (const [, fieldValue] of value.fields) {
          // Recursively write each field into the buffer, updating the offset.
          const written = writeInto(fieldValue, buf.subarray(offset));
          offset += written;
        }
        break;
      }
      default:
        throw new Error(`Unsupported value kind: ${(value as any).kind}`);
    }
  
    return offset;
  }
  

/**
 * Recursively computes the size (in bytes) of a given Value.
 */
export function sizeOfValue(value: Value): number {
  switch (value.kind) {
    case "I8":
      return 1;
    case "I16":
      return 2;
    case "I32":
      return 4;
    case "I64":
      return 8;
    case "F32":
      return 4;
    case "F64":
      return 8;
    case "Struct": {
      let total = 0;
      for (const [, fieldValue] of value.fields) {
        total += sizeOfValue(fieldValue);
      }
      return total;
    }
    default:
      throw new Error(`Unsupported value kind: ${(value as any).kind}`);
  }
}

/**
 * Encodes a Value into a Uint8Array.
 * It first computes the total size needed, allocates a buffer,
 * then writes the value into the buffer.
 */
export function encodeValue(value: Value): Uint8Array {
  const totalSize = sizeOfValue(value);
  const buf = new Uint8Array(totalSize);
  const bytesWritten = writeInto(value, buf);
  if (bytesWritten !== totalSize) {
    console.warn(
      `Warning: Expected to write ${totalSize} bytes, but wrote ${bytesWritten} bytes.`
    );
  }
  return buf;
}


export default encodeValue;
