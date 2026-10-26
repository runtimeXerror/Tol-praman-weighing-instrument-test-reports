import fs from "node:fs";
import type { Browser } from "puppeteer";

let browserP: Promise<Browser> | null = null;

/** Common local browser paths, used when Puppeteer's own Chrome is not downloaded. */
const FALLBACKS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean) as string[];

async function browser(): Promise<Browser> {
  if (!browserP) {
    browserP = (async () => {
      const puppeteer = (await import("puppeteer")).default;
      const args = ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"];
      try {
        return await puppeteer.launch({ headless: true, args });
      } catch (e) {
        const exe = FALLBACKS.find((p) => fs.existsSync(p));
        if (!exe) throw e;
        return puppeteer.launch({ headless: true, args, executablePath: exe });
      }
    })();
    browserP.catch(() => { browserP = null; });
  }
  return browserP;
}

export async function htmlToPdf(html: string, footer: string): Promise<Buffer> {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footer,
      margin: { top: "16mm", bottom: "18mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closeBrowser() {
  if (browserP) (await browserP).close().catch(() => {});
  browserP = null;
}
