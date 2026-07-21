import { createHash } from "node:crypto";
import { Request, Response } from "express";
import { cache } from "./cache.js";

type CachedJson = {
  etag: string;
  data: any;
};

type CachedJsonOptions = {
  status?: number;
  cacheControl?: string;
};

type UncachedJson = {
  __uncachedStatus: number;
  data: any;
};

function makeEtag(data: any): string {
  const hash = createHash("sha1").update(JSON.stringify(data)).digest("hex");
  return `"${hash}"`;
}

export async function sendCachedJson(
  req: Request,
  res: Response,
  key: string,
  ttlMs: number,
  loader: () => Promise<any>,
  options: CachedJsonOptions = {}
) {
  const cached = cache.get(key) as CachedJson | null;
  const cacheControl = options.cacheControl || "private, max-age=0, must-revalidate";

  if (cached) {
    res.set("Cache-Control", cacheControl);
    res.set("ETag", cached.etag);
    if (req.headers["if-none-match"] === cached.etag) {
      return res.status(304).end();
    }
    return res.status(options.status || 200).json(cached.data);
  }

  const data = await loader();
  if (
    data &&
    typeof data === "object" &&
    "__uncachedStatus" in data &&
    typeof (data as UncachedJson).__uncachedStatus === "number"
  ) {
    return res.status((data as UncachedJson).__uncachedStatus).json((data as UncachedJson).data);
  }
  const etag = makeEtag(data);
  cache.set(key, { etag, data }, ttlMs);
  res.set("Cache-Control", cacheControl);
  res.set("ETag", etag);
  return res.status(options.status || 200).json(data);
}

export function uncachedJson(status: number, data: any): UncachedJson {
  return { __uncachedStatus: status, data };
}

export function invalidateResponseCache(prefix: string) {
  cache.deletePattern(prefix);
}
