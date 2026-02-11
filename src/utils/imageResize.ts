export async function resizeImageBlob(
  blob: Blob,
  maxWidth: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Don't resize if already small enough
      if (img.width <= maxWidth) {
        resolve(blob);
        return;
      }

      const scale = maxWidth / img.width;
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            resolve(blob);
          }
        },
        "image/jpeg",
        0.85,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for resize"));
    };

    img.src = url;
  });
}
