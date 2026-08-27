const TAG = Object.freeze({
  NULL: 0, FALSE: 1, TRUE: 2, UNDEFINED: 3, INTEGER: 4, FLOAT64: 5, STRING: 6,
  ARRAY: 7, OBJECT: 8, TYPED_ARRAY: 9, INTEGER_ARRAY: 10, FLOAT64_ARRAY: 11,
  RAGGED_INTEGER: 12, FIXED_FLOAT_TUPLES: 13, OBJECT_TABLE: 14, SPARSE_INTEGER: 15,
  DECIMAL_ARRAY: 16, FIXED_DECIMAL_TUPLES: 17, PACKED_TYPED_ARRAY: 18
});

const TYPED_ARRAYS = Object.freeze([
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
  Int32Array, Uint32Array, Float32Array, Float64Array,
  typeof BigInt64Array === "function" ? BigInt64Array : null,
  typeof BigUint64Array === "function" ? BigUint64Array : null
]);

export function encodeCompactBinaryValue(value) {
  const strings = collectStrings(value);
  const stringIds = new Map(strings.map((text, index) => [text, index]));
  const writer = new BinaryWriter();
  writer.bytes(new Uint8Array([0x43, 0x42, 0x56, 0x31]));
  writer.varuint(strings.length);
  for (const text of strings) writer.text(text);
  writeValue(writer, value, stringIds);
  return writer.finish();
}

export function decodeCompactBinaryValue(bytes) {
  const reader = new BinaryReader(bytes);
  if (reader.u8() !== 0x43 || reader.u8() !== 0x42 || reader.u8() !== 0x56 || reader.u8() !== 0x31) {
    throw codecError("compact_binary_magic_invalid", "紧凑二进制分区 magic 无效");
  }
  const strings = Array.from({length: reader.varuint()}, () => reader.text());
  const value = readValue(reader, strings);
  if (!reader.done()) throw codecError("compact_binary_trailing_bytes", "紧凑二进制分区存在尾随字节");
  return value;
}

export async function decodeCompactBinaryValueAsync(bytes, options = {}) {
  const reader = new BinaryReader(bytes);
  const checkpoint = createDecodeCheckpoint(options);
  if (reader.u8() !== 0x43 || reader.u8() !== 0x42 || reader.u8() !== 0x56 || reader.u8() !== 0x31) {
    throw codecError("compact_binary_magic_invalid", "紧凑二进制分区 magic 无效");
  }
  const stringCount = reader.varuint();
  const strings = new Array(stringCount);
  for (let index = 0; index < stringCount; index += 1) {
    strings[index] = reader.text();
    if (!(index & 255)) await checkpoint();
  }
  const value = await readValueAsync(reader, strings, checkpoint);
  if (!reader.done()) throw codecError("compact_binary_trailing_bytes", "紧凑二进制分区存在尾随字节");
  return value;
}

function writeValue(writer, value, stringIds) {
  if (value === null) return writer.u8(TAG.NULL);
  if (value === false) return writer.u8(TAG.FALSE);
  if (value === true) return writer.u8(TAG.TRUE);
  if (value === undefined) return writer.u8(TAG.UNDEFINED);
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) {
      writer.u8(TAG.INTEGER);
      writer.svarint(value);
    } else {
      writer.u8(TAG.FLOAT64);
      writer.f64(value);
    }
    return;
  }
  if (typeof value === "string") {
    writer.u8(TAG.STRING);
    writer.varuint(stringIds.get(value));
    return;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return writeTypedArray(writer, value);
  if (Array.isArray(value)) return writeArray(writer, value, stringIds);
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);
    writer.u8(TAG.OBJECT);
    writer.varuint(entries.length);
    for (const [key, child] of entries) {
      writer.varuint(stringIds.get(key));
      writeValue(writer, child, stringIds);
    }
    return;
  }
  throw codecError("compact_binary_value_unsupported", `紧凑二进制不支持 ${Object.prototype.toString.call(value)}`);
}

