import { describe, it, expect, mock } from "bun:test"
import { BunRequest } from "bun";
import { routes } from "./routes";

describe('/downloads', () => {
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
