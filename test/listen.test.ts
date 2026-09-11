import { describe, it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { listen } from "../src/cli/proxy.js";

describe("listen", () => {
  it("reports the port it got when the requested one is busy", async () => {
    const busy = http.createServer();
    await new Promise<void>((r) => busy.listen(0, "127.0.0.1", r));
    const taken = (busy.address() as AddressInfo).port;
    const server = http.createServer();
    try {
      const port = await listen(server, taken);
      expect(port).not.toBe(taken);
      expect((server.address() as AddressInfo).port).toBe(port);
    } finally {
      server.close();
      busy.close();
    }
  });
});