function writeArray(writer, value, stringIds) {
  assertDenseArray(value);
  if (value.length >= 4 && value.every(item => Number.isSafeInteger(item) && !Object.is(item, -0))) return writeIntegerArray(writer, value);
  if (value.length >= 4 && value.every(item => typeof item === "number")) {
    const decimal = decimalProfile(value);
    if (decimal) {
      writer.u8(TAG.DECIMAL_ARRAY);
      writer.u8(decimal.exponent);
      writePackedIntegers(writer, decimal.values, integerProfile(decimal.values));
      return;
    }
    writer.u8(TAG.FLOAT64_ARRAY);
    writer.varuint(value.length);
    for (const item of value) writer.f64(item);
    return;
  }
  if (value.length >= 4 && value.every(isIntegerArray)) return writeRaggedIntegerArray(writer, value);
  const tupleLength = fixedNumericTupleLength(value);
  if (value.length >= 4 && tupleLength > 0) {
    const flat = value.flat();
    const decimal = decimalProfile(flat);
    writer.u8(decimal ? TAG.FIXED_DECIMAL_TUPLES : TAG.FIXED_FLOAT_TUPLES);
    writer.varuint(value.length);
    writer.varuint(tupleLength);
    if (decimal) {
      writer.u8(decimal.exponent);
      writePackedIntegers(writer, decimal.values, integerProfile(decimal.values));
    } else {
      for (const item of flat) writer.f64(item);
    }
    return;
  }
  const tableKeys = objectTableKeys(value);
  if (tableKeys) {
    writer.u8(TAG.OBJECT_TABLE);
    writer.varuint(value.length);
    writer.varuint(tableKeys.length);
    for (const key of tableKeys) writer.varuint(stringIds.get(key));
    for (const key of tableKeys) writeArray(writer, value.map(row => row[key]), stringIds);
    return;
  }
  writer.u8(TAG.ARRAY);
  writer.varuint(value.length);
  for (const item of value) writeValue(writer, item, stringIds);
}

function writeTypedArray(writer, value) {
  const type = TYPED_ARRAYS.indexOf(value.constructor);
  if (type < 0) throw codecError("compact_binary_typed_array_unsupported", `不支持 ${value.constructor?.name || "TypedArray"}`);
  if (type <= 6 && value.length >= 32) {
    writer.u8(TAG.PACKED_TYPED_ARRAY);
    writer.u8(type);
    writeIntegerArray(writer, value);
    return;
  }
  writer.u8(TAG.TYPED_ARRAY);
  writer.u8(type);
  writer.varuint(value.length);
  writer.bytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
}

function writeIntegerArray(writer, value) {
  const profile = integerProfile(value);
  const sparse = sparseIntegerProfile(value, profile);
  if (sparse && sparse.estimatedBytes < profile.estimatedBytes) {
    writer.u8(TAG.SPARSE_INTEGER);
    writer.varuint(value.length);
    writer.svarint(sparse.defaultValue);
    writer.varuint(sparse.entries.length);
    let previous = -1;
    for (const entry of sparse.entries) {
      writer.varuint(entry.index - previous - 1);
      writer.svarint(entry.value);
      previous = entry.index;
    }
    return;
  }
  writer.u8(TAG.INTEGER_ARRAY);
  writePackedIntegers(writer, value, profile);
}

function writeRaggedIntegerArray(writer, rows) {
  writer.u8(TAG.RAGGED_INTEGER);
  writer.varuint(rows.length);
  let flatLength = 0;
  let populatedRows = 0;
  for (const row of rows) {
    writer.varuint(row.length);
    flatLength += row.length;
    if (row.length) populatedRows += 1;
  }
  const flat = new Array(flatLength);
  const first = new Array(populatedRows);
  const deltas = new Array(flatLength - populatedRows);
  let flatIndex = 0;
  let firstIndex = 0;
  let deltaIndex = 0;
  for (const row of rows) {
    if (!row.length) continue;
    first[firstIndex++] = row[0];
    flat[flatIndex++] = row[0];
    for (let index = 1; index < row.length; index += 1) {
      flat[flatIndex++] = row[index];
      deltas[deltaIndex++] = row[index] - row[index - 1];
    }
  }
  const flatProfile = integerProfile(flat);
  const firstProfile = integerProfile(first);
  const deltaProfile = integerProfile(deltas);
  const useDelta = firstProfile.estimatedBytes + deltaProfile.estimatedBytes < flatProfile.estimatedBytes;
  writer.u8(useDelta ? 1 : 0);
  if (useDelta) {
    writePackedIntegers(writer, first, firstProfile);
    writePackedIntegers(writer, deltas, deltaProfile);
  } else writePackedIntegers(writer, flat, flatProfile);
}

