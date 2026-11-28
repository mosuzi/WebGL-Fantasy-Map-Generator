const FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
const CHUNK_FLOATS = 65536;

// 未变岸段在显存内部复用。新缓冲在全部准备完毕前不参与绘制。
export async function stageShoreBufferPatch(gl, entries, checkpoint) {
  const replacements = new Map();
  let uploadedBytes = 0;
  let retainedBytes = 0;
  try {
    for (const {key, source, sourceLength, vertices, moves} of entries) {
      if (!vertices.length || moves.length === 1 && moves[0].fromPrevious
        && moves[0].source === 0 && moves[0].length === sourceLength && sourceLength === vertices.length) continue;
      await checkpoint();
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("海岸差分缓冲分配失败");
      replacements.set(key, buffer);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer);
      gl.bufferData(gl.COPY_WRITE_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
      for (const move of moves) {
        for (let offset = 0; offset < move.length; offset += CHUNK_FLOATS) {
          await checkpoint();
          const length = Math.min(CHUNK_FLOATS, move.length - offset);
          const destination = move.target + offset;
          gl.bindBuffer(gl.COPY_WRITE_BUFFER, buffer);
          if (move.fromPrevious) {
            gl.bindBuffer(gl.COPY_READ_BUFFER, source);
            gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER,
              (move.source + offset) * FLOAT_BYTES, destination * FLOAT_BYTES, length * FLOAT_BYTES);
            retainedBytes += length * FLOAT_BYTES;
          } else {
            gl.bufferSubData(gl.COPY_WRITE_BUFFER, destination * FLOAT_BYTES, vertices, destination, length);
            uploadedBytes += length * FLOAT_BYTES;
          }
        }
      }
    }
    await checkpoint();
  } catch (error) {
    for (const buffer of replacements.values()) gl.deleteBuffer(buffer);
    throw error;
  }

  return {
    uploadedBytes,
    retainedBytes,
    install(renderer) {
      for (const [key, buffer] of replacements) {
        gl.deleteBuffer(renderer[key]);
        renderer[key] = buffer;
      }
      replacements.clear();
    },
    discard() {
      for (const buffer of replacements.values()) gl.deleteBuffer(buffer);
      replacements.clear();
    }
  };
}
