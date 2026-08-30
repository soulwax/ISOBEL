// File: src/utils/byte-counter.ts

import { Transform, type TransformCallback } from 'node:stream';

/**
 * Pass-through stream that records how many bytes have flowed through it.
 *
 * Used to measure how far ahead of the audio player ffmpeg has managed to
 * encode: bytes produced, divided by the encoder's byte rate, minus the
 * resource's playback position, is the size of the cushion in seconds.
 */
export default class ByteCounter extends Transform {
  public bytes = 0;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    this.push(chunk);
    callback();
  }
}
