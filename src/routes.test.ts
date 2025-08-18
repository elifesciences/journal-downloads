import { describe, it, expect, mock } from "bun:test"
import { BunRequest, S3Client } from "bun";
import { createRoutes } from "./routes";
import { createUrlHash } from "./signer";

const fileExistsMock = mock(() => true)

// Create a mock S3 client that simulates the behavior we need for testing.
const mockS3: S3Client = {
  // @ts-expect-error we only need to mock the methods we use
  file: (pathname: string) => ({
    exists: fileExistsMock,
    stream: () => new Blob(["file content"]).stream(),
  }),
};

const signerKey = "totally-not-secret-for-tests";
const routesWithSigner = createRoutes(new Promise((resolver) => resolver(mockS3)), signerKey);

describe('routes', async () => {
  it("should succeed when an valid hash is passed", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${validID}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
  });

  it("should reject nonsense ID", async () => {
    const wrongId = btoa('not a file');
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${wrongId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: wrongId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });

  it("should reject non-elife CDN urls", async () => {
    const wrongId = btoa("https://not-cdn.elifesciences.org/test.jpg");
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${wrongId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: wrongId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);
    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable");
  });

  it("should return 404 file when a file does not exist in s3", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";
    fileExistsMock.mockReturnValue(false);

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${validId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");

    //reset mock
    fileExistsMock.mockReturnValue(true);
  });

  it("should return a file when it exists in s3", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${validId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${filename}"`);
  });

  it("should return canonical header when given extra param", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/downloads/${validId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
    expect(res.headers.get("Link")).toBe(`<http://elifesciences.com/article/0>; rel="canonical"`);
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${filename}"`);
  });

  it("should fail when an invalid hash is passed", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    const req = new Request(`https://example.com/downloads/${validID}/${filename}?_hash=blahblahblah`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable");
  });
});
