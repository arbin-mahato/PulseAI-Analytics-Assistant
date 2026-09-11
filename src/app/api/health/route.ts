import fs from "node:fs";
import { warehousePath } from "@/lib/runtime/config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const ready = fs.existsSync(warehousePath());
  return Response.json(
    { status: ready ? "ok" : "dataset_missing" },
    { status: ready ? 200 : 503 },
  );
}
