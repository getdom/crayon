import { describe, it, expect } from "vitest";
import { wantsShell, frameUrl, shellHtml, DEVICES, FRAME_PARAM, FRAME_VALUE } from "../src/shell/index.js";

const doc = { "sec-fetch-dest": "document", accept: "text/html,*/*" };
const frame = { "sec-fetch-dest": "iframe", accept: "text/html,*/*" };
const asset = { "sec-fetch-dest": "script", accept: "*/*" };

describe("wantsShell", () => {
  it("answers a top-level navigation", () => {
    expect(wantsShell("/", doc)).toBe(true);
    expect(wantsShell("/about", doc)).toBe(true);
  });

  it("steps aside for the shell's own frame", () => {
    expect(wantsShell(`/?${FRAME_PARAM}=${FRAME_VALUE}`, doc)).toBe(false);
    expect(wantsShell("/", frame)).toBe(false);
    expect(wantsShell("/about", frame)).toBe(false);
  });

  it("never answers for assets or Crayon's own routes", () => {
    expect(wantsShell("/src/style.css", asset)).toBe(false);
    expect(wantsShell("/__crayon/overlay.js", doc)).toBe(false);
    expect(wantsShell("/__crayon/theme", doc)).toBe(false);
  });

  it("falls back to Accept when the browser sends no Sec-Fetch-Dest", () => {
    expect(wantsShell("/", { accept: "text/html" })).toBe(true);
    expect(wantsShell("/main.js", { accept: "*/*" })).toBe(false);
    expect(wantsShell(`/?${FRAME_PARAM}=${FRAME_VALUE}`, { accept: "text/html" })).toBe(false);
  });
});

describe("frameUrl", () => {
  it("marks the requested path", () => {
    expect(frameUrl("/")).toBe(`/?${FRAME_PARAM}=${FRAME_VALUE}`);
    expect(frameUrl("/about")).toBe(`/about?${FRAME_PARAM}=${FRAME_VALUE}`);
  });

  it("keeps the query the site was asked for", () => {
    const out = new URL(`http://x${frameUrl("/search?q=azur&page=2")}`);
    expect(out.pathname).toBe("/search");
    expect(out.searchParams.get("q")).toBe("azur");
    expect(out.searchParams.get("page")).toBe("2");
    expect(out.searchParams.get(FRAME_PARAM)).toBe(FRAME_VALUE);
  });
});

describe("shellHtml", () => {
  it("frames the path that was requested", () => {
    expect(shellHtml("/pricing")).toContain(`src="/pricing?${FRAME_PARAM}=${FRAME_VALUE}"`);
  });

  it("is a complete document that loads no third party", () => {
    const html = shellHtml("/");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/src="https?:/);
  });

  it("has no toolbar of its own and hands the widths to the overlay", () => {
    const html = shellHtml("/");
    expect(html).not.toContain('class="bar"');
    expect(html).toContain("window.__crayonShell");
    for (const d of DEVICES) expect(html).toContain(`"id":"${d.id}"`);
  });
});
