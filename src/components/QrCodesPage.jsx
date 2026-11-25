import React, { useState } from "react";
import QRCode from "qrcode";
import { QRBox } from "./QRBox";
import { Icon } from "./Icon";
import { S, NAVY } from "../styles";

// Change this one value if you get the exact official jw.org blue hex —
// it controls the color of every QR code on this page.
const BRAND_BLUE = "#0072CE";
// A lighter tint of the brand blue, used for the department "ribbon"
// section headers in the browsing list.
const RIBBON_BLUE = "#4DA6E0";

function clearPrintMarks() {
  document.querySelectorAll(".qr-print-only, .qr-print-only-group").forEach((el) => {
    el.classList.remove("qr-print-only", "qr-print-only-group");
  });
}

// Turns a department name into a safe DOM id for the "jump to group" nav.
function deptSlug(name) {
  return "qr-dept-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Same "how many codes does this item get" logic used on-screen, kept as
// its own helper so the bare print-all grid can compute it for every
// item in the catalog, not just whichever ones happen to be expanded
// or match the current search box.
function codesForItem(item) {
  const stored = item.qrCount != null ? item.qrCount : item.perUnitQr ? Math.max(Number(item.total) || 0, 1) : 1;
  const n = Math.max(parseInt(stored, 10) || 1, 1);
  if (n > 1) {
    return Array.from({ length: n }, (_, i) => ({
      key: `${item.id}-${i + 1}`,
      payload: JSON.stringify({ name: item.name, unit: i + 1 }),
      label: `${item.name} #${i + 1} of ${n}`,
    }));
  }
  return [{ key: item.id, payload: JSON.stringify({ name: item.name }), label: item.name }];
}

// Prints every code on the page, across every item in the whole catalog
// (regardless of search filter or which accordions happen to be open),
// as a dense, bare grid grouped by department — no forms, no per-item
// headers, no per-code labels, just codes and a small department line,
// to fit as many as possible on each page.
function printAll() {
  clearPrintMarks();
  document.body.classList.add("print-all-mode");
  // Forces the class change to apply synchronously before printing —
  // without this, some browsers can defer it to the next paint, so
  // print can fire using stale styles that still show the whole page.
  void document.body.offsetHeight;
  const cleanup = () => {
    document.body.classList.remove("print-all-mode");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// Prints one or more specific codes/stickers by their key, hiding
// everything else that would otherwise show on the page.
function printCodes(keys) {
  clearPrintMarks();
  const found = keys.map((k) => document.querySelector(`.qr-print-card[data-key="${k}"]`)).filter(Boolean);
  if (found.length === 0) return;
  found.forEach((el) => el.classList.add("qr-print-only"));
  const cleanup = () => {
    clearPrintMarks();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// Prints just one specific code, wherever it is.
function printOneCode(key) {
  printCodes([key]);
}

// Prints every code belonging to one or more items — used for both
// "Print All" on a single item's header and "Print Selected" across a
// custom group, since both just mark a set of items to keep visible.
function printItemGroups(itemIds) {
  clearPrintMarks();
  const found = itemIds
    .map((id) => document.querySelector(`.accordion-item[data-item-id="${id}"]`))
    .filter(Boolean);
  if (found.length === 0) return;
  found.forEach((el) => el.classList.add("qr-print-only-group"));
  const cleanup = () => {
    clearPrintMarks();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// ---------------------------------------------------------------
// "Print on Label Sheets" — builds a real PDF laid out for pre-cut
// adhesive label stock (the 2in x 2in, 20-per-sheet square label
// sheets, 4 across x 5 down on an 8.5x11 sheet — the same standard
// template family most vendors, including Premium Label Supply, use
// for this size) and hands it to the OS share sheet, the same
// Web-Share-API-first pattern already proven out for printing orders
// in OrdersPage.jsx. No new npm dependency is added for this — the
// PDF is hand-written raw PDF syntax, and the QR codes are rendered
// with the same QRCode.toCanvas() already used on-screen by QRBox,
// then re-used as a JPEG image embedded directly in the PDF.
// ---------------------------------------------------------------
const LABEL_PAGE_W = 612; // 8.5in @ 72pt/in
const LABEL_PAGE_H = 792; // 11in
const LABEL_QR_PIXELS = 300; // canvas render resolution, for a crisp scan at print size
const LABEL_QR_SIZE_PT = 98; // QR footprint inside each 144x144pt (2in) cell
const PDF_BRAND_COLOR_RGB = [0, 0.447, 0.808]; // ~#0072CE, same blue used everywhere else

// Label-sheet formats, all 8.5x11 (Letter), all die-cut with no
// gap between cells (consistent with how these standard templates are
// usually laid out). "square2" is the one QR codes print on — a QR
// code is itself a square, so it's the only shape guaranteed not to
// get its corners clipped by a round die-cut. "round2" shares the
// exact same 4x5 grid as "square2" (same per-sheet count and overall
// sheet size strongly suggests the same manufacturer master grid,
// just a different die shape over it). "round15" (30-per-sheet, 1.5in
// circles) uses its own grid, sized from the vendor's stated label
// size/count/sheet-size with even margins and no inter-cell gap, the
// same reasoning already used for the other two — this one hasn't
// been checked against an actual printed sheet, so it's worth running
// one test page before committing to a full box of that stock.
const LABEL_FORMATS = {
  square2: {
    id: "square2",
    label: 'Square 2" (20/sheet)',
    shape: "square",
    allowQr: true,
    cols: 4,
    rows: 5,
    cellW: 144,
    cellH: 144,
  },
  round2: {
    id: "round2",
    label: 'Round 2" (20/sheet)',
    shape: "circle",
    allowQr: false,
    cols: 4,
    rows: 5,
    cellW: 144,
    cellH: 144,
  },
  round15: {
    id: "round15",
    label: 'Round 1.5" (30/sheet)',
    shape: "circle",
    allowQr: false,
    cols: 5,
    rows: 6,
    cellW: 108,
    cellH: 108,
  },
  // A big rectangular label (not square), e.g. for a department sign
  // rather than a per-item code — text stickers only, same as the
  // round formats, not because a rectangle would clip a QR code but
  // because QR codes are meant to stay on the square 2x2 stock only.
  rect4x5: {
    id: "rect4x5",
    label: '4"x5" (4/sheet)',
    shape: "square",
    allowQr: false,
    cols: 2,
    rows: 2,
    cellW: 288, // 4in
    cellH: 360, // 5in
  },
};
// Derive each format's margins from its grid so the cells are always
// centered on the sheet, rather than hand-maintaining margins that
// could drift out of sync with cols/rows/cellW/cellH above.
for (const fmt of Object.values(LABEL_FORMATS)) {
  fmt.marginX = (LABEL_PAGE_W - fmt.cols * fmt.cellW) / 2;
  fmt.marginY = (LABEL_PAGE_H - fmt.rows * fmt.cellH) / 2;
  fmt.perSheet = fmt.cols * fmt.rows;
}

// PDF's base-14 fonts only reliably cover plain ASCII, so "smart"
// punctuation is normalized and anything else outside ASCII is
// dropped to "?" rather than risk a corrupted file. (Duplicated here,
// rather than imported, so this file keeps generating its PDF the
// same way OrdersPage.jsx does without the two files needing to share
// a module — small helpers, cheap to keep in sync by inspection.)
function labelPdfText(value) {
  const normalized = String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/…/g, "...");
  let out = "";
  for (const ch of normalized) {
    out += ch.codePointAt(0) <= 127 ? ch : "?";
  }
  return out.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function labelPdfTextWidth(text, size, bold) {
  // Bold uppercase text (the sticker/label font) runs noticeably wider
  // than the 0.56 average used for regular text, so it gets its own,
  // more conservative factor — this matters a lot more here than it
  // used to, now that the big 4x5 format renders this same text at
  // 28pt instead of the ~10-14pt the smaller formats use, where a
  // small per-character underestimate used to be too tiny to notice.
  return String(text).length * size * (bold ? 0.66 : 0.56);
}

// Wraps by actually measuring each candidate line against
// labelPdfTextWidth (the same estimate used to size/center the text),
// rather than an independent character-count heuristic — the two
// previously used different width factors, which let long bold lines
// (especially at the 4x5 format's larger font size) overflow past
// their cell's edge instead of wrapping.
function labelPdfWrapText(text, maxWidthPt, fontSize, bold) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (labelPdfTextWidth(candidate, fontSize, bold) > maxWidthPt && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Renders a QR payload to a small square JPEG and resolves with its
// raw bytes as a "binary string" (one JS character per byte, value
// 0-255) — exactly what atob() produces, and exactly what the PDF
// byte-offset trick below needs: every character used while building
// the PDF is guaranteed to be a single byte, so string length can be
// used directly as a byte offset, image bytes included.
function renderQrJpegBinary(payload) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    QRCode.toCanvas(
      canvas,
      payload,
      { width: LABEL_QR_PIXELS, margin: 1, color: { dark: BRAND_BLUE, light: "#ffffff" } },
      (err) => {
        if (err) return reject(err);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
          resolve({ binary: atob(base64), width: canvas.width, height: canvas.height });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// Bottom-left-origin (PDF coordinate space) box for a slot within one
// sheet of the given format, reading left-to-right, top-to-bottom —
// matching how the labels are physically die-cut on the sheet.
function labelCellBox(slot, fmt) {
  const col = slot % fmt.cols;
  const row = Math.floor(slot / fmt.cols);
  const x0 = fmt.marginX + col * fmt.cellW;
  const y1 = LABEL_PAGE_H - fmt.marginY - row * fmt.cellH;
  const y0 = y1 - fmt.cellH;
  return { x0, y0, x1: x0 + fmt.cellW, y1, cx: x0 + fmt.cellW / 2, cy: y0 + fmt.cellH / 2 };
}

// A filled circle, built from 4 cubic-bezier quarter-arcs (the
// standard kappa ~= 0.5523 approximation) — raw PDF has no built-in
// circle primitive.
function pdfCirclePathOps(cx, cy, r, color) {
  const k = r * 0.5523;
  const d =
    `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m ` +
    `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c ` +
    `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c ` +
    `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c ` +
    `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c h f`;
  return { type: "path", color, d };
}

// Splits the queued entries into pages of fmt.perSheet slots each.
// Only the very first page is offset by startPos-1 blank slots, so
// printing can resume partway down a sheet that's already missing a
// few labels — every page after that fills from slot 0.
function pdfLayoutLabelSheetPages(entries, startPos, fmt) {
  const offset = Math.max(0, Math.min(fmt.perSheet - 1, (startPos || 1) - 1));
  const pages = [];
  let idx = 0;
  let cellOffset = offset;
  while (idx < entries.length) {
    const pageCells = [];
    let slot = cellOffset;
    while (slot < fmt.perSheet && idx < entries.length) {
      pageCells.push({ slot, entry: entries[idx] });
      slot += 1;
      idx += 1;
    }
    pages.push(pageCells);
    cellOffset = 0;
  }
  return pages;
}

function pdfLabelPageOps(pageCells, qrImageRefs, fmt) {
  const ops = [];
  for (const { slot, entry } of pageCells) {
    const box = labelCellBox(slot, fmt);
    if (entry.type === "text") {
      // The physical die-cut shape of this format wins over whatever
      // shape the sticker was generated with — a "square" sticker
      // background printed on a round label would just get clipped to
      // the circle when peeled, wasting the corners rather than
      // showing them, so round formats always fill the inscribed
      // circle regardless of entry.shape.
      const shape = fmt.shape === "circle" ? "circle" : entry.shape;
      // Cells aren't always square (the 4x5 rectangle format has a
      // taller cell than it is wide), so every measurement below is
      // driven off the smaller of the two dimensions, and the fill
      // itself uses the cell's actual width/height rather than
      // assuming they match.
      const cellW = fmt.cellW;
      const cellH = fmt.cellH;
      const minDim = Math.min(cellW, cellH);
      const pad = Math.max(3, Math.round(minDim * 0.035));
      if (shape === "circle") {
        ops.push(pdfCirclePathOps(box.cx, box.cy, minDim / 2 - pad, PDF_BRAND_COLOR_RGB));
      } else {
        ops.push({
          type: "rect",
          x: box.x0 + pad,
          y: box.y0 + pad,
          w: cellW - pad * 2,
          h: cellH - pad * 2,
          color: PDF_BRAND_COLOR_RGB,
        });
      }
      // Font size scales with the physical cell size, so text on the
      // smaller 1.5in format doesn't overflow its label, and a bigger
      // label (like the 4x5) gets correspondingly bigger text.
      const fontSize = Math.max(8, Math.round(((14 * minDim) / 144) * 10) / 10);
      const lineH = fontSize * 1.15;
      const maxTextWidth = shape === "circle" ? minDim * 0.66 : cellW - cellW * 0.18;
      const maxLines = Math.max(1, Math.min(6, Math.floor((cellH - pad * 4) / lineH)));
      const lines = labelPdfWrapText(String(entry.text || "").toUpperCase(), maxTextWidth, fontSize, true).slice(
        0,
        maxLines
      );
      let ty = box.cy + ((lines.length - 1) * lineH) / 2 + fontSize * 0.32;
      for (const line of lines) {
        ops.push({ type: "text", x: box.cx, y: ty, text: line, font: "F2", size: fontSize, white: true, center: true });
        ty -= lineH;
      }
    } else {
      // QR codes only ever lay out on the square2 format (enforced
      // before this is called), where the cell is always 144x144pt,
      // so the fixed LABEL_QR_SIZE_PT footprint below is safe as-is.
      const ref = qrImageRefs.get(entry.payload);
      const qrTopGap = 8;
      const qrY1 = box.y1 - qrTopGap;
      const qrY0 = qrY1 - LABEL_QR_SIZE_PT;
      if (ref) {
        ops.push({
          type: "image",
          name: ref.resourceName,
          x: box.cx - LABEL_QR_SIZE_PT / 2,
          y: qrY0,
          w: LABEL_QR_SIZE_PT,
          h: LABEL_QR_SIZE_PT,
        });
      }
      if (entry.label) {
        const lines = labelPdfWrapText(entry.label, fmt.cellW - 10, 7.5).slice(0, 2);
        const lineH = 9.5;
        let ty = qrY0 - 12;
        for (const line of lines) {
          ops.push({ type: "text", x: box.cx, y: ty, text: line, font: "F1", size: 7.5, center: true });
          ty -= lineH;
        }
      }
    }
  }
  return ops;
}

function pdfLabelOpsToContentStream(ops) {
  let body = "";
  for (const op of ops) {
    if (op.type !== "rect") continue;
    const [r, g, b] = op.color;
    body += `${r} ${g} ${b} rg\n${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f\n`;
  }
  for (const op of ops) {
    if (op.type !== "path") continue;
    const [r, g, b] = op.color;
    body += `${r} ${g} ${b} rg\n${op.d}\n`;
  }
  for (const op of ops) {
    if (op.type !== "image") continue;
    body += `q ${op.w.toFixed(2)} 0 0 ${op.h.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)} cm /${op.name} Do Q\n`;
  }
  body += "BT\n";
  for (const op of ops) {
    if (op.type !== "text") continue;
    let x = op.x;
    if (op.center) x = op.x - labelPdfTextWidth(op.text, op.size, op.font === "F2") / 2;
    if (op.white) body += "1 1 1 rg\n";
    else body += "0 g\n0 0 0 rg\n";
    body += `/${op.font} ${op.size} Tf\n`;
    body += `1 0 0 1 ${x.toFixed(2)} ${op.y.toFixed(2)} Tm\n`;
    body += `(${labelPdfText(op.text)}) Tj\n`;
  }
  body += "ET\n";
  return body;
}

// Assembles the final label-sheet PDF as raw bytes for a given format
// (one of LABEL_FORMATS). Pre-renders every distinct QR payload
// exactly once (duplicates in the queue reuse the same embedded
// image), then lays out that format's per-sheet pages and writes the
// whole document as one big ASCII/Latin-1-safe string, tracking byte
// offsets via string length — valid because every character used
// (PDF syntax, escaped text, and the raw JPEG "binary string" bytes
// alike) is guaranteed to be a single byte.
async function buildLabelSheetPdfBytes(entries, startPos, formatId) {
  const fmt = LABEL_FORMATS[formatId] || LABEL_FORMATS.square2;
  const qrPayloads = Array.from(new Set(entries.filter((e) => e.type === "qr").map((e) => e.payload)));
  const rendered = await Promise.all(qrPayloads.map((p) => renderQrJpegBinary(p)));
  const images = qrPayloads.map((payload, i) => ({ payload, resourceName: `Im${i}`, objNum: 5 + i, ...rendered[i] }));
  const qrImageRefs = new Map(images.map((im) => [im.payload, im]));

  const pages = pdfLayoutLabelSheetPages(entries, startPos, fmt);
  const firstPageObjNum = 5 + images.length;
  const pageObjNums = pages.map((_, i) => firstPageObjNum + i * 2);
  const contentObjNums = pages.map((_, i) => firstPageObjNum + i * 2 + 1);

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`,
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
  ];
  for (const im of images) {
    objects.push(
      `${im.objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.binary.length} >>\nstream\n${im.binary}\nendstream\nendobj\n`
    );
  }

  const xObjResourceDict = `<< ${images.map((im) => `/${im.resourceName} ${im.objNum} 0 R`).join(" ")} >>`;

  pages.forEach((pageCells, i) => {
    const ops = pdfLabelPageOps(pageCells, qrImageRefs, fmt);
    const content = pdfLabelOpsToContentStream(ops);
    objects.push(
      `${pageObjNums[i]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LABEL_PAGE_W} ${LABEL_PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject ${xObjResourceDict} >> /Contents ${contentObjNums[i]} 0 R >>\nendobj\n`
    );
    objects.push(`${contentObjNums[i]} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  const totalObjs = objects.length + 1;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjs; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

// Each item is a collapsible section (collapsed by default) so
// browsing doesn't mean scrolling through every code for every item
// at once. Each item also has its own adjustable "how many codes"
// count — independent of its catalog Total Quantity, so you can print
// spares, fewer than you have, or however many you actually need —
// and a checkbox to build a custom group of items to print together.
export function QrCodesPage({ items, updateItem }) {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const [openItems, setOpenItems] = useState({});
  const [openDepts, setOpenDepts] = useState({}); // { [department]: true } — collapsed by default
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({}); // { [itemId]: true }
  const [countDrafts, setCountDrafts] = useState({}); // { [itemId]: "5" } while editing
  const [paperSize, setPaperSize] = useState("letter"); // "letter" | "tabloid" (11x17) — applies to any print from this page

  const filtered = sorted.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  // The browsing list, grouped by department — so a "jump to group" nav
  // can scroll straight to one instead of scrolling the whole page.
  const groupedFiltered = React.useMemo(() => {
    const byDept = new Map();
    for (const item of filtered) {
      const dept = item.category || "Uncategorized";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(item);
    }
    return Array.from(byDept.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([department, deptItems]) => ({ department, items: deptItems }));
  }, [filtered]);

  // Grouped for the bare "Print All" grid — built from every item in the
  // catalog (not the search-filtered list), by department.
  const departmentPrintGroups = React.useMemo(() => {
    const byDept = new Map();
    for (const item of sorted) {
      const dept = item.category || "Uncategorized";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(...codesForItem(item));
    }
    return Array.from(byDept.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([department, codes]) => ({ department, codes }));
  }, [sorted]);

  function toggleItem(id) {
    setOpenItems((o) => ({ ...o, [id]: !o[id] }));
  }

  function toggleSelected(id) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function countFor(item) {
    if (countDrafts[item.id] !== undefined) return countDrafts[item.id];
    const stored = item.qrCount != null ? item.qrCount : item.perUnitQr ? Math.max(Number(item.total) || 0, 1) : 1;
    return String(stored);
  }

  function commitCount(item) {
    const raw = countDrafts[item.id];
    if (raw === undefined) return;
    const n = Math.max(parseInt(raw, 10) || 1, 1);
    updateItem(item.id, { qrCount: n, perUnitQr: n > 1 });
    setCountDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
  }

  const [customText, setCustomText] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [generated, setGenerated] = useState(null); // { text, label } | null

  const [stickerText, setStickerText] = useState("Lubbock CEPC");
  const [stickerShape, setStickerShape] = useState("circle"); // circle | square
  const [stickerCount, setStickerCount] = useState("1");
  const [stickers, setStickers] = useState([]); // [{ key, text, shape }]

  function handleGenerate(e) {
    e.preventDefault();
    if (!customText.trim()) return;
    setGenerated({ text: customText.trim(), label: customLabel.trim() || customText.trim() });
  }

  function handleClearGenerated() {
    setGenerated(null);
    setCustomText("");
    setCustomLabel("");
  }

  function handleGenerateStickers(e) {
    e.preventDefault();
    const text = stickerText.trim();
    if (!text) return;
    const n = Math.max(parseInt(stickerCount, 10) || 1, 1);
    setStickers(
      Array.from({ length: n }, (_, i) => ({ key: `sticker-${Date.now()}-${i}`, text, shape: stickerShape }))
    );
  }

  function handleClearStickers() {
    setStickers([]);
  }

  // ---- "Print on Label Sheets" queue --------------------------------
  // A separate, additive flow: items here get added from various spots
  // around the page (a single code, a whole item's codes, the selected
  // items, the custom QR generator, or the custom text stickers), then
  // printed together as one PDF laid out for the 2x2in/20-per-sheet
  // label stock. The existing "Print All/Selected/This Code" buttons
  // are untouched — those still print loose codes on plain paper.
  const [labelQueue, setLabelQueue] = useState([]); // [{ qkey, type: 'qr'|'text', payload?, label?, text?, shape? }]
  const [labelStartPos, setLabelStartPos] = useState("1");
  const [buildingLabelSheet, setBuildingLabelSheet] = useState(false);
  const [labelFormat, setLabelFormat] = useState("square2"); // square2 | round2 | round15

  // QR codes only ever print on the square 2x2 stock (a QR is itself
  // square, so it's the one shape a round die-cut can't clip the
  // corners off of) — so the moment any QR entry is queued, the round
  // formats are off the table for this batch, however the toggle is
  // set, since one "print" has to be one consistent sheet type.
  const hasQrQueued = labelQueue.some((e) => e.type === "qr");
  const effectiveLabelFormatId = hasQrQueued ? "square2" : labelFormat;
  const effectiveLabelFormat = LABEL_FORMATS[effectiveLabelFormatId];

  function addToLabelQueue(newEntries) {
    if (newEntries.length === 0) return;
    setLabelQueue((q) => [
      ...q,
      ...newEntries.map((e) => ({ ...e, qkey: `lq-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
    ]);
  }

  function addItemCodesToLabelQueue(item) {
    addToLabelQueue(codesForItem(item).map((c) => ({ type: "qr", payload: c.payload, label: c.label })));
  }

  function addSelectedToLabelQueue() {
    const its = sorted.filter((it) => selectedIds.includes(it.id));
    const entries = [];
    for (const it of its) entries.push(...codesForItem(it).map((c) => ({ type: "qr", payload: c.payload, label: c.label })));
    addToLabelQueue(entries);
  }

  function addGeneratedToLabelQueue() {
    if (!generated) return;
    addToLabelQueue([{ type: "qr", payload: generated.text, label: generated.label }]);
  }

  function addStickersToLabelQueue() {
    addToLabelQueue(stickers.map((s) => ({ type: "text", text: s.text, shape: s.shape })));
  }

  function removeFromLabelQueue(qkey) {
    setLabelQueue((q) => q.filter((e) => e.qkey !== qkey));
  }

  function clearLabelQueue() {
    setLabelQueue([]);
  }

  // Same Web-Share-API-first, blob-fallback pattern already proven out
  // for printing orders (see handlePrintOrder in OrdersPage.jsx) —
  // hands a real PDF file straight to the OS share sheet, which has
  // its own native Print option, rather than relying on window.print().
  async function handlePrintLabelSheet() {
    if (labelQueue.length === 0 || buildingLabelSheet) return;
    setBuildingLabelSheet(true);
    try {
      const startPos = Math.max(1, Math.min(effectiveLabelFormat.perSheet, parseInt(labelStartPos, 10) || 1));
      const pdfBytes = await buildLabelSheetPdfBytes(labelQueue, startPos, effectiveLabelFormatId);
      const fileName = `Label Sheet - ${labelQueue.length} labels.pdf`;

      if (typeof navigator.canShare === "function") {
        try {
          const file = new File([pdfBytes], fileName, { type: "application/pdf" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName });
            return;
          }
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
      }

      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        window.alert("Your browser blocked opening the label sheet. Please allow pop-ups for this site and try again.");
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      window.alert("Something went wrong building the label sheet PDF. Please try again.");
    } finally {
      setBuildingLabelSheet(false);
    }
  }

  return (
    <div className="qr-page-root">
      <div className="qr-all-print-only">
        {departmentPrintGroups.map((group) => (
          <React.Fragment key={group.department}>
            <div className="qr-dept-label">
              {group.department} — {group.codes.length} {group.codes.length === 1 ? "code" : "codes"}
            </div>
            <div className="qr-print-grid-dense">
              {group.codes.map((entry) => (
                <div key={entry.key} className="qr-print-card" style={qrCardStyle}>
                  <div className="qr-brand-header" style={brandHeaderStyle}>CEPC-Lubbock</div>
                  <QRBox payload={entry.payload} color={BRAND_BLUE} />
                  <div className="qr-code-label" style={qrLabelStyle}>{entry.label}</div>
                </div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="no-print" style={S.card}>
        <h2 style={S.cardTitle}>Custom QR Code Generator</h2>
        <p style={S.tinyMuted}>
          Create a QR code for any text or link — a sign-up form, WiFi password, a webpage, anything.
        </p>
        <form onSubmit={handleGenerate}>
          <label style={S.fieldLabel}>
            Text or URL
            <input
              style={S.fieldInput}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="https://example.com or any text"
            />
          </label>
          <label style={S.fieldLabel}>
            Label (optional)
            <input
              style={S.fieldInput}
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="What to print under the code"
            />
          </label>
          <button style={S.primaryBtn} type="submit" disabled={!customText.trim()}>
            Generate QR Code
          </button>
        </form>
      </div>

      {generated && (
        <div style={S.card}>
          <div className="qr-print-card" data-key="generated" style={qrCardStyle}>
            <div className="qr-brand-header" style={brandHeaderStyle}>CEPC-Lubbock</div>
            <QRBox payload={generated.text} color={BRAND_BLUE} />
            <div className="qr-code-label" style={qrLabelStyle}>{generated.label}</div>
          </div>
          <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={S.addItemBtn} onClick={() => printOneCode("generated")}>
              Print This Code
            </button>
            <button style={addToLabelBtnStyle} onClick={addGeneratedToLabelQueue}>
              + Add to Label Sheet
            </button>
            <button style={S.secondaryBtn} onClick={handleClearGenerated}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="no-print" style={S.card}>
        <h2 style={S.cardTitle}>Custom Text Sticker</h2>
        <p style={S.tinyMuted}>
          Bold, eye-catching stickers — no QR code — handy for branding equipment cases, boxes, or
          trailers. Each prints at about 2 inches.
        </p>
        <form onSubmit={handleGenerateStickers}>
          <label style={S.fieldLabel}>
            Sticker Text
            <input
              style={S.fieldInput}
              value={stickerText}
              onChange={(e) => setStickerText(e.target.value)}
              placeholder="Lubbock CEPC"
            />
          </label>
          <label style={S.fieldLabel}>Shape</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              style={{ ...S.catTab, flex: 1, ...(stickerShape === "circle" ? S.catTabActive : {}) }}
              onClick={() => setStickerShape("circle")}
            >
              Circle
            </button>
            <button
              type="button"
              style={{ ...S.catTab, flex: 1, ...(stickerShape === "square" ? S.catTabActive : {}) }}
              onClick={() => setStickerShape("square")}
            >
              Square
            </button>
          </div>
          <label style={S.fieldLabel}>
            How many stickers?
            <input
              style={S.fieldInput}
              type="number"
              min="1"
              value={stickerCount}
              onChange={(e) => setStickerCount(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button style={S.primaryBtn} type="submit" disabled={!stickerText.trim()}>
            Generate Stickers
          </button>
        </form>
      </div>

      {stickers.length > 0 && (
        <div style={S.card}>
          <p className="no-print" style={S.tinyMuted}>
            {stickers.length === 1
              ? "1 sticker ready to print."
              : `${stickers.length} identical stickers ready to print — showing one preview below.`}
          </p>

          {/* Only the first sticker is shown on screen — the rest exist
              purely so "Print All Stickers" produces the full batch. */}
          <div className="qr-print-grid" style={{ ...qrGridStyle, maxWidth: 220, margin: "0 auto" }}>
            <div
              className="qr-print-card sticker-print-card"
              data-key={stickers[0].key}
              style={stickers[0].shape === "circle" ? stickerCircleStyle : stickerSquareStyle}
            >
              <div style={stickerTextStyle}>{stickers[0].text}</div>
              <button
                className="no-print"
                style={printOneStickerBtnStyle}
                onClick={() => printCodes([stickers[0].key])}
              >
                Print This Sticker
              </button>
            </div>
          </div>

          {stickers.length > 1 && (
            <div className="screen-hide-print-show">
              <div className="qr-print-grid" style={qrGridStyle}>
                {stickers.slice(1).map((s) => (
                  <div
                    key={s.key}
                    className="qr-print-card sticker-print-card"
                    data-key={s.key}
                    style={s.shape === "circle" ? stickerCircleStyle : stickerSquareStyle}
                  >
                    <div style={stickerTextStyle}>{s.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button style={S.addItemBtn} onClick={() => printCodes(stickers.map((s) => s.key))}>
              Print All Stickers ({stickers.length})
            </button>
            <button style={addToLabelBtnStyle} onClick={addStickersToLabelQueue}>
              + Add to Label Sheet
            </button>
            <button style={S.secondaryBtn} onClick={handleClearStickers}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div style={S.adminBar}>
        <h2 style={S.cardTitle}>Printable QR Codes</h2>
        <button style={S.addItemBtn} onClick={printAll}>
          Print All QR Codes
        </button>
      </div>

      <div className="no-print" style={paperSizeRowStyle}>
        <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>Paper Size:</span>
        <button
          type="button"
          style={{ ...S.catTab, ...(paperSize === "letter" ? S.catTabActive : {}) }}
          onClick={() => setPaperSize("letter")}
        >
          Letter
        </button>
        <button
          type="button"
          style={{ ...S.catTab, ...(paperSize === "tabloid" ? S.catTabActive : {}) }}
          onClick={() => setPaperSize("tabloid")}
        >
          11×17 (Tabloid)
        </button>
      </div>

      {sorted.length > 0 && (
        <div className="no-print" style={S.toolbar}>
          <div style={S.searchWrap}>
            <Icon.search />
            <input
              style={S.searchInput}
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {groupedFiltered.length > 1 && (
        <div className="no-print" style={quickNavWrapStyle}>
          {groupedFiltered.map((g) => (
            <button
              key={g.department}
              type="button"
              style={quickNavChipStyle}
              onClick={() => {
                setOpenDepts((d) => ({ ...d, [g.department]: true }));
                const el = document.getElementById(deptSlug(g.department));
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {g.department}
            </button>
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div style={selectedBarStyle}>
          <span>
            {selectedIds.length} item{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={S.addItemBtn} onClick={() => printItemGroups(selectedIds)}>
              Print Selected
            </button>
            <button style={addToLabelBtnStyle} onClick={addSelectedToLabelQueue}>
              + Add to Label Sheet
            </button>
            <button style={S.secondaryBtn} onClick={() => setSelected({})}>
              Clear
            </button>
          </div>
        </div>
      )}

      {labelQueue.length > 0 && (
        <div className="no-print" style={labelQueueBarStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#2471a3" }}>
              {labelQueue.length} label{labelQueue.length > 1 ? "s" : ""} queued for label sheet printing
              {labelQueue.length > effectiveLabelFormat.perSheet
                ? ` (${Math.ceil(
                    (labelQueue.length + (parseInt(labelStartPos, 10) || 1) - 1) / effectiveLabelFormat.perSheet
                  )} sheets)`
                : ""}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#2471a3", fontWeight: 700 }}>
                Start at label #
                <input
                  type="number"
                  min="1"
                  max={effectiveLabelFormat.perSheet}
                  style={{ ...countInputStyle, width: 44 }}
                  value={labelStartPos}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setLabelStartPos(e.target.value)}
                />
                <span style={{ fontWeight: 400 }}>of {effectiveLabelFormat.perSheet}</span>
              </label>
              <button style={S.addItemBtn} disabled={buildingLabelSheet} onClick={handlePrintLabelSheet}>
                {buildingLabelSheet ? "Building…" : "Print Label Sheet"}
              </button>
              <button style={S.secondaryBtn} onClick={clearLabelQueue}>
                Clear
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "#2471a3", fontWeight: 700 }}>Label Stock:</span>
            {Object.values(LABEL_FORMATS).map((fmt) => {
              const disabled = hasQrQueued && !fmt.allowQr;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  disabled={disabled}
                  style={{
                    ...S.catTab,
                    ...(effectiveLabelFormatId === fmt.id ? S.catTabActive : {}),
                    ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
                  }}
                  onClick={() => !disabled && setLabelFormat(fmt.id)}
                >
                  {fmt.label}
                </button>
              );
            })}
          </div>
          {hasQrQueued && (
            <p style={{ fontSize: 11, color: "#6a8bab", marginTop: 6, marginBottom: 0 }}>
              This batch includes QR codes, so it prints on 2" square sheets — QR codes are square, so that's the
              only shape a round label can't clip the corners off of. Remove the QR codes to use round label stock.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {labelQueue.map((e) => (
              <span key={e.qkey} style={labelQueueChipStyle}>
                {e.type === "text" ? `"${e.text}" sticker` : e.label}
                <button type="button" style={labelQueueChipRemoveStyle} onClick={() => removeFromLabelQueue(e.qkey)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#6a8bab", marginTop: 8, marginBottom: 0 }}>
            Formatted for {effectiveLabelFormat.label} sheets ({effectiveLabelFormat.cols} across,{" "}
            {effectiveLabelFormat.rows} down) — like Premium Label Supply's adhesive sticker stock.
            {effectiveLabelFormatId === "round15"
              ? " This size's grid hasn't been checked against a real printed sheet yet — worth running one test page before buying a full box."
              : ""}{" "}
            "Print Label Sheet" opens your device's share sheet so you can print or save it.
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={S.card}>
          <p style={S.tinyMuted}>No items in the catalog yet.</p>
        </div>
      ) : groupedFiltered.length === 0 ? (
        <div style={S.card}>
          <p style={S.tinyMuted}>No items match "{search}".</p>
        </div>
      ) : (
        <div style={S.card}>
          {groupedFiltered.map((group) => {
            const deptSelectedIds = group.items.filter((it) => selected[it.id]).map((it) => it.id);
            return (
              <div key={group.department} id={deptSlug(group.department)} className="qr-dept-section">
                <div
                  className="no-print"
                  style={{ ...deptSectionHeaderStyle, cursor: "pointer" }}
                  onClick={() => setOpenDepts((d) => ({ ...d, [group.department]: !d[group.department] }))}
                >
                  <span style={deptSectionTitleStyle}>
                    <span style={{ display: "inline-block", marginRight: 6 }}>
                      {openDepts[group.department] ? "⌄" : "›"}
                    </span>
                    {group.department}
                  </span>
                  <button
                    style={{ ...deptPrintBtnStyle, ...(deptSelectedIds.length === 0 ? S.btnDisabled : {}) }}
                    disabled={deptSelectedIds.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      printItemGroups(deptSelectedIds);
                    }}
                  >
                    Print Selected{deptSelectedIds.length > 0 ? ` (${deptSelectedIds.length})` : ""}
                  </button>
                </div>
                <div className="dept-items-body" style={{ display: openDepts[group.department] ? "block" : "none" }}>
                {group.items.map((item) => {
                  const count = countFor(item);
                  const n = Math.max(parseInt(count, 10) || 1, 1);
                  const codes =
                    n > 1
                      ? Array.from({ length: n }, (_, i) => ({
                          key: `${item.id}-${i + 1}`,
                          payload: JSON.stringify({ name: item.name, unit: i + 1 }),
                          label: `${item.name} #${i + 1} of ${n}`,
                        }))
                      : [{ key: item.id, payload: JSON.stringify({ name: item.name }), label: item.name }];
                  const isOpen = Boolean(openItems[item.id]);

                  return (
                    <div key={item.id} className="accordion-item" data-item-id={item.id} style={accordionItemStyle}>
                      <div className="no-print" style={accordionHeaderStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            className="no-print"
                            type="checkbox"
                            checked={Boolean(selected[item.id])}
                            onChange={() => toggleSelected(item.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div onClick={() => toggleItem(item.id)} style={{ cursor: "pointer" }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a2e" }}>{item.name}</div>
                            <div style={S.tinyMuted}>{n === 1 ? "1 code" : `${n} codes`}</div>
                          </div>
                        </div>
                        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888" }}>
                            Codes:
                            <input
                              type="number"
                              min="1"
                              style={countInputStyle}
                              value={count}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setCountDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                              onBlur={() => commitCount(item)}
                            />
                          </label>
                          <button
                            style={printGroupBtnStyle}
                            onClick={(e) => {
                              e.stopPropagation();
                              printItemGroups([item.id]);
                            }}
                          >
                            Print All
                          </button>
                          <button
                            style={addToLabelBtnStyle}
                            onClick={(e) => {
                              e.stopPropagation();
                              addItemCodesToLabelQueue(item);
                            }}
                          >
                            + Label Sheet
                          </button>
                          <span style={{ color: "#bbb", fontSize: 18, cursor: "pointer" }} onClick={() => toggleItem(item.id)}>
                            {isOpen ? "⌄" : "›"}
                          </span>
                        </div>
                      </div>
                      <div className="accordion-body" style={{ display: isOpen ? "block" : "none", paddingBottom: 14 }}>
                        <div className="qr-print-grid" style={qrGridStyle}>
                          {codes.map((entry) => (
                            <div key={entry.key} className="qr-print-card" data-key={entry.key} style={qrCardStyle}>
                              <div className="qr-brand-header" style={brandHeaderStyle}>CEPC-Lubbock</div>
                              <QRBox payload={entry.payload} color={BRAND_BLUE} />
                              <div className="qr-code-label" style={qrLabelStyle}>{entry.label}</div>
                              <button className="no-print" style={printOneBtnStyle} onClick={() => printOneCode(entry.key)}>
                                Print This Code
                              </button>
                              <button
                                className="no-print"
                                style={{ ...addToLabelBtnStyle, width: "100%" }}
                                onClick={() => addToLabelQueue([{ type: "qr", payload: entry.payload, label: entry.label }])}
                              >
                                + Add to Label Sheet
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .screen-hide-print-show { display: none; }
        .qr-all-print-only { display: none; }
        @page {
          size: ${paperSize === "tabloid" ? "11in 17in" : "letter"};
          margin: 0.4in;
        }
        @media print {
          body * { visibility: hidden; }
          .qr-page-root, .qr-page-root * { visibility: visible; }
          .qr-page-root { position: absolute; left: 0; top: 0; width: 100%; }
          /* Only force open the specific department section(s) and item(s)
             actually being printed — forcing the whole catalog open (as a
             blanket rule once did) makes the browser lay out every hidden
             QR canvas on every print action, which is what caused the lag
             on mobile. */
          .qr-dept-section:has(.accordion-item.qr-print-only-group) .dept-items-body,
          .qr-dept-section:has(.qr-print-card.qr-print-only) .dept-items-body {
            display: block !important;
          }
          .accordion-item.qr-print-only-group .accordion-body,
          .accordion-item:has(.qr-print-card.qr-print-only) .accordion-body {
            display: block !important;
          }
          .qr-print-grid {
            grid-template-columns: repeat(auto-fill, minmax(2in, 1fr)) !important;
            gap: 0.1in !important;
            margin-top: 0 !important;
            justify-items: center;
          }
          .accordion-item {
            border-bottom: none !important;
            margin-bottom: 0 !important;
          }
          .accordion-body {
            padding-bottom: 0.1in !important;
          }
          .qr-dept-section {
            margin-top: 0 !important;
          }
          .screen-hide-print-show { display: block; }
          /* Every printed QR code (any print action) comes out a
             consistent, fixed 2x2in card — same footprint as the text
             stickers below. Header and label text are sized as large as
             they can go while still leaving the canvas a reliably
             scannable ~1.25in, with room to spare over the ~1in floor. */
          .qr-print-card {
            page-break-inside: avoid;
            box-shadow: none !important;
            width: 2in !important;
            height: auto !important;
            min-height: 2in !important;
            max-width: none !important;
            box-sizing: border-box;
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            padding: 0.07in !important;
          }
          .qr-print-card canvas {
            width: auto !important;
            height: auto !important;
            max-width: 1.25in !important;
            max-height: 1.25in !important;
          }
          .qr-brand-header {
            font-size: 16px !important;
            margin-bottom: 3px !important;
          }
          .qr-code-label {
            font-size: 14px !important;
            margin-top: 4px !important;
            line-height: 1.2 !important;
          }
          .sticker-print-card {
            width: 2in !important;
            height: 2in !important;
            max-width: none !important;
            aspect-ratio: auto !important;
            margin: 0 auto;
          }
          .no-print { display: none !important; }
          .qr-page-root:has(.qr-print-card.qr-print-only) .qr-print-card:not(.qr-print-only) {
            display: none;
          }
          .qr-page-root:has(.accordion-item.qr-print-only-group) .accordion-item:not(.qr-print-only-group) {
            display: none;
          }

          /* "Print All QR Codes" — bare codes only, grouped by department,
             to maximize how many fit on each page. Everything else on
             this page (forms, search bar, per-item headers/branding/
             labels) is hidden while this mode is active. */
          body.print-all-mode .qr-page-root > *:not(.qr-all-print-only) {
            display: none !important;
          }
          body.print-all-mode .qr-all-print-only {
            display: block !important;
          }
          .qr-dept-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #555;
            margin: 10px 0 4px;
            break-after: avoid;
          }
          .qr-print-grid-dense {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(2in, 1fr));
            gap: 0.1in;
            margin-bottom: 0.1in;
            justify-items: center;
          }
        }
      `}</style>
    </div>
  );
}

const accordionItemStyle = { borderBottom: "1px solid #eee" };
const accordionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 4px",
  gap: 10,
};
const printGroupBtnStyle = {
  background: "#eef0f5",
  color: NAVY,
  border: "none",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const paperSizeRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const quickNavWrapStyle = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 8,
  marginBottom: 4,
  WebkitOverflowScrolling: "touch",
};

const quickNavChipStyle = {
  background: "#eaf3fc",
  color: "#2471a3",
  border: "1px solid #b8d9f5",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const deptSectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  marginTop: 16,
  marginBottom: 8,
  background: RIBBON_BLUE,
  borderRadius: 8,
  boxShadow: "0 2px 6px rgba(77,166,224,0.35)",
};

const deptSectionTitleStyle = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#fff",
};

const deptPrintBtnStyle = {
  background: "rgba(255,255,255,0.92)",
  color: "#0b5ea8",
  border: "none",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const countInputStyle = {
  width: 46,
  fontSize: 12,
  padding: "3px 4px",
  borderRadius: 6,
  border: "1px solid #d9dce3",
  textAlign: "center",
};

const selectedBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#eaf3fc",
  border: "1px solid #b8d9f5",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
  color: "#2471a3",
  marginBottom: 14,
};

const qrGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 32,
  marginTop: 10,
};

const qrCardStyle = {
  background: "#fff",
  borderRadius: 10,
  padding: 14,
  textAlign: "center",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px dashed #bbb",
};

const brandHeaderStyle = {
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: BRAND_BLUE,
  marginBottom: 4,
};

const qrLabelStyle = {
  fontSize: 12,
  fontWeight: 700,
  marginTop: 6,
  color: "#1a1a2e",
};

const printOneBtnStyle = {
  marginTop: 8,
  width: "100%",
  background: "#eef0f5",
  color: NAVY,
  border: "none",
  borderRadius: 6,
  padding: "6px 0",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const stickerBaseStyle = {
  background: BRAND_BLUE,
  boxShadow: "0 6px 16px rgba(0,114,206,0.4)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "26px 16px",
  aspectRatio: "1",
  width: "100%",
  maxWidth: 220,
  margin: "0 auto",
};

const stickerCircleStyle = { ...stickerBaseStyle, borderRadius: "50%" };
const stickerSquareStyle = { ...stickerBaseStyle, borderRadius: 12 };

const stickerTextStyle = {
  fontSize: 22,
  fontWeight: 900,
  color: "#fff",
  lineHeight: 1.25,
  textAlign: "center",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  wordBreak: "break-word",
};

const addToLabelBtnStyle = {
  marginTop: 8,
  background: "#e8f6ee",
  color: "#1e7a46",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const labelQueueBarStyle = {
  background: "#eaf3fc",
  border: "1px solid #b8d9f5",
  borderRadius: 10,
  padding: "12px 14px",
  marginBottom: 14,
};

const labelQueueChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#fff",
  border: "1px solid #b8d9f5",
  borderRadius: 999,
  padding: "4px 6px 4px 10px",
  fontSize: 11,
  fontWeight: 600,
  color: "#2471a3",
};

const labelQueueChipRemoveStyle = {
  background: "#eaf3fc",
  border: "none",
  borderRadius: "50%",
  width: 16,
  height: 16,
  lineHeight: "16px",
  fontSize: 12,
  color: "#2471a3",
  cursor: "pointer",
  padding: 0,
};

const printOneStickerBtnStyle = {
  background: "rgba(255,255,255,0.9)",
  color: NAVY,
  border: "none",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
};
