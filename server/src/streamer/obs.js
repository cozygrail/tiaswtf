
import OBSWebSocket from 'obs-websocket-js'

export class OBSStreamer {
  constructor(){
    this.obs = new OBSWebSocket()
    this.live = false
    this.startedAt = null
  }
  async connect(){
    const url = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455'
    const password = process.env.OBS_WS_PASSWORD || ''
    await this.obs.connect(url, password)
  }
  async start(){
    if(this.live) return
    if(!this.obs._identified){
      await this.connect()
    }
    const server = process.env.RTMP_URL
    const key = process.env.STREAM_KEY
    if(!server || !key) throw new Error('RTMP_URL/STREAM_KEY missing')
    // Set custom RTMP settings
    await this.obs.call('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: {
        server: server,
        key: key,
        bwtest: false
      }
    })
    // Start stream
    await this.obs.call('StartStream')
    this.live = true
    this.startedAt = Date.now()
    console.log('[obs] streaming started')
  }
  async stop(){
    if(!this.live) return
    await this.obs.call('StopStream')
    this.live = false
    this.startedAt = null
    console.log('[obs] streaming stopped')
  }
  uptime(){
    return this.startedAt ? Math.floor((Date.now()-this.startedAt)/1000) : 0
  }
}
