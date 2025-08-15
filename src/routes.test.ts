import { describe, it, expect, mock } from "bun:test"
import { BunRequest, S3Client } from "bun";
import { createRoutes } from "./routes";

const fileExistsMock = mock(() => true)

// Create a mock S3 client that simulates the behavior we need for testing.
const mockS3: S3Client = {
  // @ts-expect-error we only need to mock the methods we use
  file: (pathname: string) => ({
    exists: fileExistsMock,
    stream: () => new Blob(["file content"]).stream(),
  }),
};

const routes = createRoutes(mockS3);

describe('routes', async () => {
  it("should reject nonsense ID", async () => {
    const wrongID = btoa("1234567890");
    const req = new Request(`https://example.com/downloads/${wrongID}/test.jpg`) as BunRequest;
    req.params = {
      id: wrongID,
    };
    const res = await routes["/download/:id/:filename"](req);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });

  it("should reject non-elife CDN urls", async () => {
    const wrongID = btoa("https://not-cdn.elifesciences.org/test.jpg");
    const req = new Request(`https://example.com/downloads/${wrongID}/test.jpg`) as BunRequest;
    req.params = {
      id: wrongID,
    };
    const res = await routes["/download/:id/:filename"](req);
    expect(res.status).toBe(406);
    expect(await res.text()).toBe("Not Acceptable");
  });

  it("should return 404 file when a file does not exist in s3", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";
    fileExistsMock.mockReturnValue(false);

    const req = new Request(`https://example.com/downloads/${validID}/${filename}`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routes["/download/:id/:filename"](req);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");

    //reset mock
    fileExistsMock.mockReturnValue(true);
  });

  it("should return a file when it exists in s3", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    const req = new Request(`https://example.com/downloads/${validID}/${filename}`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routes["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${filename}"`);
  });

  it("should return canonical header when given extra param", async () => {
    const fileUrl = `https://cdn.elifesciences.org/test.jpg?canonicalUri=http://elifesciences.com/article/0`;
    const validID = btoa(fileUrl);
    const filename = "test.jpg";

    const req = new Request(`https://example.com/downloads/${validID}/${filename}`) as BunRequest;
    req.params = {
      id: validID,
      filename,
    };
    const res = await routes["/download/:id/:filename"](req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("file content");
    expect(res.headers.get("Link")).toBe(`<http://elifesciences.com/article/0>; rel="canonical"`);
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${filename}"`);
  });
});
