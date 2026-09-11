import fs from "node:fs";
import { Readable } from "node:stream";
import { artifact } from "@/lib/runtime/store";
import {
  ownerOf,
  productionCheck,
  httpError,
  HttpError,
} from "@/lib/runtime/auth";
import { ensureInside, dataRoot } from "@/lib/runtime/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    productionCheck();
    const { path: parts } = await params;
    if (parts.length !== 1) throw new HttpError(404, "File not found.");
    const a = artifact(parts[0]);
    if (!a || (!a.public && a.owner !== ownerOf(req)))
      throw new HttpError(404, "File not found.");
    const file = ensureInside(dataRoot(), a.local_path);
    if (!fs.existsSync(file))
      throw new HttpError(404, "The stored file is no longer available.");
    const download =
      new URL(req.url).searchParams.has("download") ||
      !["image/png", "image/jpeg", "application/pdf"].includes(a.mime);
    return new Response(
      Readable.toWeb(fs.createReadStream(file)) as ReadableStream,
      {
        headers: {
          "Content-Type": a.mime,
          "Content-Length": String(fs.statSync(file).size),
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${a.filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      },
    );
  } catch (e) {
    return httpError(e);
  }
}
