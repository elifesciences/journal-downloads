import { describe, it, expect, mock, afterEach } from "bun:test"
import { clearMocks, mock as fetchMock } from "bun-bagel";
import type { BunRequest, S3Client } from "bun";
import { createRoutes } from "./routes";
import { createUrlHash } from "./signer";

const fileExistsMock = mock(() => true)

// Create a mock S3 client that simulates the behavior we need for testing.
const mockS3: S3Client = {
  // @ts-expect-error we only need to mock the methods we use
  file: (_pathname: string) => ({
    exists: fileExistsMock,
    stream: () => new Blob(["file content"]).stream(),
    stat: async () => ({ "etag": "ABC1234567890", "lastModified": new Date('2025-09-05T07:15:00'), "size": "12", "type": "text/plain"}),
  }),
};

const signerKey = "totally-not-secret-for-tests";
const cdnHost = "cdn.somewhere.tld";
const routesWithSigner = createRoutes(async () => mockS3, signerKey, cdnHost, []);

describe('routes', async () => {
  afterEach(() => {
      clearMocks();
  });
  it("should succeed when an valid hash is passed", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${validID}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
    expect(res.headers.get('etag')).toBe("ABC1234567890");
    expect(res.headers.get('last-modified')).toBe("Fri, 05 Sep 2025 07:15:00 GMT");
    expect(res.headers.get('content-length')).toBe("12");
    expect(res.headers.get('content-type')).toBe("text/plain");
  });

  it("should reject nonsense ID", async () => {
    const wrongId = btoa('not a file');
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${wrongId}/${filename}`;

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

  it("should accept x-forwarded-host override", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const hashedUrl = `https://elifesciences.org/download/${validID}/${filename}`;
    const requestUrl = `https://test.elifesciences.org/download/${validID}/${filename}`;

    const hash = createUrlHash(signerKey, hashedUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`, {
      headers: {
        'x-forwarded-host': 'elifesciences.org',
      }
    }) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };

    const routesWithSigner = createRoutes(async () => mockS3, signerKey, cdnHost, ['elifesciences.org']);
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
  });

  it("should accept only the last x-forwarded-host override", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const hashedUrl = `https://elifesciences.org/download/${validID}/${filename}`;
    const requestUrl = `https://test.elifesciences.org/download/${validID}/${filename}`;

    const hash = createUrlHash(signerKey, hashedUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`, {
      headers: {
        'x-forwarded-host': 'elifesciences.org, realhost.from.proxy',
      }
    }) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };

    const routesWithSigner = createRoutes(async () => mockS3, signerKey, cdnHost, ['elifesciences.org']);
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable: invalid signature");
  });

  it("should return 404 file when a file does not exist in s3", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";
    fileExistsMock.mockReturnValue(false);

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${validId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: validId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
    expect(res.headers.get('Content-Disposition')).toBeEmpty();

    //reset mock
    fileExistsMock.mockReturnValue(true);
  });

  it("should return a file when it exists in s3", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${validId}/${filename}`;

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
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validId = btoa(fileUrl);
    const filename = "test.jpg";

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${validId}/${filename}`;

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
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    const req = new Request(`https://example.com/download/${validID}/${filename}?_hash=blahblahblah`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable: invalid signature");
  });

  it("should do a string replacement on 'unsafe' URLs", async () => {
    const fileUrl = `https://cdn.somewhere.tld/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validId = btoa(fileUrl);
    const stringReplacedValidId = validId.replace('+', '.').replace('/', '_').replace('=', '-');
    const filename = "test.jpg";

    const req = new Request(`https://example.com/download/${stringReplacedValidId}/${filename}?_hash=blahblahblah`) as BunRequest;
    req.params = {
      id: stringReplacedValidId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);

    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable: invalid signature");
  });

  it("should proxy content from non-elife CDN urls", async () => {
    const wrongId = btoa("https://not-cdn.somewhere.tld/test.txt");
    const filename = "test.txt";

    // mock a successful response
    fetchMock("https://not-cdn.somewhere.tld/test.txt", {
      data: new Blob(["test content"]),
      response: {
        headers: new Headers({
          "Content-Type": "text/plain",
          "Content-Length": "12",
          "ETag": "ABC1234567890",
          "Last-Modified": "Fri, 05 Sep 2025 07:15:00 GMT"
        }),
      },
    });

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${wrongId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: wrongId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("test content");
    expect(res.headers.get('etag')).toBe("ABC1234567890");
    expect(res.headers.get('last-modified')).toBe("Fri, 05 Sep 2025 07:15:00 GMT");
    expect(res.headers.get('content-length')).toBe("12");
    expect(res.headers.get('content-type')).toBe("text/plain");
  });

  it("should proxy 404 from non-elife CDN urls", async () => {
    const wrongId = btoa("https://not-cdn.somewhere.tld/test.txt");
    const filename = "test.txt";

    // mock a successful response
    fetchMock("https://not-cdn.somewhere.tld/test.txt", {
      response: {
        data: new Blob(["404: Not Found"]),
        status: 404,
        headers: new Headers({
          "Content-Type": "text/plain",
          "Content-Length": "12",
          "ETag": "ABC1234567890",
          "Last-Modified": "Fri, 05 Sep 2025 07:15:00 GMT"
        }),
      },
    });

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${wrongId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: wrongId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found"); // returned from proxy code, not upstream
    expect(res.headers.get('Content-Disposition')).toBeEmpty();
  });

  it("should return a 500 error from any non-successful non-elife CDN urls", async () => {
    const wrongId = btoa("https://not-cdn.somewhere.tld/test.txt");
    const filename = "test.txt";

    // mock a successful response
    fetchMock("https://not-cdn.somewhere.tld/test.txt", {
      response: {
        data: new Blob(["418: I'm a teapot"]),
        status: 418,
      },
    });

    //this URL needs to be a valid elifesciences host to be signed correctly
    const requestUrl = `https://elifesciences.org/download/${wrongId}/${filename}`;

    const hash = createUrlHash(signerKey, requestUrl);

    const req = new Request(`${requestUrl}?_hash=${encodeURIComponent(hash)}`) as BunRequest;
    req.params = {
      id: wrongId,
      filename,
    };
    const res = await routesWithSigner["/download/:id/:filename"](req);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Error fetching upstream content: 418");
  });
});
