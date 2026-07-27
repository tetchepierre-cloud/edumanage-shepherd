// src2/lib/imageUtils.js

/**
 * Convertit une signature scannée (fond blanc) en PNG transparent.
 * @param {string} base64Signature - Base64 ou data URL
 * @param {number} [threshold=215] - Seuil de luminosité pour le fond
 * @param {number} [feather=25] - Zone de transition douce
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export function getOpaqueSignaturePNG(base64Signature, threshold = 215, feather = 25) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (luminance >= threshold) {
            data[i + 3] = 0; // transparent
          } else if (luminance >= threshold - feather) {
            const alpha = 1 - (luminance - (threshold - feather)) / feather;
            data[i + 3] = Math.round(alpha * 255);
          }
          // sinon : opaque
        }

        ctx.putImageData(imageData, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Signature illisible.'));
    img.src = base64Signature.startsWith('data:')
      ? base64Signature
      : `data:image/png;base64,${base64Signature}`;
  });
}

/**
 * Calcule les dimensions pour que la signature tienne dans une boîte max
 * sans déformer ni agrandir l’image.
 */
export function fitWithinBox(naturalWidth, naturalHeight, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return { width: naturalWidth * ratio, height: naturalHeight * ratio };
}