export function authorize(authorization:unknown,data:{corpusSha256:string;promptSha256:string},profileBytes:Buffer,now?:number):Array<{id:string;model:string}>;
export function runLive(options:{optIn:boolean;authorization:unknown;profileBytes:Buffer;runRoot:string;getKey:()=>unknown;
  transport?:(url:string,options:RequestInit)=>Promise<Response>}):Promise<{runDir:string;requests:number}>;
