import * as XLSX from "xlsx";
import { handle, requireSession } from "@/lib/auth/server";
import { FIELD_LABELS, TRANSITION_FIELDS, type TransitionField } from "@/lib/ingest/transition-workbook";

/** Header-only template for the transition workbook. It intentionally contains no data rows. */
export const GET = handle(async () => {
  await requireSession();
  const fields = Object.keys(TRANSITION_FIELDS) as TransitionField[];
  // First alias of each field is the canonical header the importer recognises.
  const headers = fields.map((f) => TRANSITION_FIELDS[f][0].replace(/\b\w/g, (c) => c.toUpperCase()));
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map(() => ({ wch: 28 }));
  const guide = XLSX.utils.aoa_to_sheet([
    ["Column", "Meaning", "Also recognised as"],
    ...fields.map((f, i) => [headers[i], FIELD_LABELS[f], TRANSITION_FIELDS[f].slice(1).join("; ")]),
    [],
    ["Scenario values", "1 = citation-to-requirement relationship unchanged, test procedure needs additional checks; 2 = relationship changes in the new version"],
    ["Sample files", "Name the file or a sheet “Sample…” to have rows flagged as sample data (not GSK-approved)."],
  ]);
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: "Version transition template", Author: "EY", Company: "EY" };
  XLSX.utils.book_append_sheet(wb, ws, "Transitions");
  XLSX.utils.book_append_sheet(wb, guide, "Column guide");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="version-transition-template.xlsx"',
    },
  });
});
