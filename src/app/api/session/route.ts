import {
  checkOrigin,
  cookieFor,
  expiredCookie,
  guestOwner,
  httpError,
  isLocked,
  jsonBody,
  loginOwner,
  ownerOf,
  productionCheck,
  rateLimit,
} from "@/lib/runtime/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    productionCheck();
    const existing = ownerOf(req);
    if (!existing && isLocked())
      return Response.json(
        { authenticated: false, passwordRequired: true },
        { status: 401 },
      );
    const owner = existing || guestOwner();
    return Response.json(
      { authenticated: true, passwordRequired: isLocked() },
      {
        headers: {
          "set-cookie": cookieFor(owner, req),
          "cache-control": "no-store",
        },
      },
    );
  } catch (e) {
    return httpError(e);
  }
}
export async function POST(req: Request) {
  try {
    productionCheck();
    checkOrigin(req);
    await rateLimit("login", 10);
    const { password } = await jsonBody(req, 2000);
    const owner = isLocked()
      ? loginOwner(password)
      : ownerOf(req) || guestOwner();
    return Response.json(
      { authenticated: true },
      { headers: { "set-cookie": cookieFor(owner, req) } },
    );
  } catch (e) {
    return httpError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    return Response.json(
      { authenticated: false },
      { headers: { "set-cookie": expiredCookie() } },
    );
  } catch (e) {
    return httpError(e);
  }
}
