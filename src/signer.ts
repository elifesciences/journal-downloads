import { createHmac } from "node:crypto";

export const verifyUrl = (secret: string, url: string, hash: string): boolean => {
  const newHash = createHmac("sha256", secret)
                .update(url)
                .digest("base64");

  return newHash === hash;
}

export const createUrlHash = (secret: string, url: string): string => {
  return createHmac("sha256", secret)
                .update(url)
                .digest("base64");
}
