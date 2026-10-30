// Opt-in checks on the existing native diagram route, with the original CSS as an oracle.
import fs from 'node:fs';
import assert from 'node:assert/strict';

export function reviewWarningsChecks({ev, cdp, wait, click, locale, shot, report}) {
  const baseline = fs.readFileSync(process.env.VEYNREL_REVIEW_BASE_CSS, 'utf8');
  report.reviewWarnings = [];
  const key = async (key, code, n) => {
    for (const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent', {type,key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n});
  };
  const pointer = async selector => {
    await cdp('Page.bringToFront'); await wait('document.hasFocus()');
    const p = await ev(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(r));const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    for (const type of ['mouseMoved','mousePressed','mouseReleased']) await cdp('Input.dispatchMouseEvent',{type,...p,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
  };
  const sample = async name => {
    const result = await ev(`(()=>{
      const sheet=[...document.querySelectorAll('style')].find(e=>e.textContent.includes('.veynrel-studio-diagram-stage'));
      if(!sheet)throw Error('Missing plugin stylesheet');
      const nodes=[...document.querySelectorAll('.veynrel-studio-mode,.veynrel-studio-mode input,.veynrel-studio-diagram-stage,.veynrel-studio-diagram-stage > *')];
      const snap=()=>nodes.map(e=>{const s=getComputedStyle(e);return Object.fromEntries([...s].filter(k=>!k.startsWith('--')).map(k=>[k,s.getPropertyValue(k)]))});
      const current=sheet.textContent,after=snap();let before;
      try{sheet.textContent=${JSON.stringify(baseline)};before=snap()}finally{sheet.textContent=current}
      const differences=[];for(let i=0;i<nodes.length;i++)for(const k of Object.keys(after[i]))if(after[i][k]!==before[i][k])differences.push({element:nodes[i].className,property:k,before:before[i][k],after:after[i][k]});
      const modes=[...document.querySelectorAll('.veynrel-studio-mode')].map(e=>({value:e.querySelector('input').value,checked:e.querySelector('input').checked,styled:e.classList.contains('is-selected')}));
      const root=document.querySelector('.veynrel-studio'),stage=root.querySelector('.veynrel-studio-diagram-stage'),details=stage?.querySelector(':scope > details');
      return {name:${JSON.stringify(name)},differences,modes,theme:[...document.body.classList].filter(c=>c==='theme-light'||c==='theme-dark'),background:getComputedStyle(root).backgroundColor,text:getComputedStyle(root).color,width:innerWidth,overflow:root.scrollWidth-root.clientWidth,stage:stage?{open:details.open,styled:stage.classList.contains('is-inspector-open'),columns:getComputedStyle(stage).gridTemplateColumns,container:root.clientWidth}:null};
    })()`);
    report.reviewWarnings.push(result);
    assert.deepEqual(result.differences, [], name+' original CSS equivalence');
    assert(result.overflow<=1, name+' no overflow');
    if(result.modes.length){assert.equal(result.modes.length,2);assert.equal(result.modes.filter(x=>x.checked).length,1);assert(result.modes.every(x=>x.checked===x.styled),name+' checked/style');}
    if(result.stage){assert.equal(result.stage.open,result.stage.styled);assert.equal(result.stage.columns.split(' ').length,result.stage.open&&result.stage.container>900?2:1,name+' columns');}
    return result;
  };
  const matrix = async run => {
    await ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
    for(const lang of ['en','ru']) {
      await locale(lang);
      let previous;
      for(const theme of ['dark','light']) {
        await ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);
        await wait(`document.body.classList.contains('theme-${theme}')&&!document.body.classList.contains('theme-${theme==='dark'?'light':'dark'}')`);
        for(const width of [1300,720,390]) {
          await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
          await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
          const r=await run(`${lang}-${theme}-${width}`);
          assert.deepEqual(r.theme,[`theme-${theme}`]);
          if(previous&&previous.theme!==theme){assert.notEqual(r.background,previous.background);assert.notEqual(r.text,previous.text);}
          previous={...r,theme};
        }
      }
    }
    await cdp('Emulation.clearDeviceMetricsOverride');await ev("app.changeTheme('obsidian');void 0");await locale('en');
  };
  return {
    async modes() {
      await matrix(async name=>{
        await pointer('.veynrel-studio-mode input[value=structure]');
        await sample(name+' initial');
        await pointer('.veynrel-studio-mode input[value=flowchart]');
        await wait("document.querySelector('.veynrel-studio-mode input[value=flowchart]').checked");
        await sample(name+' pointer');
        await key('ArrowLeft','ArrowLeft',37);
        await wait("document.querySelector('.veynrel-studio-mode input[value=structure]').checked");
        await sample(name+' keyboard');
        await click('library');await click('diagram');
        await sample(name+' return');
        await click('diagram-refresh');
        const r=await sample(name+' rerender');assert.equal(r.modes.find(m=>m.checked).value,'structure');
        if(name==='en-dark-1300'||name==='ru-light-390')await shot('warning-modes-'+name);
        return r;
      });
      report.checks.push('Native radio pointer/keyboard/draft/rerender matrix and original CSS equivalence');
    },
    async inspector() {
      const frozen=await ev('JSON.stringify(d.proposal)'),calls=report.requests.length;
      await matrix(async name=>{
        await ev("window.warningPreview=document.querySelector('.veynrel-diagram-preview');window.warningSvg=warningPreview.querySelector('svg');void 0");
        await sample(name+' closed');
        await pointer('.veynrel-studio-diagram-stage > details > summary');
        await wait("document.querySelector('.veynrel-studio-diagram-stage').classList.contains('is-inspector-open')");
        const open=await sample(name+' open');
        if(name==='en-dark-1300'||name==='ru-light-390')await shot('warning-inspector-'+name);
        await pointer('.veynrel-studio-diagram-stage > details > summary');
        await wait("!document.querySelector('.veynrel-studio-diagram-stage').classList.contains('is-inspector-open')");
        await sample(name+' closed again');
        assert(await ev("document.querySelector('.veynrel-diagram-preview')===warningPreview&&warningPreview.querySelector('svg')===warningSvg"),'same preview DOM across toggle');
        return open;
      });
      assert.equal(await ev('JSON.stringify(d.proposal)'),frozen);assert.equal(report.requests.length,calls);
      report.checks.push('Native inspector closed/open/closed matrix preserves frozen Review, canvas DOM and request count');
    },
  };
}
