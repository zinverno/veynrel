// Opt-in diagnostics only: observe the first Community Apply boundary without writing.
import assert from 'node:assert/strict';

export async function traceCommunityApply(cdp, ev) {
  await ev(`(() => {
    const events = [], ids = new WeakMap(); let next = 0;
    const node = e => {
      if (!e) return null; if (!ids.has(e)) ids.set(e, ++next);
      const b = e.getBoundingClientRect?.();
      return { id: ids.get(e), tag: e.tagName, action: e.dataset?.studioAction,
        connected: e.isConnected, disabled: e.disabled, ownerDocument: e.ownerDocument === document,
        text: e.textContent?.slice(0, 100), rect: b && {x:b.x,y:b.y,width:b.width,height:b.height} };
    };
    const state = () => ({ state: studio.runner.state, canApply: studio.runner.canApply,
      busy: studio.operations.busy, writePlan: studio.runner.writePlan?.id,
      results: studio.runner.results, activeLeaf: app.workspace.activeLeaf?.id,
      focus: node(document.activeElement), documentFocus: document.hasFocus(),
      views: app.workspace.getLeavesOfType('veynrel-studio').map(l => ({id:l.id,route:l.view.route,
        alive:l.view.alive,selected:[...l.view.selectedRows],review:l.view.reviewId,
        error:l.view.errorEl.textContent,dialogs:[...l.view.dialogs].map(d=>({active:d.active,
          modalConnected:d.modalEl.isConnected,contentConnected:d.contentEl.isConnected,
          sameDocument:d.contentEl.ownerDocument===document,
          owner:{url:d.contentEl.ownerDocument.URL,title:d.contentEl.ownerDocument.title,
            closed:d.contentEl.ownerDocument.defaultView?.closed,
            focus:d.contentEl.ownerDocument.hasFocus(),
            frameElement:!!d.contentEl.ownerDocument.defaultView?.frameElement,
            width:d.contentEl.ownerDocument.defaultView?.innerWidth,height:d.contentEl.ownerDocument.defaultView?.innerHeight,
            confirmPresent:!!d.contentEl.ownerDocument.querySelector('[data-studio-action=confirm-apply]'),
            modalCount:d.contentEl.ownerDocument.querySelectorAll('.modal-container').length}}))})),
      modalCount: document.querySelectorAll('.modal-container').length,
      io: {reads:[...io.reads],writes:[...io.writes],browserRequests:io.browserRequests} });
    const record = (kind, data = {}) => { if(events.length<1000) events.push({t:performance.now(),phase:trace.phase,kind,...data}); };
    const trace = window.communityApplyTrace = {events,node,state,record,phase:'pointer'};
    for (const name of ['pointerdown','pointerup','mousedown','mouseup','click','focusin','focusout','keydown','keyup']) {
      for (const capture of [true,false]) document.addEventListener(name, e => record('event', {
        name,capture,trusted:e.isTrusted,key:e.key,target:node(e.target),active:node(document.activeElement),
        x:e.clientX,y:e.clientY,hit:Number.isFinite(e.clientX)?node(document.elementFromPoint(e.clientX,e.clientY)):null
      }), capture);
    }
    const button = document.querySelector('[data-studio-action=review-apply]');
    trace.button = button;
    for (const name of ['pointerdown','pointerup','mousedown','mouseup','click']) button.addEventListener(name,
      e => record('button-event',{name,trusted:e.isTrusted,target:node(e.target)}));
    new MutationObserver(records => {
      const changed = records.filter(r=>[...r.removedNodes,...r.addedNodes].some(n=>n===button||n.contains?.(button)||n.matches?.('.modal-container,.veynrel-studio-dialog')));
      if(changed.length) record('dom-change',{button:node(button),current:node(document.querySelector('[data-studio-action=review-apply]')),state:state()});
    }).observe(document.body,{childList:true,subtree:true});
    app.workspace.on('active-leaf-change',l=>record('leaf-change',{id:l?.id}));
    trace.before = state(); record('installed',{button:node(button),state:trace.before});
  })()`);
  await cdp('Debugger.enable');
  const view = "app.workspace.getLeavesOfType('veynrel-studio').find(l=>l.view.route==='workflow').view";
  async function functionPoint(expression, label, commandLine = false) {
    const {result, exceptionDetails} = await cdp('Runtime.evaluate', {expression,includeCommandLineAPI:commandLine});
    assert(!exceptionDetails && result.type === 'function', `Trace function ${label} unavailable`);
    await cdp('Debugger.setBreakpointOnFunctionCall', {objectId:result.objectId,
      condition:`(window.communityApplyTrace.record(${JSON.stringify(label)},{state:window.communityApplyTrace.state()}),false)`});
    return result.objectId;
  }
  const handler = "getEventListeners(document.querySelector('[data-studio-action=review-apply]')).click[0].listener";
  await functionPoint(handler, 'actual-button-handler', true);
  for (const method of ['run','writeDialog','dialog','render','onClose']) await functionPoint(`${view}.${method}`, `StudioView.${method}`);
  const runner = await functionPoint('studio.runner.reviewWrite','runner.reviewWrite');
  const {internalProperties} = await cdp('Runtime.getProperties',{objectId:runner});
  const location = internalProperties.find(p=>p.name==='[[FunctionLocation]]').value.value;
  const {scriptSource} = await cdp('Debugger.getScriptSource',{scriptId:location.scriptId});
  // Inspect generated source to observe StudioDialog entry/call sites without replacing methods.
  const marker = scriptSource.indexOf('"veynrel-studio-dialog"');
  assert(marker > 0);
  const onOpen = scriptSource.lastIndexOf('onOpen(){',marker) + 'onOpen(){'.length;
  const call = /this\.dialogs\.add\((\w+)\),\1\.open\(\)/u.exec(scriptSource);
  assert(call && onOpen > 8);
  for (const [offset,label] of [[onOpen,'StudioDialog.onOpen'],[call.index+call[0].indexOf(`${call[1]}.open`),'Modal.open call site']]) {
    const prefix=scriptSource.slice(0,offset), lines=prefix.split('\n');
    await cdp('Debugger.setBreakpoint',{location:{scriptId:location.scriptId,lineNumber:lines.length-1,columnNumber:lines.at(-1).length},
      condition:`(window.communityApplyTrace.record(${JSON.stringify(label)},{state:window.communityApplyTrace.state()}),false)`});
  }
  return async () => ev(`({before:communityApplyTrace.before,after:communityApplyTrace.state(),events:communityApplyTrace.events})`);
}
