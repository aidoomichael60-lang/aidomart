export interface PreparedUploadFile {
  name: string;
  type: string;
  dataUrl: string;
  byteSize: number;
}

const MAX_NETLIFY_BATCH_BYTES = 2_800_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`Could not read ${file.name}.`));
      }
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function estimateBase64Bytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.ceil((b64.length * 3) / 4);
}

function optimizeImageToDataUrl(file: File, maxDimension = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (!width || !height) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Invalid image dimensions for ${file.name}.`));
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not initialize image processor.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const targetMime = file.type === 'image/png' && file.size <= 350_000 ? 'image/png' : 'image/jpeg';
        let dataUrl = canvas.toDataURL(targetMime, quality);
        if (estimateBase64Bytes(dataUrl) > 1_800_000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        }
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not decode image "${file.name}". Please use a valid JPG, PNG, or WebP image.`));
    };
    img.src = objectUrl;
  });
}

export async function prepareImageFiles(
  fileList: FileList | File[]
): Promise<PreparedUploadFile[]> {
  const files = Array.from(fileList);
  const prepared: PreparedUploadFile[] = [];

  for (const file of files) {
    const lowerType = (file.type || '').toLowerCase();
    const isGif = lowerType === 'image/gif' && file.size <= 2_500_000;
    let dataUrl: string;
    let finalType = lowerType || 'image/jpeg';

    if (isGif) {
      dataUrl = await readFileAsDataUrl(file);
    } else if (lowerType.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)) {
      try {
        dataUrl = await optimizeImageToDataUrl(file);
        const match = /^data:([^;]+);base64,/.exec(dataUrl);
        if (match) finalType = match[1];
      } catch {
        if (file.size > 3_800_000) {
          throw new Error(
            `"${file.name}" could not be resized and exceeds 3.8 MB. Please upload a JPG, PNG, or WebP image.`
          );
        }
        dataUrl = await readFileAsDataUrl(file);
      }
    } else {
      throw new Error(`"${file.name}" is not a supported image. Please select JPG, PNG, WebP, or GIF.`);
    }

    const byteSize = estimateBase64Bytes(dataUrl);
    if (byteSize > 3_800_000) {
      throw new Error(`"${file.name}" is still too large after optimization. Please select a smaller image.`);
    }

    prepared.push({
      name: file.name,
      type: finalType,
      dataUrl,
      byteSize,
    });
  }

  return prepared;
}

export async function prepareDocumentFiles(
  fileList: FileList | File[]
): Promise<PreparedUploadFile[]> {
  const files = Array.from(fileList);
  const prepared: PreparedUploadFile[] = [];

  for (const file of files) {
    const lowerType = (file.type || '').toLowerCase();
    const isPdf = lowerType === 'application/pdf' || /\.pdf$/i.test(file.name);

    if (isPdf) {
      if (file.size > 3_800_000) {
        throw new Error(`PDF "${file.name}" exceeds 3.8 MB. Please upload a compressed PDF.`);
      }
      const dataUrl = await readFileAsDataUrl(file);
      prepared.push({
        name: file.name,
        type: 'application/pdf',
        dataUrl,
        byteSize: estimateBase64Bytes(dataUrl),
      });
    } else {
      const [img] = await prepareImageFiles([file]);
      prepared.push(img);
    }
  }

  return prepared;
}

export function chunkUploadBatches(files: PreparedUploadFile[]): PreparedUploadFile[][] {
  const batches: PreparedUploadFile[][] = [];
  let current: PreparedUploadFile[] = [];
  let currentBytes = 0;

  for (const f of files) {
    if (current.length > 0 && currentBytes + f.byteSize > MAX_NETLIFY_BATCH_BYTES) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(f);
    currentBytes += f.byteSize;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}
