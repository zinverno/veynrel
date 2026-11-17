"""Offline audit of the published corpus; no network or model invocation."""
from pathlib import Path
import json,csv,hashlib,math
from decimal import Decimal
R=Path(__file__).resolve().parent
def load(n):return [json.loads(l) for l in (R/n).read_text().splitlines()]
rows=load('results.jsonl'); answers={x['id']:x for x in load('answers.jsonl')}; annotations={x['id']:x for x in load('original-annotations.jsonl')}; bills={x['id']:x for x in load('billing-extracts.jsonl')}; reqs={x['id']:x for x in load('requests.jsonl')}
assert len(rows)==360 and len({x['id'] for x in rows})==360
assert set(answers)==set(annotations)==set(bills)==set(reqs)=={x['id'] for x in rows}
facts={'today_lost','approximation_lost','duration_as_repetitions','dinner_lost','quote_contamination','other_omission','invented_fact','unsupported_fact','omission','units_changed'}
for x in rows:
 h=hashlib.sha256(answers[x['id']]['text'].encode()).hexdigest()
 assert h==x['output_sha256']==answers[x['id']]['output_sha256']==annotations[x['id']]['output_sha256']
 assert Decimal(x['cost_usd'])==Decimal(str(bills[x['id']]['total_cost']))
checks=list(csv.DictReader((R/'cell-counts.csv').open()))
for c in checks:
 g=[x for x in rows if (x['model'],x['task'],x['variant'])==(c['model'],c['task'],c['variant'])]
 e=[x for x in g if x['http_status']==200 and x['finish_reason']=='stop' and x['has_content'] and annotations[x['id']]['status']=='ASSESSED']
 assert len(g)==int(c['attempts']) and len(e)==int(c['full'])
 for metric in ['factual_error','today_lost','dinner_lost','quote_contamination']:
  n=sum(bool(set(annotations[x['id']]['errors'])&facts) if metric=='factual_error' else metric in annotations[x['id']]['errors'] for x in e)
  assert n==int(c[metric]),(c,metric,n)
print(json.dumps({'attempts':len(rows),'full':sum(x['http_status']==200 and x['finish_reason']=='stop' and x['has_content'] for x in rows),'generated':sum(x['runner_status']=='generated' for x in rows),'expense_usd':str(sum(Decimal(x['cost_usd']) for x in rows)),'cell_tables_checked':len(checks),'one_sided_95_upper_zero_of_20':1-.05**(1/20),'human_review':'NOT_RUN'},indent=2))
