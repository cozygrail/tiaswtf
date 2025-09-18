
export class Autonomy{
  constructor(streamer){
    this.streamer = streamer
    this.state = 'IDLE'
    this.trends = new Trends()
    this.enabled = process.env.AUTONOMY_ENABLE === '1'
    if(this.enabled){
      this.loop()
    }
  }
  async loop(){
    // super-light demo loop
    setInterval(async ()=>{
      if(this.state === 'IDLE' && Math.random() < 0.01){
        this.state = 'LIVE_PREP'
        try{
          await this.streamer.start()
          this.state = 'LIVE'
        } catch(e){
          this.state = 'IDLE'
        }
      } else if(this.state === 'LIVE' && (this.streamer.uptime() > 6*60*60 || Math.random() < 0.005)){
        await this.streamer.stop()
        this.state = 'COOLDOWN'
        setTimeout(()=> this.state = 'IDLE', 60*60*1000) // 1h cooldown
      }
    }, 5000)
  }
}

class Trends{
  constructor(){
    this.buckets = new Map()
    this.windowMs = 15000
  }
  add(text){
    const key = this.normalize(text)
    const now = Date.now()
    const bucket = this.buckets.get(key) || { count:0, firstAt: now, lastAt: now, lastText: text }
    bucket.count += 1
    bucket.lastAt = now
    bucket.lastText = text
    this.buckets.set(key, bucket)
  }
  pullHot(minCount=5){
    const now = Date.now()
    let best = null
    for(const [key, b] of this.buckets){
      if(now - b.lastAt > this.windowMs){ this.buckets.delete(key); continue }
      if(b.count >= minCount){ if(!best || b.count > best.count) best = { key, ...b } }
    }
    if(best){ this.buckets.delete(best.key); return best }
    return null
  }
  normalize(s){
    s = String(s||'').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    s = s.replace(/([a-z])\1{2,}/g, '$1')
    s = s.replace(/\bfarm(s|er|ing)?\b/g, 'farm')
    s = s.replace(/\brug(ged|ging)?\b/g, 'rug')
    return s
  }
}
