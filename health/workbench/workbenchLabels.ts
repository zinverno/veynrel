export interface ScreenBox { x:number; y:number; width:number; height:number }
export interface LabelAnchor { id:string; x:number; y:number; width:number; height:number; priority:number }
export const overlaps = (a:ScreenBox,b:ScreenBox):boolean => a.x<b.x+b.width+4 && a.x+a.width+4>b.x && a.y<b.y+b.height+3 && a.y+a.height+3>b.y;
/** Screen-space placement, independent of graph zoom. Never moves a document to fit text. */
export function placeLabels(anchors:readonly LabelAnchor[], width:number, height:number, obstacles:readonly ScreenBox[]): Map<string,ScreenBox> {
  const placed=new Map<string,ScreenBox>(),occupied=[...obstacles];
  const ordered=[...anchors].sort((a,b)=>b.priority-a.priority || a.id.localeCompare(b.id));
  for(const label of ordered){
    if(label.x<0||label.y<0||label.x>width||label.y>height)continue;
    const offsets=[[12,-label.height/2],[-label.width-12,-label.height/2],[-label.width/2,-label.height-12],[-label.width/2,12]];
    for(const [dx,dy] of offsets){
      const box={x:label.x+dx,y:label.y+dy,width:label.width,height:label.height};
      if(box.x<8||box.y<8||box.x+box.width>width-8||box.y+box.height>height-8||occupied.some(other=>overlaps(box,other)))continue;
      placed.set(label.id,box);occupied.push(box);break;
    }
  }
  return placed;
}
