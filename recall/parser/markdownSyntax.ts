/** Track every marker on the line; a second opening after a close may remain unclosed. */
export function commentContinues(line: string, open: boolean): boolean {
  let offset = 0;
  while (offset < line.length) {
    const marker = line.indexOf(open ? "-->" : "<!--", offset);
    if (marker === -1) break;
    offset = marker + (open ? 3 : 4); open = !open;
  }
  return open;
}
