
import { spawn } from 'child_process'

export class FFmpegStreamer{
  constructor(){
    this.proc = null
    this.live = false
    this.startedAt = null
  }
  async start(){
    if(this.live) return
    const server = process.env.RTMP_URL
    const key = process.env.STREAM_KEY
    if(!server || !key) throw new Error('RTMP_URL/STREAM_KEY missing')

    // NOTE: This uses a test video source (color bars + sine). For real overlay capture,
    // prefer OBS mode, or replace inputs with a screen/browser capture.
    const args = [
      // video: testsrc2 1280x720 30fps
      '-f','lavfi','-i','testsrc2=size=1280x720:rate=30',
      // audio: sine wave
      '-f','lavfi','-i','sine=frequency=1000:sample_rate=44100',
      // encoding
      '-c:v','libx264','-preset','veryfast','-b:v','4500k','-maxrate','4500k','-bufsize','9000k',
      '-pix_fmt','yuv420p','-g','60',
      '-c:a','aac','-b:a','160k','-ar','44100',
      // output
      '-f','flv', `${server}/${key}`
    ]

    this.proc = spawn('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] })
    this.proc.stdout.on('data', d=>process.stdout.write(`[ffmpeg] ${d}`))
    this.proc.stderr.on('data', d=>process.stdout.write(`[ffmpeg] ${d}`))
    this.proc.on('close', code=>{
      console.log('[ffmpeg] exited', code)
      this.live = false
      this.startedAt = null
    })
    this.live = true
    this.startedAt = Date.now()
    console.log('[ffmpeg] streaming started (test source)')
  }
  async stop(){
    if(!this.live) return
    if(this.proc){
      this.proc.stdin && this.proc.stdin.end()
      this.proc.kill('SIGINT')
    }
    this.live = false
    this.startedAt = null
  }
  uptime(){
    return this.startedAt ? Math.floor((Date.now()-this.startedAt)/1000) : 0
  }
}
