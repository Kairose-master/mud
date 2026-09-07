import { existsSync, readdirSync, renameSync, writeFileSync } from "node:fs";

declare global {
  interface Window {
    __frontierCaption?: (text: string | null) => void;
    __frontierEndCard?: (html: string | null) => void;
  }
}
import { join } from "node:path";

/**
 * Film the client in director mode with headless Chromium. Playwright's
 * `recordVideo` writes VP8/WebM, which YouTube takes as-is; there is no
 * H.264 encoder in Playwright's ffmpeg, so no .mp4 is produced here.
 *
 * Chromium flags: software WebGL via SwiftShader so the scene renders on a
 * machine with no GPU (a CI box, a cloud sandbox). Slow, but 1080p at a few
 * frames per second is enough because the world moves one tick a second.
 */
export type Recorder = {
  /** Show a caption line for `ms`, then clear it. Fire-and-forget. */
  caption: (text: string, ms?: number) => void;
  /** Show the closing card and hold it for `ms` before the recording ends. */
  endCard: (html: string, ms?: number) => Promise<void>;
  stop: () => Promise<string>;
};

export async function startRecording(opts: { clientUrl: string; outDir: string; title: string; worldAddress: string; width?: number; height?: number }): Promise<Recorder> {
  const { chromium } = await import("playwright");
  const width = opts.width ?? 1920, height = opts.height ?? 1080;
  const executablePath = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({
    executablePath,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: opts.outDir, size: { width, height } } });
  const page = await context.newPage();
  // The world address goes in the URL so a client built against an older
  // worlds.json still films THIS episode's world.
  const url = `${opts.clientUrl}/?chainId=31337&worldAddress=${opts.worldAddress}&initialBlockNumber=0&director=1&title=${encodeURIComponent(opts.title)}`;
  await page.goto(url, { waitUntil: "load" });
  writeFileSync(join(opts.outDir, "recording.txt"), `${url}\nstarted ${new Date().toISOString()}\n`);
  let captionTimer: NodeJS.Timeout | null = null;
  return {
    caption: (text, ms = 5000) => {
      if (captionTimer) clearTimeout(captionTimer);
      page.evaluate((t) => window.__frontierCaption?.(t), text).catch(() => undefined);
      captionTimer = setTimeout(() => page.evaluate(() => window.__frontierCaption?.(null)).catch(() => undefined), ms);
    },
    endCard: async (html, ms = 7000) => {
      if (captionTimer) clearTimeout(captionTimer);
      await page.evaluate(() => window.__frontierCaption?.(null)).catch(() => undefined);
      await page.evaluate((h) => window.__frontierEndCard?.(h), html).catch(() => undefined);
      await page.waitForTimeout(ms);
    },
    stop: async () => {
      await page.waitForTimeout(1500);
      await context.close();
      await browser.close();
      const webm = readdirSync(opts.outDir).find((f) => f.endsWith(".webm") && f !== "video.webm");
      if (!webm) return "(no video file written)";
      const dest = join(opts.outDir, "video.webm");
      renameSync(join(opts.outDir, webm), dest);
      return dest;
    },
  };
}
