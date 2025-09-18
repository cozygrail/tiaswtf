export class Lexicon {
  constructor() {
    this.tokenCounts = new Map()
    this.bigramCounts = new Map()
    this.maxSize = 2000
  }

  addText(text) {
    try {
      const clean = String(text || '').toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\b0x[a-f0-9]{16,}\b/g, ' ')
        .replace(/[^a-z0-9_]+/g, ' ')
        .trim()
      if(!clean) return

      const words = clean.split(/\s+/).filter(w => w && w.length >= 3 && w.length <= 18)
      for (let i = 0; i < words.length; i++) {
        this.#bump(this.tokenCounts, words[i])
        if (i + 1 < words.length) {
          this.#bump(this.bigramCounts, words[i] + ' ' + words[i + 1])
        }
      }

      // Trim maps if too large
      if (this.tokenCounts.size > this.maxSize) this.#shrink(this.tokenCounts)
      if (this.bigramCounts.size > this.maxSize) this.#shrink(this.bigramCounts)
    } catch (_) {}
  }

  top(n = 10) {
    const topTokens = [...this.tokenCounts.entries()].sort((a,b)=> b[1]-a[1]).slice(0, n).map(([t])=> t)
    const topBigrams = [...this.bigramCounts.entries()].sort((a,b)=> b[1]-a[1]).slice(0, Math.max(4, Math.floor(n/2))).map(([t])=> t)
    return Array.from(new Set([...topTokens, ...topBigrams]))
  }

  snapshot() {
    return { tokens: this.top(16) }
  }

  #bump(map, key) {
    map.set(key, (map.get(key) || 0) + 1)
  }

  #shrink(map) {
    const arr = [...map.entries()].sort((a,b)=> b[1]-a[1]).slice(0, Math.floor(this.maxSize*0.8))
    map.clear()
    for (const [k,v] of arr) map.set(k,v)
  }
}



