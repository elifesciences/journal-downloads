import { describe, it, expect, mock } from "bun:test"
import { BunRequest, S3Client } from "bun";
import { createRoutes } from "./routes";

// Create a mock S3 client that simulates the behavior we need for testing.
const mockS3: S3Client = {
  // @ts-expect-error we only need to mock the methods we use
  file: (pathname: string) => ({
    exists: async () => true,
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
});
