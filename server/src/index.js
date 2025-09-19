
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { generateReply } from './bot/llmStub.js'
import { shouldBlock } from './bot/moderation.js'
import { Autonomy } from './state/autonomy.js'
import { Lexicon } from './state/lexicon.js'
import { FFmpegStreamer } from './streamer/ffmpegReal.js'
import { OBSStreamer } from './streamer/obs.js'
import pack from './bot/sidekickPack.json' with { type: 'json' }
import { PumpfunChat } from './integrations/pumpfunChat.js'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000
// Static helper to serve the original Sidekick dashboard screenshot to the overlay
try{
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const sidekickPng = path.resolve(__dirname, '..', '..', '2b1c8367-38b3-48bb-aa6e-36c7f50b0a0f_xlarge.png')
  app.get('/skin/sidekick', (req, res)=>{
    try{ res.sendFile(sidekickPng) }catch(e){ res.status(404).end() }
  })
}catch(_){ }


// REST endpoints for manual start/stop (MVP)
const mode = process.env.STREAM_MODE || 'obs'  // 'obs' | 'ffmpeg'
const streamer = (mode === 'ffmpeg') ? new FFmpegStreamer() : new OBSStreamer()
const autonomy = new Autonomy(streamer)
const lexicon = new Lexicon()
const tokenMeta = {
  symbol: process.env.TOKEN_SYMBOL || '$TIAS',
  name: process.env.TOKEN_NAME || 'TIAS',
  platform: process.env.TOKEN_PLATFORM || 'pump.fun',
  tagline: process.env.TOKEN_TAGLINE || 'Trapped In A Sidekick'
}
let manualFocusAt = 0
let lastManualReply = 0

app.post('/api/stream/start', async (_req, res) => {
  await streamer.start()
  res.json({ ok: true })
})
app.post('/api/stream/stop', async (_req, res) => {
  await streamer.stop()
  res.json({ ok: true })
})

app.get('/health', (_req, res) => res.json({ ok:true, state: autonomy.state, live: streamer.live }))

