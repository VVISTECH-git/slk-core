import { guardedJobRole } from "@/lib/api";
import { loadRecordPage } from "@/lib/records";

/**
 * Records made at the door that are still in production — what the receive
 * screen offers when Thaans should join a record that already exists, and
 * what "Move to a record" searches. `?status=in_pipeline|ready|shelved`,
 * `?q=` narrows by code, name, colour, motif or a Thaan code.
 *
 * Slim rows: the whole record is `GET /records/:id`. Job-role gated, like
 * the receive that uses it — the floor sorts Thaans but doesn't edit records.
 */
export const GET = guardedJobRole(
  ["Bale Custodian", "Handler", "Production Manager", "Operations Manager"],
  async (request) => {
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    const page = await loadRecordPage({
      q: params.get("q") ?? "",
      pipeline: status === "ready" || status === "shelved" ? status : "in_pipeline",
    });
    return page.rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      colour: r.colour,
      colourHex: r.colourHex,
      motif: r.motif,
      motifCategory: r.motifCategory,
      thaanCount: r.thaanCount,
      finishedCount: r.finishedCount,
      shelvedCount: r.shelvedCount,
      stage: r.stage,
      needs: r.needs,
    }));
  },
);
