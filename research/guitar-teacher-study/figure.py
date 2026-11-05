"""Standalone, accessible SVG from the reconciled results; no plotting dependencies."""
import json
from pathlib import Path
from xml.sax.saxutils import escape
root=Path('public/research/guitar-teacher');d=json.loads((root/'results.json').read_text());a=d['analysis']
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="640" viewBox="0 0 1120 640" role="img" aria-labelledby="title desc">',
 '<title id="title">Valid requested demonstrations delivered by the guitar teacher</title>',
 '<desc id="desc">Two hosted trials per checkpoint on 36 GuitarSet recordings. Bars compare role highlights and progression previews. Local policy is a deterministic baseline. Counts include failures.</desc>',
 '<rect width="1120" height="640" fill="#f2f0e8"/>',
 '<style>text{font-family:Arial,sans-serif;fill:#242827}.small{font-size:16px}.label{font-size:19px}.count{font-size:18px;font-weight:bold}.muted{fill:#565e58}</style>',
 '<text x="38" y="48" font-size="27" font-weight="bold">Can the teacher deliver a playable example?</text>',
 '<text x="38" y="80" class="small muted">Valid artifacts in accepted hosted replies; local action delivery shown separately.</text>']
start,width=294,660
for x in [0,.25,.5,.75,1]:
 px=start+width*x
 parts += [f'<line x1="{px}" y1="124" x2="{px}" y2="474" stroke="#c8cbc1"/>',f'<text x="{px}" y="113" text-anchor="middle" class="small">{x*100:.0f}%</text>']
colors={'current':'#636b84','evidence-first':'#237b72','local':'#888d84'}
names={'current':'Current teacher','evidence-first':'Evidence-first','local':'Local policy'}
y=147
for arm in ['current','evidence-first','local']:
 for kind in ['role','move']:
  r=a['arms'][arm]['taskSlices'][kind];rate=r['delivered']/r['n'];label=names[arm]+' / '+('chord role' if kind=='role' else 'progression')
  parts += [f'<text x="38" y="{y+18}" class="label">{escape(label)}</text>',
            f'<rect x="{start}" y="{y}" width="{width}" height="25" fill="#e0e2d9"/>',
            f'<rect x="{start}" y="{y}" width="{width*rate:.2f}" height="25" fill="{colors[arm]}"/>',
            f'<text x="982" y="{y+18}" class="count">{r["delivered"]}/{r["n"]}</text>']
  y+=47
 y+=16
p=a['paired'];low,high=p['recordingBootstrap95']
parts += [f'<text x="38" y="520" class="label">Paired overall difference: {100*p["difference"]:.1f} points (recording-bootstrap 95% interval {100*low:.1f} to {100*high:.1f}).</text>',
 f'<text x="38" y="552" class="small">Engine control: {a["engineCeiling"]["successes"]}/{a["engineCeiling"]["n"]} valid artifacts when invoked directly. No language interpretation in this control.</text>',
 '<text x="38" y="584" class="small muted">Three performers, two progression families; shared lead sheets limit inference. No learner outcomes.</text>',
 '<text x="38" y="616" class="small muted">TabToPitch · guitar-teacher-grounding-v1 · GuitarSet 1.1.0 annotations · 5 November 2026</text>','</svg>']
(root/'comparison.svg').write_text('\n'.join(parts)+'\n')
print('Wrote comparison.svg from reconciled results')