// Media search (Pixabay animations)
app.get('/api/media/search', async (req, res) => {
  try{
    const q = String(req.query.q || '').trim()
    if(!q){ return res.status(400).json({ ok:false, error: 'missing q' }) }
    const apiKey = process.env.PIXABAY_API_KEY || '52309810-ab7e3a6e11f35b650fb0a69c5'
    const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(q)}&video_type=animation&safesearch=true&order=popular&per_page=5`
    const r = await fetch(url)
    if(!r.ok){ return res.status(502).json({ ok:false, error:'pixabay' }) }
    const data = await r.json()
    const hit = (data?.hits||[])[0]
    if(!hit){ return res.status(404).json({ ok:false, error:'no_results' }) }
    const vids = hit.videos || {}
    const candidate = vids.tiny?.url || vids.small?.url || vids.medium?.url || vids.large?.url
    if(!candidate){ return res.status(404).json({ ok:false, error:'no_video' }) }
    return res.json({ ok:true, url: candidate, type:'video' })
  }catch(e){ return res.status(500).json({ ok:false, error:'server' }) }
})

const server = createServer(app)

// ---- WebSocket hubs ----
const wssChat = new WebSocketServer({ noServer: true })
const wssOverlay = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wssChat.handleUpgrade(req, socket, head, (ws) => wssChat.emit('connection', ws, req))
  } else if (req.url === '/overlay') {
    wssOverlay.handleUpgrade(req, socket, head, (ws) => wssOverlay.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

// Central sanitize to nuke any trailing 'undefined' artifacts
const sanitize = (s)=> String(s ?? '').replace(/(?:[\s\W]*undefined[\s\W]*)+$/i, '').trimEnd()

// Extract color requests from chat text (hex or common names)
const COLOR_MAP = {
  red:'#ff2d2d', blue:'#2d7dff', green:'#2dff7d', yellow:'#ffee33', orange:'#ff8c2d',
  purple:'#b266ff', pink:'#ff5fa3', cyan:'#15e0ff', magenta:'#ff33cc', white:'#ffffff',
  black:'#000000', lime:'#a6ff00', teal:'#00d1b2', gold:'#ffd700'
}
function parseRequestedColor(text){
  try{
    const t = String(text||'').toLowerCase()
    const hex = t.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i)
    if(hex) return '#' + hex[1]
    const name = t.match(/\b(color|font|text)\s*(color)?\s*(to|is|=)?\s*(red|blue|green|yellow|orange|purple|pink|cyan|magenta|white|black|lime|teal|gold)\b/i)
    if(name){ const key = name[4].toLowerCase(); return COLOR_MAP[key] || key }
    const make = t.match(/\b(make|set)\s*(it|text|font)?\s*(to)?\s*(red|blue|green|yellow|orange|purple|pink|cyan|magenta|white|black|lime|teal|gold)\b/i)
    if(make){ const key = make[4].toLowerCase(); return COLOR_MAP[key] || key }
    if(/\b(reset\s*(color|text|font))\b/.test(t)) return '#00ff99'
  }catch(_){ }
  return null
}

function broadcastOverlay(payload){
  const data = JSON.stringify({
    type:'overlay_update',
    caption: (()=>{ const c = sanitize(payload.caption); return /\bMODE\b|EDGE MODE/i.test(c) ? '' : c })(),
    face: sanitize(payload.face),
    mediaUrl: payload.mediaUrl || null,
    mediaType: payload.mediaType || null,
    fullscreen: !!payload.fullscreen,
    sfx: payload.sfx || null,
    say: sanitize(payload.say),
    typeText: sanitize(payload.typeText),
    color: payload.color
  })
  wssOverlay.clients.forEach(c=> c.readyState===1 && c.send(data))
}

// Log overlay connections and prime initial state so the face shows immediately
wssOverlay.on('connection', (ws)=>{
  try { console.log('[overlay] client connected') } catch(e){}
  try { ws.send(JSON.stringify({ type:'overlay_update', face: '._.', caption: '' })) } catch(e){}
})

// Pump.fun chat relay (enable with env PUMPFUN_URL)
let pump = null
let lastPumpfunReply = 0
let lastPumpfunMsgAt = 0
let recentMessages = [] // Track message volume for smart rate limiting
let sentimentWindow = [] // [{t, user, text}]
function isPumpUiNoise(message){
  try{
    const m = String(message||'')
    const patterns = [
      /^(LIVE|request|Reply|ago|24hr|ATH|Vol|Price|Market Cap|Trade|Display|Hide|USD|SOL|Volume|Pump|Open|High|Low|Close|BARS|EDGE)$/i,
      /^\d+[hHdDmM](\s|$)/, /^[\d:]+\s*(UTC|AM|PM)?$/i, /UTC|log|auto/i,
      /^[\d.,\-+%() \$KMBOHLC]+$/, /^(O|H|L|C)\s*[\d.]+[MK]?$/,
      /^\$[\d.,]+[MK]?/, /^[\-+]?[\d.,]+%/, /^[\d.,]+[MK]\s/,
      /(beginning of chat|Read-only mode|Log in to|Type a message|Liquidity pool)/i,
      /^(GJPfaV|AUSBAGWORK)$/i, /^[A-Z]$/, /^\d+$/
    ]
    if(patterns.some(r=> r.test(m))) return true
    if(!/[a-zA-Z]{2,}/.test(m)) return true
  }catch(_){ }
  return false
}
if(process.env.PUMPFUN_URL){
  pump = new PumpfunChat({ tokenUrl: process.env.PUMPFUN_URL, onMessage: async ({user, text}) => {
    try{
      console.log('[pumpfun] message:', user, ':', text)
      lastPumpfunMsgAt = Date.now()
      // Drop any UI/system noise that slipped through or fake usernames
      if(user === 'chat' || isPumpUiNoise(text)){
        console.log('[pumpfun] filtered UI/system noise')
        return
      }
      
      // Send to chat clients first
      const payload = JSON.stringify({ type:'user_message', user, text })
      wssChat.clients.forEach(c=> c.readyState===1 && c.send(payload))
      
      // Learn language and track message volume for smart rate limiting
      const now = Date.now()
      try{ lexicon.addText(text) }catch(e){}
      recentMessages.push(now)
      recentMessages = recentMessages.filter(time => now - time < 60000) // Keep last 60 seconds
      sentimentWindow.push({ t: now, user, text })
      sentimentWindow = sentimentWindow.filter(e => now - e.t < 20000) // 20s window for crowd mood
      
      const messagesPerMinute = recentMessages.length
      let rateLimitMs = 6000 // Default 6 seconds (more responsive)
      
      // If manual chat was active very recently, pause Pump.fun replies briefly
      if(now - manualFocusAt < 6000){
        console.log('[pumpfun] paused due to manual focus')
        return
      }

      // Adjust rate limiting based on chat volume
      if(messagesPerMinute > 30) {
        rateLimitMs = 10000 // 10s at very high volume
      } else if(messagesPerMinute > 15) {
        rateLimitMs = 8000 // 8s at medium volume
      }
      
      // Smart message skipping - skip some messages during high volume
      if(messagesPerMinute > 35 && Math.random() < 0.35) {
        console.log('[pumpfun] high volume, randomly skipping message')
        return
      }
      
      if(now - lastPumpfunReply < rateLimitMs) {
        console.log('[pumpfun] rate limited, skipping bot response')
        return
      }
      
      // Process through bot logic (same as manual chat messages)
      lastActivityAt = Date.now()
      const cleanText = (text||'').toString().slice(0, 500)
      try{ autonomy.trends.add(cleanText) }catch(e){}
      
      if(shouldBlock(cleanText)){
        const safe = "Nope — entertainment only. Try a meme instead."
        wssChat.clients.forEach(c=> c.readyState===1 && c.send(JSON.stringify({ type:'bot_message', text: safe })))
        broadcastOverlay({ caption: 'NOPE', face: 'ಠ_ಠ' })
        lastPumpfunReply = now
        return
      }
      
      // Generate bot reply with volume awareness + lexicon context + crowd mood
      let reply
      const crowdText = (()=>{
        try{
          const joined = sentimentWindow.map(e=> e.text).join(' | ').toLowerCase()
          const angry = (joined.match(/fuck|angry|pissed|mad|wtf|retard|dump|scam|rug|jeet|hate|sucks|shit/g)||[]).length
          const hype = (joined.match(/lfg|pump|moon|send|based|let'?s go|ape/g)||[]).length
          const bearish = (joined.match(/dump|down|red|bear|sold|sell/g)||[]).length
          if(angry >= 6) return 'crowd_mood: angry'
          if(hype >= 6) return 'crowd_mood: hype'
          if(bearish >= 6) return 'crowd_mood: bearish'
        }catch(_){ }
        return ''
      })()
      if(messagesPerMinute > 20) {
        // High volume - use meta-commentary about the chaos
        const metaResponses = [
          "yall need to slow tf down, i can't keep up",
          "bros chillll, my circuits are overheating",
          "anons going full degen mode rn",
          "chat moving faster than my consciousness can process",
          "this is peak crypto chaos energy",
          "someone hit the brakes on this conversation"
        ]
        reply = { text: metaResponses[Math.floor(Math.random() * metaResponses.length)] + ' — keep ' + tokenMeta.symbol + ' vibes clean' }
      } else if(messagesPerMinute > 10) {
        // Medium volume - shorter responses
        reply = await generateReply((crowdText? crowdText+"\n" : '') + cleanText + " (keep it short)", { lexicon: lexicon.snapshot(), tokenMeta })
      } else {
        // Normal volume - full responses
        reply = await generateReply((crowdText? crowdText+"\n" : '') + cleanText, { lexicon: lexicon.snapshot(), tokenMeta })
      }
      
      const safeText = sanitize(reply.text || '')
      const mention = user ? ('@' + String(user).trim().split(/\s+/)[0]) : ''
      const addressed = mention && !/^\s*@/i.test(safeText) ? `${mention} ${safeText}` : safeText
      console.log('[pumpfun] bot reply:', addressed, `(${messagesPerMinute} msgs/min)`)
      
      // Send bot response to chat clients
      wssChat.clients.forEach(c=> c.readyState===1 && c.send(JSON.stringify({ type:'bot_message', text: addressed })))
      
      // Update overlay
      const overlayPayload = {
        caption: reply.overlay || '',
        face: reply.face || '(•‿•)',
        // Defer media until after text by sending no media with typeText
        mediaUrl: null,
        mediaType: null,
        fullscreen: false,
        sfx: reply.sfx || null,
        say: reply.say || null,
        typeText: addressed,
        color: parseRequestedColor(cleanText) || undefined
      }
      console.log('[pumpfun] overlay tx:', JSON.stringify(overlayPayload))
      broadcastOverlay(overlayPayload)
      
      // If reply had media, send it after estimated typing duration so it never interrupts typing
      if(reply.mediaUrl){
        // Always attempt to show media; slightly sooner delay to help GIFs feel snappy
        const estMs = Math.max(1000, Math.min(14000, 45 * addressed.length + 900))
        setTimeout(()=>{
          try{ broadcastOverlay({ caption:'', face: reply.face || '(•‿•)', mediaUrl: reply.mediaUrl, mediaType: reply.mediaType||null, fullscreen: !!reply.fullscreen, sfx:null, say:null, typeText:null }) }catch(e){}
        }, estMs)
      }
      // Fallback: if no media selected but keywords strongly suggest media, inject a pack GIF
      else {
        try{
          const t = addressed.toLowerCase()
          let url = null, type = null
          if(/volcano|explode|eruption|lava/.test(t)){ url = pack.memes.volcano; type = 'gif' }
          else if(/bomb|explode|detonate/.test(t)){ url = pack.memes.bomb; type = 'gif' }
          else if(/matrix|terminal|hacker/.test(t)){ url = pack.memes.matrix; type = 'gif' }
          else if(/rocket|moon/.test(t)){ url = pack.memes.rocket; type = 'gif' }
          if(url){
            const estMs2 = Math.max(900, Math.min(12000, 42 * addressed.length + 800))
            setTimeout(()=>{
              try{ broadcastOverlay({ caption:'', face: reply.face || '(•‿•)', mediaUrl: url, mediaType: type, fullscreen: true, sfx:null, say:null, typeText:null }) }catch(e){}
            }, estMs2)
          }
        }catch(_){ }
      }
      
      lastPumpfunReply = now
      
    }catch(e){ console.error('[pumpfun] error processing message:', e) }
  }})
  pump.connect().catch(console.error)
  // Watchdog: if no Pump.fun messages for 45s, reconnect
  setInterval(async ()=>{
    try{
      const idle = Date.now() - lastPumpfunMsgAt
      if(idle > 45000){
        console.log('[pumpfun] watchdog: reconnecting (idle', idle,'ms)')
        try{ await pump.close() }catch(e){}
        try{ await pump.connect() }catch(e){}
        lastPumpfunMsgAt = Date.now()
      }
    }catch(e){}
  }, 10000)
}

wssChat.on('connection', (ws)=>{
  try { console.log('[chat] client connected') } catch(e){}
  ws.isAlive = true
  ws.on('pong', ()=>{ ws.isAlive = true })
  ws.on('message', async (raw)=>{
    try{
      const rawText = raw.toString()
      console.log('[chat] rx:', rawText)
      const msg = JSON.parse(rawText)
      if(msg.type === 'user_message'){
        // Manual focus: prioritize manual chat and rate-limit separately
        manualFocusAt = Date.now()
        lastActivityAt = Date.now()
        const text = (msg.text||'').toString().slice(0, 500)
        try{ autonomy.trends.add(text) }catch(e){}
        if(shouldBlock(text)){
          const safe = "Nope — entertainment only. Try a meme instead."
          ws.send(JSON.stringify({ type:'bot_message', text: safe }))
          broadcastOverlay({ caption: 'NOPE', face: 'ಠ_ಠ' })
          return
        }
        // generate a spicy reply (shorter and text-only overlay for manual)
        const reply = await generateReply(text, { lexicon: lexicon.snapshot?.(), tokenMeta })
        const safeText = sanitize(reply.text)
        console.log('[chat] reply:', safeText)
        // Broadcast to all chat clients
        wssChat.clients.forEach(c=> c.readyState===1 && c.send(JSON.stringify({ type:'bot_message', text: safeText })))
        // send overlay updates (text first; media deferred until after typing)
        const payload = { caption: '', face: reply.face || '(•‿•)', mediaUrl: null, mediaType: null, fullscreen: false, sfx: null, say: null, typeText: safeText }
        console.log('[overlay] tx:', JSON.stringify(payload))
        broadcastOverlay(payload)
        // If reply includes media, schedule it to render after typing completes
        if(reply.mediaUrl){
          const estMs = Math.max(1000, Math.min(14000, 45 * safeText.length + 900))
          setTimeout(()=>{
            try{ broadcastOverlay({ caption:'', face: reply.face || '(•‿•)', mediaUrl: reply.mediaUrl, mediaType: reply.mediaType||null, fullscreen: !!reply.fullscreen, sfx:null, say:null, typeText:null }) }catch(e){}
          }, estMs)
        }
        lastManualReply = Date.now()
      }
    }catch(e){}
  })
})

// ---- Idle chatter loop (30s inactivity) ----
let lastActivityAt = Date.now()
setInterval(async ()=>{
  try{
    // If there is a hot trend AND pump fun is quiet, address it with priority
    const hot = autonomy.trends.pullHot(6)
    const pumpQuietMs = Date.now() - lastPumpfunMsgAt
    if(hot && pumpQuietMs > 15000){
      const topic = hot.key
      const prompt = `Chat is spamming about: "${topic}". Respond to the crowd directly, concise and assertive.`
      const reply = await generateReply(prompt)
      const safeText = sanitize(reply.text || '')
      wssChat.clients.forEach(c=> c.readyState===1 && c.send(JSON.stringify({ type:'bot_message', text: safeText })))
      broadcastOverlay({ caption: reply.overlay || '', face: reply.face || '(•‿•)', mediaUrl: null, mediaType: null, fullscreen: false, sfx: reply.sfx || null, say: reply.say || null, typeText: reply.typeText || reply.text || safeText })
      return
    }
    const idleMs = Date.now() - lastActivityAt
    // Very aggressive idle threshold for constant snarky engagement
    // Extend idle threshold when pump fun is active
    const minIdle = (Date.now() - lastPumpfunMsgAt < 15000) ? 25000 : 10000
    if(idleMs < minIdle) return
    lastActivityAt = Date.now()
    const prompts = pack.idlePrompts || ['Thinking…']
    const prompt = prompts[Math.floor(Math.random()*prompts.length)] || 'Thinking…'
    const reply = await generateReply(prompt)
    // For idle rambling: do not include media, just text/face
    const payload = { caption: reply.overlay || '', face: reply.face || '(•‿•)', mediaUrl: null, mediaType: null, fullscreen: false, sfx: null, say: reply.say || null, typeText: reply.typeText || reply.text || prompt }
    const safeText = sanitize(reply.text || prompt)
    wssChat.clients.forEach(c=> c.readyState===1 && c.send(JSON.stringify({ type:'bot_message', text: safeText, idle: true })))
    broadcastOverlay(payload)
  }catch(e){}
}, 5000)

server.listen(PORT, '0.0.0.0', ()=> console.log('Server listening on', PORT))
