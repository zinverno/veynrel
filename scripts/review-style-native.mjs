// Optional compatibility probe on the real native route; never changes vault data.
import fs from 'node:fs';
import assert from 'node:assert/strict';

export function styleComparison(ev, baselineFile, root) {
  const baseline = fs.readFileSync(baselineFile, 'utf8'), results = [];
  return async name => {
    const result = await ev(`(() => {
      const sheet = [...document.querySelectorAll('style')].find(e => e.textContent.includes('.veynrel-workbench-grid'));
      if (!sheet) throw Error('Plugin stylesheet not found');
      const current = sheet.textContent, baseline = ${JSON.stringify(baseline)};
      const selectors = [
        '.veynrel-shell', '.veynrel-shell-main', '.veynrel-shell-main > div', '.veynrel-review',
        '.veynrel-review-detail', '.veynrel-review-map-host', '.veynrel-workbench', '.veynrel-workbench-browser',
        '.veynrel-workbench-grid', '.veynrel-workbench-map-pane', '.veynrel-workbench-selection',
        '.ai-pair-inspector', '.ai-planner-controls', '.ai-review-choice', '.ai-review-choice *'
      ];
      const nodes = [...document.querySelectorAll(selectors.join(','))];
      const snapshot = () => nodes.map(el => {
        const style = getComputedStyle(el);
        return Object.fromEntries([...style].filter(p => !p.startsWith('--')).map(p => [p, style.getPropertyValue(p)]));
      });
      const next = snapshot(); let previous;
      try { sheet.textContent = baseline; previous = snapshot(); }
      finally { sheet.textContent = current; }
      const differences = [];
      for (let i=0;i<nodes.length;i++) for (const key of Object.keys(next[i])) {
        if (next[i][key] !== previous[i][key]) differences.push({element: nodes[i].className, property:key, before:previous[i][key], after:next[i][key]});
      }
      const selected = [...document.querySelectorAll('.ai-review-choice')].every(e =>
        (e.getAttribute('data-selected') === 'true') === e.querySelector('input').checked);
      return {nodes:nodes.length, differences, selected};
    })()`);
    results.push({name, ...result});
    fs.writeFileSync(root+'/style-equivalence.json', JSON.stringify(results,null,2));
    assert(result.selected, name+' radio state');
    assert.deepEqual(result.differences, [], name+' computed styles match original CSS');
  };
}
