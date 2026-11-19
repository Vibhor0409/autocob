// Builds the secondary submission packet as one PDF: cover letter, visit ledger, enclosure
// index, then every enclosure appended in order. Runs in the browser, so documents never
// leave the user's machine to build it.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { AccidentCase } from "./types";
import { formatUsd, type Ledger } from "./ledger.ts";

export interface Enclosure {
  name: string;
  bytes: Uint8Array;
}

const PAGE = { w: 612, h: 792, margin: 64 };
const INK = rgb(0.09, 0.11, 0.14);
const MUTED = rgb(0.38, 0.42, 0.47);
const RULE = rgb(0.82, 0.84, 0.87);

/** Standard PDF fonts only cover WinAnsi; swap anything else so a stray character cannot fail the build. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let lineText = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = lineText ? `${lineText} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && lineText) {
        out.push(lineText);
        lineText = word;
      } else {
        lineText = next;
      }
    }
    out.push(lineText);
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  private pageNo = 0;
  private doc: PDFDocument;
  private font: PDFFont;
  private bold: PDFFont;
  private footer: string;
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, footer: string) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.footer = footer;
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.pageNo += 1;
    this.y = PAGE.h - PAGE.margin;
    this.page.drawText(safe(`${this.footer}  |  page ${this.pageNo}`), {
      x: PAGE.margin,
      y: 36,
      size: 8,
      font: this.font,
      color: MUTED,
    });
  }
  need(height: number) {
    if (this.y - height < 64) this.newPage();
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number } = {}) {
    const size = o.size ?? 10.5;
    const font = o.bold ? this.bold : this.font;
    const x = o.x ?? PAGE.margin;
    for (const l of wrap(t, font, size, PAGE.w - PAGE.margin - x)) {
      this.need(size + 5);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= size + 5;
    }
    this.y -= o.gap ?? 0;
  }
  rule(gap = 10) {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.w - PAGE.margin, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= gap;
  }
  row(cells: string[], xs: number[], o: { bold?: boolean; color?: ReturnType<typeof rgb>; rightFrom?: number } = {}) {
    const size = 9.5;
    const font = o.bold ? this.bold : this.font;
    this.need(size + 8);
    cells.forEach((cell, i) => {
      const t = safe(cell);
      const right = o.rightFrom !== undefined && i >= o.rightFrom;
      const end = i + 1 < xs.length ? xs[i + 1] - 8 : PAGE.w - PAGE.margin;
      const x = right ? end - font.widthOfTextAtSize(t, size) : xs[i];
      this.page.drawText(t, { x, y: this.y - size, size, font, color: o.color ?? INK });
    });
    this.y -= size + 8;
  }
}

export function defaultLetter(c: AccidentCase, l: Ledger, enclosureNames: string[]): string {
  const open = l.lines.filter((x) => x.status === "ready_for_secondary");
  const coverage = c.primary.coverage === "WorkersComp" ? "workers' compensation" : c.primary.coverage;
  const first = open[0]?.visit.date ?? "";
  const last = open[open.length - 1]?.visit.date ?? "";
  return [
    `Re: ${c.patient.name}, member ID ${c.secondary.memberId}. Request to process claims as primary.`,
    "",
    `${c.clinic} treated ${c.patient.name} for injuries from an accident on ${c.injuryDate}. ${c.primary.carrier} was the primary payer under ${coverage} claim ${c.primary.claimNumber}, with a limit of ${formatUsd(l.limitCents)}.`,
    "",
    `That benefit is exhausted. ${c.primary.carrier} confirmed exhaustion in writing${c.primary.exhaustionLetterOn ? ` on ${c.primary.exhaustionLetterOn}` : ""}, and the letter is enclosed with the carrier's payment record.`,
    "",
    `We ask ${c.secondary.payer} to process the ${open.length} date${open.length === 1 ? "" : "s"} of service from ${first} to ${last}, totalling ${formatUsd(l.secondaryBalanceCents)}, as primary. If any of these claims were denied pending other-payer information (CARC 22), please reconsider them with the enclosed proof.`,
    "",
    `Enclosed: ${enclosureNames.join("; ")}.`,
    "",
    "Please contact our billing office with any questions.",
  ].join("\n");
}

export async function buildPacket(args: {
  c: AccidentCase;
  ledger: Ledger;
  today: string;
  letter?: string;
  enclosures: Enclosure[];
}): Promise<{ bytes: Uint8Array; skipped: string[] }> {
  const { c, ledger, today, enclosures } = args;
  const doc = await PDFDocument.create();
  doc.setTitle(`Secondary submission - ${c.patient.name}`);
  doc.setCreator("AutoCOB");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const open = ledger.lines.filter((x) => x.status === "ready_for_secondary");
  const names = ["Visit ledger", ...enclosures.map((e) => e.name)];

  const w = new Writer(doc, font, bold, `${c.clinic}  |  ${c.patient.name}  |  ${c.secondary.memberId}`);

  // Cover letter
  w.text(c.clinic, { size: 15, bold: true, gap: 2 });
  w.text("Billing office", { color: MUTED, gap: 14 });
  w.text(today, { gap: 10 });
  w.text(`${c.secondary.payer}\nClaims department`, { gap: 14 });
  w.text(args.letter?.trim() || defaultLetter(c, ledger, names), { gap: 18 });
  w.text("Sincerely,", { gap: 4 });
  w.text(`Billing office, ${c.clinic}`, { bold: true });

  // Visit ledger
  w.newPage();
  w.text("Visit ledger", { size: 14, bold: true, gap: 4 });
  w.text(
    `${c.primary.carrier}, ${c.primary.coverage} claim ${c.primary.claimNumber}. Limit ${formatUsd(ledger.limitCents)}; paid to this clinic ${formatUsd(ledger.paidToClinicCents)}; paid to other providers ${formatUsd(ledger.paidToOthersCents)}; remaining ${formatUsd(ledger.remainingCents)}.`,
    { color: MUTED, gap: 10 },
  );
  const xs = [PAGE.margin, 150, 330, 410, 480];
  w.row(["Date of service", "Service", "Billed", "Primary paid", "Balance"], xs, { bold: true, rightFrom: 2 });
  w.rule(8);
  for (const l of ledger.lines) {
    const submitting = l.status === "ready_for_secondary";
    w.row(
      [
        l.visit.date,
        l.visit.service.length > 34 ? l.visit.service.slice(0, 33) + "." : l.visit.service,
        formatUsd(l.visit.billedCents),
        formatUsd(l.primaryPaidCents),
        formatUsd(l.balanceCents),
      ],
      xs,
      { rightFrom: 2, color: submitting ? INK : MUTED, bold: submitting },
    );
  }
  w.rule(8);
  w.row([`Submitted with this packet: ${open.length} visits`, formatUsd(ledger.secondaryBalanceCents)], [PAGE.margin, 330], {
    bold: true,
    rightFrom: 1,
  });

  // Enclosure index
  w.y -= 18;
  w.text("Enclosures", { size: 14, bold: true, gap: 6 });
  names.forEach((n, i) => w.text(`${i + 1}. ${n}`));

  // Append enclosures. A file that is not a readable PDF is listed, not silently dropped.
  const skipped: string[] = [];
  for (const e of enclosures) {
    try {
      const src = await PDFDocument.load(e.bytes, { ignoreEncryption: true });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    } catch {
      skipped.push(e.name);
    }
  }
  return { bytes: await doc.save(), skipped };
}
