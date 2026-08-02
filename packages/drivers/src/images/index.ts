/**
 * `@forum/drivers/images` — the image codecs, behind their own entry point.
 *
 * Deliberately **not** re-exported from `@forum/drivers`. Everything on the
 * board imports that barrel; if the codecs were in it, every route that wanted
 * a `FileStore` would pull ~630 KB of WebAssembly into its module graph. The
 * separate subpath is what keeps ADR 0003's "a board that never accepts an
 * image never compiles a codec" true rather than aspirational.
 */
export {
  decodeImage,
  encodeImage,
  resizeToFit,
  type DecodedImage,
  type ImageFormat,
} from './codec'
export { locateAsset, compileAsset } from './locate-wasm'
export { imageProcessor } from './processor'
