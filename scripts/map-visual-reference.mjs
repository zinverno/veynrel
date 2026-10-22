import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export async function exerciseReference(h) {
 const {ev,cdp,shot,pause,startVideo,stopVideo,metrics,root}=h;
 await cdp('Page.bringToFront');
 await startVideo('graph-reference');

 await ev("window.referenceLeaf=app.workspace.getLeaf('split','vertical');referenceLeaf.setViewState({type:'graph',active:true});void 0");
 await pause(2200);
 await shot('reference-side-by-side');
 const r=await ev("referenceLeaf.view.containerEl.querySelector('canvas').getBoundingClientRect().toJSON()");
 assert(r.width>100&&r.height>100);metrics.referenceCanvas=r;
 const point=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./map-reference-node.py',import.meta.url)),root+'/reference-side-by-side.png',JSON.stringify(r)],{encoding:'utf8'}));
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await pause(300);await shot('reference-hover',true);
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+25,button:'left',buttons:1});await pause(300);await shot('reference-node-drag',true);
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+25,button:'left',clickCount:1});await pause(600);await shot('reference-release');
 for(const deltaY of [-80,-80,80,80]){await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x+r.width*.48,y:r.y+r.height*.5,deltaX:0,deltaY});await pause(300);await shot('reference-wheel-'+deltaY+'-'+Date.now());}
 const x=r.x+30,y=r.y+r.height*.7;
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+80,y:y-30,button:'left',buttons:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+80,y:y-30,button:'left',clickCount:1});
 for(const key of ['ArrowLeft','+','-']){await cdp('Input.dispatchKeyEvent',{type:'keyDown',key});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key});await pause(300);}
 await shot('reference-after-pan-keyboard');
 await stopVideo();
 await ev("referenceLeaf.detach();void 0");
 fs.writeFileSync(root+'/reference-note.json',JSON.stringify({runtime:await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})"),inputs:'CDP native mouse wheel ±80, background drag, ArrowLeft/+/-; no private Graph View internals accessed',nodeDrag:'Native press/move/release on screenshot-located visible circle; screenshots/video recorded. No private renderer coordinates or code used.'},null,2));
}