function writePackedIntegers(writer, values, profile) {
  writer.varuint(values.length);
  writer.svarint(profile.min);
  writer.u8(profile.bits);
  if (!profile.bits) return;
  const packed = packIntegers(values, profile.min, profile.bits);
  writer.varuint(packed.length);
  writer.bytes(packed);
}

function readValue(reader, strings) {
  const tag = reader.u8();
  if (tag === TAG.NULL) return null;
  if (tag === TAG.FALSE) return false;
  if (tag === TAG.TRUE) return true;
  if (tag === TAG.UNDEFINED) return undefined;
  if (tag === TAG.INTEGER) return reader.svarint();
  if (tag === TAG.FLOAT64) return reader.f64();
  if (tag === TAG.STRING) return requireString(strings, reader.varuint());
  if (tag === TAG.ARRAY) return Array.from({length: reader.varuint()}, () => readValue(reader, strings));
  if (tag === TAG.OBJECT) {
    const output = {};
    for (let index = 0, length = reader.varuint(); index < length; index += 1) {
      output[requireString(strings, reader.varuint())] = readValue(reader, strings);
    }
    return output;
  }
  if (tag === TAG.TYPED_ARRAY) return readTypedArray(reader);
  if (tag === TAG.PACKED_TYPED_ARRAY) {
    const Constructor = TYPED_ARRAYS[reader.u8()];
    if (!Constructor) throw codecError("compact_binary_typed_array_unsupported", "TypedArray 类型无效");
    return new Constructor(readValue(reader, strings));
  }
  if (tag === TAG.INTEGER_ARRAY) return readPackedIntegers(reader);
  if (tag === TAG.FLOAT64_ARRAY) return Array.from({length: reader.varuint()}, () => reader.f64());
  if (tag === TAG.DECIMAL_ARRAY) {
    const scale = 10 ** reader.u8();
    return readPackedIntegers(reader).map(value => value / scale);
  }
  if (tag === TAG.RAGGED_INTEGER) {
    const lengths = Array.from({length: reader.varuint()}, () => reader.varuint());
    const mode = reader.u8();
    let flat;
    if (mode === 1) {
      const first = readPackedIntegers(reader);
      const deltas = readPackedIntegers(reader);
      flat = [];
      let firstIndex = 0;
      let deltaIndex = 0;
      for (const length of lengths) {
        if (!length) continue;
        let value = first[firstIndex++];
        flat.push(value);
        for (let index = 1; index < length; index += 1) {
          value += deltas[deltaIndex++];
          flat.push(value);
        }
      }
    } else if (mode === 0) flat = readPackedIntegers(reader);
    else throw codecError("compact_binary_ragged_mode_invalid", "紧凑二进制 CSR 模式无效");
    let offset = 0;
    return lengths.map(length => {
      const row = flat.slice(offset, offset + length);
      offset += length;
      return row;
    });
  }
  if (tag === TAG.FIXED_FLOAT_TUPLES) {
    const rows = reader.varuint();
    const columns = reader.varuint();
    return Array.from({length: rows}, () => Array.from({length: columns}, () => reader.f64()));
  }
  if (tag === TAG.FIXED_DECIMAL_TUPLES) {
    const rows = reader.varuint();
    const columns = reader.varuint();
    const scale = 10 ** reader.u8();
    const flat = readPackedIntegers(reader).map(value => value / scale);
    return Array.from({length: rows}, (_, row) => flat.slice(row * columns, (row + 1) * columns));
  }
  if (tag === TAG.OBJECT_TABLE) {
    const rows = reader.varuint();
    const keys = Array.from({length: reader.varuint()}, () => requireString(strings, reader.varuint()));
    const columns = keys.map(() => readValue(reader, strings));
    return Array.from({length: rows}, (_, row) => Object.fromEntries(keys.map((key, column) => [key, columns[column][row]])));
  }
  if (tag === TAG.SPARSE_INTEGER) {
    const output = new Array(reader.varuint()).fill(reader.svarint());
    let index = -1;
    for (let count = reader.varuint(); count > 0; count -= 1) {
      index += reader.varuint() + 1;
      output[index] = reader.svarint();
    }
    return output;
  }
  throw codecError("compact_binary_tag_invalid", `未知紧凑二进制 tag：${tag}`);
}

