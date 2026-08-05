/**
 * Shrinking an invoice photo before it is uploaded.
 *
 * A modern phone takes a twelve-megapixel picture, and none of that resolution
 * survives the journey: the model tiles the image down before reading it, so
 * beyond a point the extra pixels buy nothing and cost time. The wins here are
 * not really about money - image tokens are small next to what a long invoice
 * costs in output - they are:
 *
 *   the 5MB limit   The upload cap is enforced server-side, and a detailed photo
 *                   of a dense invoice sits close to it. Being rejected at that
 *                   point is the worst possible moment: the supplier is already
 *                   chosen and the photo already taken.
 *
 *   the upload      A shop's phone is on mobile data in a stockroom. Four
 *                   megabytes and four hundred kilobytes are a very different
 *                   wait, and the wait happens before anything else can start.
 *
 * The ceiling is deliberately generous. Small print is the entire content of the
 * document, and an over-eager resize would turn a legible "1.234,56" into
 * something the model has to guess at - trading a few seconds of upload for
 * exactly the failure the whole pipeline is built to avoid.
 */

/** Long edge, in pixels. Well above what the model resolves, on purpose. */
const MAX_EDGE = 2400;

/** Below this, resizing is not worth the re-encode. */
const SKIP_BELOW_BYTES = 1_024 * 1_024;

const JPEG_QUALITY = 0.85;

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };

    image.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

/**
 * The photo at a sensible size, or the original when there is nothing to gain.
 *
 * Never throws: every failure path returns the file untouched. A resize is an
 * optimisation, and an optimisation that can stop somebody uploading an invoice
 * is worse than no optimisation - so a browser without canvas support, an image
 * decoder that chokes, or an encode that comes back larger all simply fall
 * through to sending what the user picked.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= SKIP_BELOW_BYTES) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const longest = Math.max(image.width, image.height);

    if (!longest || longest <= MAX_EDGE) return file;

    const scale = MAX_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;

    // Chosen explicitly rather than left to the default: text is exactly the
    // content that suffers from a cheap downscale.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await toBlob(canvas);
    // A re-encode that came back bigger has achieved nothing but a second copy.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('Could not downscale the photo, sending it as it is:', error);
    return file;
  }
}
