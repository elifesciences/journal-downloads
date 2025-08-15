import { describe, it, expect } from "bun:test"
import { routes } from "./routes";
import { createUrlHash, verifyUrl } from "./signer";

describe('signer', () => {
  it("should create a hash and verify it", async () => {
    const secret = 'JustATest';
    const url = 'https://elifesciences.org/test.jpg';

    const hash = createUrlHash(secret, url);

    expect(verifyUrl(secret, url, hash)).toBeTrue()
  });

  it("should fail verify after a change of host", async () => {
    const secret = 'JustATest';
    const url = 'https://elifesciences.org/test.jpg';

    const hash = createUrlHash(secret, url);

    const newUrl = 'https://elifesciences.net/test.jpg';

    expect(verifyUrl(secret, newUrl, hash)).toBeFalse()
  });

  it("should fail verify after a alteration of the hash", async () => {
    const secret = 'JustATest';
    const url = 'https://elifesciences.org/test.jpg';

    const hash = createUrlHash(secret, url);

    expect(verifyUrl(secret, url, hash + '1')).toBeFalse()
  });
});