function readTypedArray(reader) {
  const Constructor = TYPED_ARRAYS[reader.u8()];
  if (!Constructor) throw codecError("compact_binary_typed_array_unsupported", "TypedArray 类型无效");
  const length = reader.varuint();
  const byteLength = length * Constructor.BYTES_PER_ELEMENT;
  const bytes = reader.bytes(byteLength);
  const copy = new Uint8Array(byteLength);
  copy.set(bytes);
  return new Constructor(copy.buffer);
}

async function readValueAsync(reader, strings, checkpoint) {
  const tag = reader.u8();
  if (tag === TAG.NULL) return null;
  if (tag === TAG.FALSE) return false;
  if (tag === TAG.TRUE) return true;
  if (tag === TAG.UNDEFINED) return undefined;
  if (tag === TAG.INTEGER) return reader.svarint();
  if (tag === TAG.FLOAT64) return reader.f64();
  if (tag === TAG.STRING) return requireString(strings, reader.varuint());
  if (tag === TAG.ARRAY) {
    const output = new Array(reader.varuint());
    for (let index = 0; index < output.length; index += 1) {
      output[index] = await readValueAsync(reader, strings, checkpoint);
      if (!(index & 255)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.OBJECT) {
    const output = {};
    for (let index = 0, length = reader.varuint(); index < length; index += 1) {
      output[requireString(strings, reader.varuint())] = await readValueAsync(reader, strings, checkpoint);
      if (!(index & 255)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.TYPED_ARRAY) return readTypedArrayAsync(reader, checkpoint);
  if (tag === TAG.PACKED_TYPED_ARRAY) {
    const Constructor = TYPED_ARRAYS[reader.u8()];
    if (!Constructor) throw codecError("compact_binary_typed_array_unsupported", "TypedArray 类型无效");
    return new Constructor(await readValueAsync(reader, strings, checkpoint));
  }
  if (tag === TAG.INTEGER_ARRAY) return readPackedIntegersAsync(reader, checkpoint);
  if (tag === TAG.FLOAT64_ARRAY) {
    const output = new Array(reader.varuint());
    for (let index = 0; index < output.length; index += 1) {
      output[index] = reader.f64();
      if (!(index & 1023)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.DECIMAL_ARRAY) {
    const scale = 10 ** reader.u8();
    const output = await readPackedIntegersAsync(reader, checkpoint);
    for (let index = 0; index < output.length; index += 1) {
      output[index] /= scale;
      if (!(index & 1023)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.RAGGED_INTEGER) return readRaggedIntegersAsync(reader, checkpoint);
  if (tag === TAG.FIXED_FLOAT_TUPLES) {
    const rows = reader.varuint();
    const columns = reader.varuint();
    const output = new Array(rows);
    for (let row = 0; row < rows; row += 1) {
      output[row] = Array.from({length: columns}, () => reader.f64());
      if (!(row & 511)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.FIXED_DECIMAL_TUPLES) {
    const rows = reader.varuint();
    const columns = reader.varuint();
    const scale = 10 ** reader.u8();
    const flat = await readPackedIntegersAsync(reader, checkpoint);
    const output = new Array(rows);
    for (let row = 0; row < rows; row += 1) {
      output[row] = flat.slice(row * columns, (row + 1) * columns).map(value => value / scale);
      if (!(row & 511)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.OBJECT_TABLE) {
    const rows = reader.varuint();
    const keys = Array.from({length: reader.varuint()}, () => requireString(strings, reader.varuint()));
    const columns = [];
    for (let index = 0; index < keys.length; index += 1) columns.push(await readValueAsync(reader, strings, checkpoint));
    const output = new Array(rows);
    for (let row = 0; row < rows; row += 1) {
      output[row] = Object.fromEntries(keys.map((key, column) => [key, columns[column][row]]));
      if (!(row & 255)) await checkpoint();
    }
    return output;
  }
  if (tag === TAG.SPARSE_INTEGER) {
    const output = new Array(reader.varuint()).fill(reader.svarint());
    let index = -1;
    for (let count = reader.varuint(), entry = 0; entry < count; entry += 1) {
      index += reader.varuint() + 1;
      output[index] = reader.svarint();
      if (!(entry & 1023)) await checkpoint();
    }
    return output;
  }
  throw codecError("compact_binary_tag_invalid", `未知紧凑二进制 tag：${tag}`);
}

async function readTypedArrayAsync(reader, checkpoint) {
  const Constructor = TYPED_ARRAYS[reader.u8()];
  if (!Constructor) throw codecError("compact_binary_typed_array_unsupported", "TypedArray 类型无效");
  const length = reader.varuint();
  const byteLength = length * Constructor.BYTES_PER_ELEMENT;
  const bytes = reader.bytes(byteLength);
  const copy = new Uint8Array(byteLength);
  for (let offset = 0; offset < byteLength; offset += 256 * 1024) {
    copy.set(bytes.subarray(offset, Math.min(byteLength, offset + 256 * 1024)), offset);
    await checkpoint();
  }
  return new Constructor(copy.buffer);
}

async function readPackedIntegersAsync(reader, checkpoint) {
  const length = reader.varuint();
  const min = reader.svarint();
  const bits = reader.u8();
  if (!bits) return new Array(length).fill(min);
  return unpackIntegersAsync(reader.bytes(reader.varuint()), length, min, bits, checkpoint);
}

async function readRaggedIntegersAsync(reader, checkpoint) {
  const lengths = new Array(reader.varuint());
  for (let index = 0; index < lengths.length; index += 1) {
    lengths[index] = reader.varuint();
    if (!(index & 1023)) await checkpoint();
  }
  const mode = reader.u8();
  let flat;
  if (mode === 1) {
    const first = await readPackedIntegersAsync(reader, checkpoint);
    const deltas = await readPackedIntegersAsync(reader, checkpoint);
    flat = [];
    let firstIndex = 0;
    let deltaIndex = 0;
    for (let row = 0; row < lengths.length; row += 1) {
      const length = lengths[row];
      if (length) {
        let value = first[firstIndex++];
        flat.push(value);
        for (let index = 1; index < length; index += 1) {
          value += deltas[deltaIndex++];
          flat.push(value);
        }
      }
      if (!(row & 511)) await checkpoint();
    }
  } else if (mode === 0) flat = await readPackedIntegersAsync(reader, checkpoint);
  else throw codecError("compact_binary_ragged_mode_invalid", "紧凑二进制 CSR 模式无效");
  const output = new Array(lengths.length);
  let offset = 0;
  for (let row = 0; row < lengths.length; row += 1) {
    output[row] = flat.slice(offset, offset + lengths[row]);
    offset += lengths[row];
    if (!(row & 511)) await checkpoint();
  }
  return output;
}

function readPackedIntegers(reader) {
  const length = reader.varuint();
  const min = reader.svarint();
  const bits = reader.u8();
  if (!bits) return new Array(length).fill(min);
  return unpackIntegers(reader.bytes(reader.varuint()), length, min, bits);
}

function integerProfile(values) {
  let min = 0;
  let max = 0;
  if (values.length) {
    min = values[0];
    max = values[0];
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] < min) min = values[index];
      if (values[index] > max) max = values[index];
    }
  }
  const range = max - min;
  const bits = range ? Math.ceil(Math.log2(range + 1)) : 0;
  return {min, max, bits, estimatedBytes: Math.ceil(values.length * bits / 8) + 12};
}

function sparseIntegerProfile(values, profile) {
  if (values.length < 64) return null;
  let defaultValue = 0;
  let defaultCount = 0;
  const range = profile.max - profile.min;
  if (range <= 4096) {
    const counts = new Uint32Array(range + 1);
    for (const value of values) counts[value - profile.min] += 1;
    for (const count of counts) if (count > defaultCount) defaultCount = count;
    for (const value of values) {
      if (counts[value - profile.min] !== defaultCount) continue;
      defaultValue = value;
      break;
    }
  } else {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    for (const [value, count] of counts) {
      if (count > defaultCount) {
        defaultValue = value;
        defaultCount = count;
      }
    }
  }
  if (defaultCount / values.length < 0.55) return null;
  const entries = [];
  for (let index = 0; index < values.length; index += 1) if (values[index] !== defaultValue) entries.push({index, value: values[index]});
  return {defaultValue, entries, estimatedBytes: entries.length * 5 + Math.ceil(entries.length / 4) + 16};
}

function decimalProfile(values) {
  for (let exponent = 1; exponent <= 6; exponent += 1) {
    const scale = 10 ** exponent;
    const integers = new Array(values.length);
    let valid = true;
    for (let index = 0; index < values.length; index += 1) {
      const integer = Math.round(values[index] * scale);
      if (!Number.isSafeInteger(integer) || integer / scale !== values[index]) {
        valid = false;
        break;
      }
      integers[index] = integer;
    }
    if (valid) return {exponent, values: integers};
  }
  return null;
}

function packIntegers(values, min, bits) {
  const output = new Uint8Array(Math.ceil(values.length * bits / 8));
  if (bits <= 25) {
    let accumulator = 0;
    let available = 0;
    let offset = 0;
    for (const value of values) {
      accumulator |= (value - min) << available;
      available += bits;
      while (available >= 8) {
        output[offset++] = accumulator & 255;
        accumulator >>>= 8;
        available -= 8;
      }
    }
    if (available) output[offset] = accumulator & 255;
    return output;
  }
  if (bits <= 46) {
    let accumulator = 0;
    let available = 0;
    let offset = 0;
    for (const value of values) {
      accumulator += (value - min) * (2 ** available);
      available += bits;
      while (available >= 8) {
        output[offset++] = accumulator % 256;
        accumulator = Math.floor(accumulator / 256);
        available -= 8;
      }
    }
    if (available) output[offset] = accumulator;
    return output;
  }
  let accumulator = 0n;
  let available = 0;
  let offset = 0;
  for (const value of values) {
    accumulator |= BigInt(value - min) << BigInt(available);
    available += bits;
    while (available >= 8) {
      output[offset++] = Number(accumulator & 255n);
      accumulator >>= 8n;
      available -= 8;
    }
  }
  if (available) output[offset] = Number(accumulator & 255n);
  return output;
}

function unpackIntegers(bytes, length, min, bits) {
  const output = new Array(length);
  if (bits <= 46) {
    const divisor = 2 ** bits;
    let accumulator = 0;
    let available = 0;
    let offset = 0;
    for (let index = 0; index < length; index += 1) {
      while (available < bits) {
        accumulator += bytes[offset++] * (2 ** available);
        available += 8;
      }
      output[index] = min + (accumulator % divisor);
      accumulator = Math.floor(accumulator / divisor);
      available -= bits;
    }
    return output;
  }
  const mask = (1n << BigInt(bits)) - 1n;
  let accumulator = 0n;
  let available = 0;
  let offset = 0;
  for (let index = 0; index < length; index += 1) {
    while (available < bits) {
      accumulator |= BigInt(bytes[offset++]) << BigInt(available);
      available += 8;
    }
    output[index] = min + Number(accumulator & mask);
    accumulator >>= BigInt(bits);
    available -= bits;
  }
  return output;
}

async function unpackIntegersAsync(bytes, length, min, bits, checkpoint) {
  const output = new Array(length);
  if (bits <= 46) {
    const divisor = 2 ** bits;
    let accumulator = 0;
    let available = 0;
    let offset = 0;
    for (let index = 0; index < length; index += 1) {
      while (available < bits) {
        accumulator += bytes[offset++] * (2 ** available);
        available += 8;
      }
      output[index] = min + (accumulator % divisor);
      accumulator = Math.floor(accumulator / divisor);
      available -= bits;
      if (!(index & 1023)) await checkpoint();
    }
    return output;
  }
  const mask = (1n << BigInt(bits)) - 1n;
  let accumulator = 0n;
  let available = 0;
  let offset = 0;
  for (let index = 0; index < length; index += 1) {
    while (available < bits) {
      accumulator |= BigInt(bytes[offset++]) << BigInt(available);
      available += 8;
    }
    output[index] = min + Number(accumulator & mask);
    accumulator >>= BigInt(bits);
    available -= bits;
    if (!(index & 1023)) await checkpoint();
  }
  return output;
}

function createDecodeCheckpoint(options) {
  const budgetMs = Math.max(1, Number(options.budgetMs) || 6);
  const yieldToMain = typeof options.yieldToMain === "function" ? options.yieldToMain : defaultDecodeYield;
  let deadline = codecNow() + budgetMs;
  return async (force = false) => {
    if (!force && codecNow() < deadline) return;
    await yieldToMain();
    deadline = codecNow() + budgetMs;
  };
}

function defaultDecodeYield() {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

function codecNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function collectStrings(root) {
  const counts = new Map();
  const stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (typeof value === "string") {
      counts.set(value, (counts.get(value) || 0) + 1);
      continue;
    }
    if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) continue;
    if (Array.isArray(value)) {
      assertDenseArray(value);
      for (let index = value.length - 1; index >= 0; index -= 1) stack.push(value[index]);
      continue;
    }
    if (!isPlainObject(value)) throw codecError("compact_binary_value_unsupported", `紧凑二进制不支持 ${Object.prototype.toString.call(value)}`);
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      stack.push(child);
    }
  }
  return [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([text]) => text);
}

function objectTableKeys(value) {
  if (value.length < 4 || !value.every(isPlainObject)) return null;
  const keys = serializableObjectKeys(value[0]);
  if (!keys.length || keys.length > 96) return null;
  return value.every(row => {
    const rowKeys = serializableObjectKeys(row);
    return rowKeys.length === keys.length && rowKeys.every((key, index) => key === keys[index]);
  }) ? keys : null;
}

function serializableObjectKeys(value) {
  return Object.keys(value).filter(key => value[key] !== undefined).sort();
}

function fixedNumericTupleLength(value) {
  const length = Array.isArray(value[0]) ? value[0].length : 0;
  return length > 0 && length <= 8 && value.every(row => Array.isArray(row) && row.length === length && row.every(item => typeof item === "number")) ? length : 0;
}

function isIntegerArray(value) {
  return Array.isArray(value) && value.every(item => Number.isSafeInteger(item) && !Object.is(item, -0));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDenseArray(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw codecError("compact_binary_holey_array", "紧凑二进制拒绝 holey array");
  }
}

function requireString(strings, index) {
  if (!Number.isInteger(index) || index < 0 || index >= strings.length) throw codecError("compact_binary_string_invalid", "紧凑二进制字符串索引无效");
  return strings[index];
}

class BinaryWriter {
  constructor() {
    this.buffer = new Uint8Array(1024);
    this.length = 0;
    this.encoder = new TextEncoder();
  }
  ensure(extra) {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer);
    this.buffer = next;
  }
  u8(value) { this.ensure(1); this.buffer[this.length++] = Number(value) & 255; }
  bytes(value) { this.ensure(value.length); this.buffer.set(value, this.length); this.length += value.length; }
  f64(value) { this.ensure(8); new DataView(this.buffer.buffer).setFloat64(this.length, value, true); this.length += 8; }
  varuint(value) {
    let remaining = Number(value);
    if (!Number.isSafeInteger(remaining) || remaining < 0) throw codecError("compact_binary_integer_invalid", "varuint 必须是非负安全整数");
    while (remaining >= 128) {
      this.u8((remaining % 128) | 128);
      remaining = Math.floor(remaining / 128);
    }
    this.u8(remaining);
  }
  svarint(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw codecError("compact_binary_integer_invalid", "svarint 必须是安全整数");
    if (Math.abs(number) <= Number.MAX_SAFE_INTEGER / 2) {
      this.varuint(number < 0 ? (-number * 2) - 1 : number * 2);
      return;
    }
    const big = BigInt(number);
    let remaining = big < 0n ? (-big * 2n) - 1n : big * 2n;
    while (remaining >= 128n) { this.u8(Number(remaining & 127n) | 128); remaining >>= 7n; }
    this.u8(Number(remaining));
  }
  text(value) { const bytes = this.encoder.encode(value); this.varuint(bytes.length); this.bytes(bytes); }
  finish() { return this.buffer.slice(0, this.length); }
}

class BinaryReader {
  constructor(value) {
    this.value = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.offset = 0;
    this.decoder = new TextDecoder();
  }
  require(length) { if (this.offset + length > this.value.length) throw codecError("compact_binary_truncated", "紧凑二进制分区被截断"); }
  u8() { this.require(1); return this.value[this.offset++]; }
  bytes(length) { this.require(length); const output = this.value.subarray(this.offset, this.offset + length); this.offset += length; return output; }
  f64() { this.require(8); const output = new DataView(this.value.buffer, this.value.byteOffset, this.value.byteLength).getFloat64(this.offset, true); this.offset += 8; return output; }
  varuint() {
    let output = 0n;
    let shift = 0n;
    for (let count = 0; count < 10; count += 1) {
      const byte = this.u8();
      output |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) {
        const number = Number(output);
        if (!Number.isSafeInteger(number)) throw codecError("compact_binary_integer_invalid", "紧凑二进制整数超出安全范围");
        return number;
      }
      shift += 7n;
    }
    throw codecError("compact_binary_integer_invalid", "紧凑二进制 varuint 过长");
  }
  svarint() { const value = BigInt(this.varuint()); return Number(value & 1n ? -((value + 1n) >> 1n) : value >> 1n); }
  text() { return this.decoder.decode(this.bytes(this.varuint())); }
  done() { return this.offset === this.value.length; }
}

function codecError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
