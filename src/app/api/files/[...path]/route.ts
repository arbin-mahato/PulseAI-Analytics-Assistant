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
    const a = await artifact(parts[0]);
    if (!a || (!a.public && a.owner !== ownerOf(req)))
      throw new HttpError(404, "File not found.");
    const file = ensureInside(dataRoot(), a.local_path);
    if (!fs.existsSync(file))
      throw new HttpError(404, "The stored file is no longer available.");
    const download =
      new URL(req.url).searchParams.has("download") ||
      !["image/png", "image/jpeg"].includes(a.mime);
    const filename = a.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const headers: Record<string, string> = {
      "Content-Type": a.mime,
      "Content-Length": String(fs.statSync(file).size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": download
        ? "default-src 'none'"
        : "default-src 'none'; sandbox allow-scripts allow-same-origin allow-downloads",
    };
    return new Response(
      Readable.toWeb(fs.createReadStream(file)) as ReadableStream,
      { headers },
    );
  } catch (e) {
    return httpError(e);
  }
}
