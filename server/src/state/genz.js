// Seed Gen Z slang and phrases (lightweight, no scraping by default)
// You can extend via ENV GENZ_EXTRA (comma-separated), or wire your own fetch.

const BASE_SLANG = [
  'rizz','no cap','slay','bussin','vibe','goat','salty','bet','delulu','sus',
  'ate','bop','cheugy','drip','extra','ghosting','high-key','low-key','aura',
  'big yikes','cringe','periodt','tea','touch grass','fr','deadass','ngl',
  'mid','based','ratio','skibidi','gyatt','fanum tax','it slaps','snapped',
  'cook','cookin','sending','carried','locked in','low effort','copium','hopium',
  // Extra pool to boost vibe ~40%
  'yeet','simp','ick','sneaky link','its giving','left no crumbs','bsfr','fax',
  'pookie','vibe check','main character','goated','fire','gas','ate fr','touch grass again',
  // bump pool density to support ~70% more usage overall
  'no kizzy','on god','pressed','ate and left no crumbs','out of pocket','built different','sending me','chef kiss','rent free','valid','mid af','insane rizz','go crazy','be so for real','bffr'
]

export function getGenZPhrases(){
  try{
    const extra = (process.env.GENZ_EXTRA||'').split(',').map(s=>s.trim()).filter(Boolean)
    const out = Array.from(new Set([...BASE_SLANG, ...extra]))
    return out.slice(0, 96)
  }catch(_){ return BASE_SLANG }
}

export function genZify(text){
  try{
    let t = String(text||'')
    // Stronger, but still safe transformations (~70% more likely overall)
    if(Math.random()<0.45) t = t.replace(/\bvery\b/gi, Math.random()<0.5?'high-key':'low-key')
    if(Math.random()<0.41) t = t.replace(/\breally\b/gi, 'frfr')
    if(Math.random()<0.36) t = t.replace(/\bexcellent|amazing|great\b/gi, 'bussin')
    if(Math.random()<0.34) t = t.replace(/\btruth|for real\b/gi, 'no cap')
    if(Math.random()<0.32) t = t.replace(/\bcool\b/gi, 'fire')
    // Add a short Gen Z tag at the end more often
    if(Math.random()<0.55){
      const tagPool = ['no cap','fr','deadass','periodt','bet','on god','no kizzy','bffr']
      const tag = tagPool[Math.floor(Math.random()*tagPool.length)]
      if(!t.toLowerCase().endsWith(tag)) t = `${t} ${tag}`
    }
    return t
  }catch(_){ return text }
}


