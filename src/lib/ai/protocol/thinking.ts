/** Separate inline reasoning without leaking partial tags across stream chunks. */
export class ThinkSplitter {
  private buffer = '';
  private inside = false;
  push(text: string, final = false): { text: string; reasoning: string } {
    this.buffer += text;
    const result = { text: '', reasoning: '' };
    while (this.buffer) {
      const tag = this.inside ? '</think>' : '<think>';
      const at = this.buffer.indexOf(tag);
      if (at >= 0) {
        result[this.inside ? 'reasoning' : 'text'] += this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + tag.length); this.inside = !this.inside; continue;
      }
      let keep = 0;
      if (!final) for (let n = 1; n < tag.length; n++) if (this.buffer.endsWith(tag.slice(0, n))) keep = n;
      result[this.inside ? 'reasoning' : 'text'] += this.buffer.slice(0, this.buffer.length - keep);
      this.buffer = keep ? this.buffer.slice(-keep) : ''; break;
    }
    return result;
  }
}
export function splitThinking(text: string) { return new ThinkSplitter().push(text, true); }
