import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export async function evaluationAdapter() {
  const result=await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:`
    export * from './consolidation/relationshipContract';
    export {RELATIONSHIP_LIMITS,relationshipPrompt} from './consolidation/relationshipPrompt';
    // Keep the separately authorized historical evaluation budget; product policy is not its approval.
    export const RELATIONSHIP_OPTIONS = {maxTokens:4000,temperature:0,timeoutMs:120000};
    export {buildChatBody} from './api';`},bundle:true,write:false,platform:'node',format:'esm',
    plugins:[{name:'offline-obsidian',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:`export const getLanguage=()=>"en";export const requestUrl=()=>{throw Error("Network forbidden in offline adapter")};`}));}}]});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
