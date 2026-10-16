import { t as tr } from "../i18n";
import { proposalDiff } from "../proposals/diff";
function button(parent: HTMLElement, key: string, action: () => void): HTMLButtonElement {
  const el = parent.createEl("button", { text: tr(`@planner.${key}`), attr: { type: "button", "data-planner-action": key } });
  el.addEventListener("click", action); return el;
}
export function renderPlanDiff(root: HTMLElement, before: string, after: string): void {
    const panel = root.createDiv({ cls: "ai-proposal-diff-panel" });
    const legend = panel.createDiv({ cls: "ai-proposal-diff-legend" });
    legend.createSpan({ text: tr("@planner.diff"), cls: "ai-proposal-diff-title" });
    let oldLine = 0, newLine = 0, page = 0;
    const lines = proposalDiff(before, after).map(line => ({ ...line,
      oldLine: line.kind === "added" ? "" : String(++oldLine), newLine: line.kind === "removed" ? "" : String(++newLine) }));
    const status = legend.createDiv({ attr: { role: "status", "aria-live": "polite" } });
    const diff = panel.createDiv({ cls: "ai-proposal-diff", attr: { tabindex: "0", "aria-label": tr("@planner.diff") } });
    const controls = panel.createDiv({ cls: "ai-proposal-pagination" });
    const previous = button(controls, "previous", () => { page--; render(); });
    const next = button(controls, "next", () => { page++; render(); });
    const render = () => {
      diff.empty(); const start = page * 200, end = Math.min(start + 200, lines.length);
      status.setText(tr("@planner.diffPage", { start: start + 1, end, total: lines.length }));
      for (const line of lines.slice(start, end)) {
        const row = diff.createDiv({ cls: `ai-proposal-diff-line ai-proposal-${line.kind}` });
        const numbers = row.createDiv({ cls: "ai-proposal-line-numbers", attr: { "aria-hidden": "true" } });
        numbers.createSpan({ text: line.oldLine }); numbers.createSpan({ text: line.newLine });
        row.createEl("pre", { cls: "ai-proposal-line-text", text: `${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} ${line.text}` });
      }
      previous.disabled = page === 0; next.disabled = end === lines.length;
    };
    render();
  }
