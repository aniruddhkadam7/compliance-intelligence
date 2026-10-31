import { HttpError } from "@/lib/auth/server";

// Vercel serverless functions accept request bodies up to 4.5 MB.
const DEFAULT_MAX_MB = 4;

export function maxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? DEFAULT_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB) * 1024 * 1024;
}

/** Validates name, size and content signature (xlsx = ZIP container). */
export async function readUploadedWorkbook(form: FormData, field = "file") {
  const file = form.get(field);
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded.");
  if (!/\.xlsx$/i.test(file.name)) throw new HttpError(415, "Only .xlsx workbooks are accepted.");
  if (file.size === 0) throw new HttpError(400, "The uploaded file is empty.");
  if (file.size > maxUploadBytes()) throw new HttpError(413, `File exceeds the ${Math.round(maxUploadBytes() / 1024 / 1024)} MB upload limit.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04)
    throw new HttpError(415, "File content is not a valid Excel (.xlsx) workbook.");
  return { name: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 200), buffer };
}
