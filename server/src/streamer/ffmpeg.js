
// Placeholder streamer controlling ffmpeg. For MVP, we don't actually push to RTMP,
// but the structure is ready. Replace start() with a real spawn of ffmpeg.
export class Streamer{
  constructor(){
    this.live = false
    this.startedAt = null
  }
  async start(){
    if(this.live) return
    // TODO: spawn ffmpeg with your overlay source (OBS or headless capture)
    console.log('[streamer] START (stub)')
    this.live = true
    this.startedAt = Date.now()
  }
  async stop(){
    if(!this.live) return
    console.log('[streamer] STOP (stub)')
    // TODO: kill ffmpeg process
    this.live = false
    this.startedAt = null
  }
  uptime(){
    return this.startedAt ? Math.floor((Date.now()-this.startedAt)/1000) : 0
  }
}
