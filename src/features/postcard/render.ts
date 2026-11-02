// Draws the Trip Postcard into a PNG on the device (M5-04), for Download and the share sheet.
// Same layout as the on-screen card (./layout.ts): photos down both sides, answers in the middle.
// The browser draws the text, so emoji and right-to-left answers render as they do on screen.
import { planAnswers, sideColumns, wrapText, type Measure } from "./layout";

export type PostcardImageInput = {
  title: string;
  subtitle: string;
  photoUrls: (string | null)[];
  answers: { question: string; answers: string[] }[];
  footer: string[];
};

const W = 1800;
const H = 1200;
const COL = 380; // photo column width
const PAD = 40;
const NAVY = "#14213d";
const CREAM = "#fbf6ec";
const GOLD = "#e0a526";
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Color Emoji", sans-serif`;

async function loadImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export async function renderPostcardPng(input: PostcardImageInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the postcard");
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);

  // Photos down both sides.
  const { left, right } = sideColumns(input.photoUrls);
  const images = await Promise.all(
    input.photoUrls.map((u) => (u ? loadImage(u) : Promise.resolve(null))),
  );
  const column = (urls: (string | null)[], offset: number, x: number) => {
    const gap = 16;
    const h = urls.length ? (H - PAD * 2 - gap * (urls.length - 1)) / urls.length : 0;
    urls.forEach((_, i) => {
      const y = PAD + i * (h + gap);
      const img = images[offset + i];
      ctx.fillStyle = "#e6dcc8";
      ctx.fillRect(x, y, COL, h);
      if (img) drawCover(ctx, img, x, y, COL, h);
    });
  };
  column(left, 0, PAD);
  column(right, left.length, W - PAD - COL);

  // The middle: title, place and dates, answers grouped by question, crowns and hopes.
  const x0 = PAD * 2 + COL;
  const width = W - x0 * 2;
  const measure: Measure = (text, px) => {
    ctx.font = `600 ${px}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = NAVY;
  let y = PAD + 10;
  ctx.font = `800 56px ${FONT}`;
  for (const line of wrapText(input.title, width, 56, (t) => ctx.measureText(t).width)) {
    ctx.fillText(line, W / 2, y, width);
    y += 66;
  }
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = GOLD;
  ctx.fillText(input.subtitle.toUpperCase(), W / 2, y + 4, width);
  y += 56;

  const footerPx = 22;
  const footerLines = input.footer.flatMap((f) => wrapText(f, width, footerPx, measure));
  const footerH = footerLines.length * footerPx * 1.4;
  const plan = planAnswers(input.answers, width, H - y - PAD - footerH - 20, measure);
  for (const block of plan.blocks) {
    const question = block.kind === "question";
    const px = question ? Math.round(plan.fontPx * 0.8) : plan.fontPx;
    ctx.font = `${question ? 800 : 500} ${px}px ${FONT}`;
    ctx.fillStyle = question ? GOLD : NAVY;
    if (question) y += plan.lineHeight * 0.4;
    for (const line of block.lines) {
      ctx.fillText(line, W / 2, y, width);
      y += plan.lineHeight;
    }
  }
  ctx.font = `600 ${footerPx}px ${FONT}`;
  ctx.fillStyle = NAVY;
  let fy = H - PAD - footerH;
  for (const line of footerLines) {
    ctx.fillText(line, W / 2, fy, width);
    fy += footerPx * 1.4;
  }
  images.forEach((img) => img?.close());

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't make the image"))),
      "image/png",
    ),
  );
}

/** Share the image with the share sheet where the browser can, else download it. */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
