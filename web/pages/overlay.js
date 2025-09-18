
import React, { useEffect, useRef, useState } from 'react'

export default function Overlay(){
  const [caption, setCaption] = useState('')
  const [mediaUrl, setMediaUrl] = useState(null)
  const [mediaType, setMediaType] = useState(null) // 'image' | 'gif' | 'video'
  const [fullscreen, setFullscreen] = useState(false)
  const [face, setFace] = useState('._.')
  const [blinkOn, setBlinkOn] = useState(false)
  const [jitter, setJitter] = useState({ x:0, y:0 })
  const [glitch, setGlitch] = useState('')
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const audioRef = useRef(null)
  const wsRef = useRef(null)
  const lastRxRef = useRef(Date.now())
  const synthRef = useRef(null)
  const mouthTimerRef = useRef(null)
  const revertTimerRef = useRef(null)
  const textBoxRef = useRef(null)
  const typedRef = useRef('')
  const mediaDisplayTimerRef = useRef(null)
  const typingTimersRef = useRef({ step: null, failsafe: null })
  const pendingTypeTextRef = useRef('')
  const mediaWaitTimerRef = useRef(null)
  const videoRef = useRef(null)
  const [awaitingMediaEnd, setAwaitingMediaEnd] = useState(false)

  // Aggressive overlay removal for this page
  useEffect(() => {
    const removeOverlays = () => {
      const selectors = [
        '[data-nextjs-toast]', '[data-nextjs-dock]', '[data-nextjs-dialog-overlay]',
        '[data-nextjs-router-reloader-bar]', '[data-nextjs-build-indicator]',
        '[data-nextjs-error-overlay]', '[data-nextjs-dev-overlay]', '[data-turbo-indicator]',
        'div[style*="position: fixed"][style*="z-index"]'
      ]
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove())
      })
    }
    
    const interval = setInterval(removeOverlays, 100)
    return () => clearInterval(interval)
  }, [])

  // WebSocket with simple reconnect
  useEffect(()=>{
    let closed = false
    let attempts = 0
    const connect = () => {
      const loc = typeof window !== 'undefined' ? window.location : { protocol:'http:', hostname:'localhost' }
      const host = loc.hostname || 'localhost'
      const port = process.env.NEXT_PUBLIC_SERVER_PORT || 4000
      const scheme = loc.protocol === 'https:' ? 'wss' : 'ws'
      let ws
      try {
        ws = new WebSocket(`${scheme}://${host}:${port}/overlay`)
      } catch(e) {
        try { ws = new WebSocket(`${scheme}://localhost:${port}/overlay`) } catch(_) {}
      }
      wsRef.current = ws
      ws.onmessage = (ev) => {
        try{
          const msg = JSON.parse(ev.data)
          if(msg.type === 'overlay_update'){
            lastRxRef.current = Date.now()
            if(msg.caption !== undefined) setCaption(msg.caption)
            if(msg.mediaUrl !== undefined) setMediaUrl(msg.mediaUrl || null)
            if(msg.mediaType !== undefined) setMediaType(msg.mediaType || null)
            if(msg.fullscreen !== undefined) setFullscreen(!!msg.fullscreen)
            if(msg.face !== undefined) setFace(msg.face)
            if(msg.sfx){ try{ audioRef.current.src = msg.sfx; audioRef.current.play(); }catch(e){} }
            if(msg.say){ speak(msg.say) }
            if(msg.typeText){
              if((msg.mediaUrl || mediaUrl) && (msg.fullscreen || fullscreen)){
                // Defer typing until media finishes
                pendingTypeTextRef.current = msg.typeText
                setAwaitingMediaEnd(true)
                if((msg.mediaType || mediaType) !== 'video'){
                  try{ clearTimeout(mediaWaitTimerRef.current) }catch(e){}
                  mediaWaitTimerRef.current = setTimeout(()=>{
                    if(pendingTypeTextRef.current){
                      const t = pendingTypeTextRef.current
                      pendingTypeTextRef.current = ''
                      setAwaitingMediaEnd(false)
                      startTyping(t)
                    }
                  }, 2500)
                }
              } else {
                startTyping(msg.typeText)
              }
            }
            try{ clearTimeout(revertTimerRef.current) }catch(e){}
            // Shorter auto-revert; if media is present in this update, keep even shorter
            const hasMedia = !!(msg.mediaUrl)
            const ms = (hasMedia ? 3500 : 4200) + (msg.typeText ? 800 : 0)
            revertTimerRef.current = setTimeout(()=>{
              setGlitch('glitch-shake')
              setTimeout(()=>{ setMediaUrl(null); setMediaType(null); setFullscreen(false); setCaption(''); setGlitch('') }, 700)
            }, ms)
            // stash idle hint for post-typing media logic
            try{ wsRef.current.lastMsg = { idle: !!msg.idle } }catch(e){}
          }
        }catch(e){}
      }
      ws.onopen = ()=> { attempts = 0; setGlitch('glitch-shake'); setTimeout(()=> setGlitch(''), 600) }
      ws.onerror = (err)=>{ console.error('[overlay] websocket error', err) }
      ws.onclose = ()=>{ if(closed) return; attempts = Math.min(attempts+1, 6); setTimeout(connect, Math.min(1000*Math.pow(2,attempts), 8000)) }
    }
    connect()
    return ()=> { closed = true; wsRef.current?.close() }
  }, [])

  // Alive: blink + fidget + occasional glitch
  useEffect(()=>{
    let active = true
    const scheduleBlink = () => {
      if(!active) return
      const ms = 2500 + Math.random()*3500
      setTimeout(()=>{ if(!active) return; setBlinkOn(true); setTimeout(()=> setBlinkOn(false), 120); scheduleBlink() }, ms)
    }
    scheduleBlink()
    const fid = setInterval(()=>{ setJitter({ x: Math.round((Math.random()*2-1)*6), y: Math.round((Math.random()*2-1)*6) }) }, 1600)
    const gl = setInterval(()=>{ if(Math.random()<0.18){ const t=['shake','spin','bounce','edge']; setGlitch('glitch-'+t[Math.floor(Math.random()*t.length)]); setTimeout(()=> setGlitch(''), 600+Math.random()*900) } }, 7000)
    // Resume animations when tab becomes visible again
    const onVis = ()=>{
      if(document.visibilityState === 'visible'){
        setBlinkOn(false)
        setJitter({ x:0, y:0 })
        setGlitch('glitch-shake')
        setTimeout(()=> setGlitch(''), 600)
      }
    }
    try{ document.addEventListener('visibilitychange', onVis) }catch(e){}
    // Heartbeat watchdog: if no overlay updates in 20s, jolt animations
    const hb = setInterval(()=>{
      if(!active) return
      const stale = Date.now() - lastRxRef.current > 20000
      if(stale && !typing){
        try{ wsRef.current && wsRef.current.readyState === 1 && wsRef.current.close() }catch(e){}
        setGlitch('glitch-shake')
        setTimeout(()=> setGlitch(''), 500)
        setBlinkOn(false)
        setFace('._.')
      }
    }, 8000)
    return ()=>{ active=false; clearInterval(fid); clearInterval(gl); clearInterval(hb); try{ document.removeEventListener('visibilitychange', onVis) }catch(e){} }
  }, [])

  function speak(text){
    try{
      const synth = window.speechSynthesis
      if(!synth) return
      if(synth.speaking) synth.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1
      utter.pitch = 1.05
      utter.volume = 1
      utter.onstart = ()=>{
        try{ clearInterval(mouthTimerRef.current) }catch(e){}
      }
      utter.onend = ()=>{}
      synth.speak(utter)
      synthRef.current = synth
    }catch(e){}
  }

  // Start typing after video ends when awaitingMediaEnd
  useEffect(()=>{
    if(!awaitingMediaEnd) return
    if(mediaType !== 'video') return
    const vid = videoRef.current
    if(!vid) return
    try{ vid.loop = false }catch(e){}
    const onEnded = () => {
      try{
        if(pendingTypeTextRef.current){
          const t = pendingTypeTextRef.current
          pendingTypeTextRef.current = ''
          setAwaitingMediaEnd(false)
          startTyping(t)
        }
      }catch(e){}
    }
    try{ vid.addEventListener('ended', onEnded) }catch(e){}
    // Fallback timeout
    try{ clearTimeout(mediaWaitTimerRef.current) }catch(e){}
    mediaWaitTimerRef.current = setTimeout(()=> onEnded(), 8000)
    return ()=>{ try{ vid.removeEventListener('ended', onEnded) }catch(e){} }
  }, [awaitingMediaEnd, mediaUrl, mediaType])

  function startTyping(text){
    const stripUndef = (s)=> String(s||'').replace(/(?:[\s\W]*undefined[\s\W]*)+$/i, '')
    // Sanitize to avoid scrambled/garbled glyphs in some fonts
    const replaceSmart = (s)=> s
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014\u2212]/g, '-')
      .replace(/[\u2026]/g, '...')
    const toPlain = (s)=> replaceSmart(s.normalize ? s.normalize('NFKD') : s)
      .replace(/[\p{M}]/gu, '') // strip combining marks/diacritics
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-widths
      .replace(/[^\n\r\t\u0020-\u007E]+/g, '') // keep basic printable ASCII
    let clean = toPlain(String(text||''))
      .replace(/^\s+/, '')
    // Aggressively strip trailing 'undefined' artifacts (any case, repeated, with punctuation/whitespace)
    clean = stripUndef(clean)
    clean = clean.trimEnd()
    const chars = Array.from(clean)
    // Clear any in-flight timers to avoid overlaps
    try{ clearTimeout(typingTimersRef.current.step) }catch(e){}
    try{ clearTimeout(typingTimersRef.current.failsafe) }catch(e){}
    setTyping(true)
    setTyped('')
    // Seed with first 3 characters to dodge initial-drop/kerning issues
    const seed = stripUndef(chars.slice(0, 3).join(''))
    let i = seed.length
    const runStep = ()=>{
      if(i < chars.length){
        setTyped(prev=> stripUndef(prev + chars[i]))
        i++
        typingTimersRef.current.step = setTimeout(runStep, 26 + Math.random()*36)
      } else {
        typingTimersRef.current.step = setTimeout(()=>{ 
          setTyping(false); 
          setTyped('');
          // 75% chance to fetch related animation after typing finishes
          try{
            // Skip during idle messages; reduce frequency to ~30%
            const lastMsg = wsRef.current?.lastMsg || {}
            if(!lastMsg.idle && Math.random() < 0.30){
              const q = (String(text||'').slice(0, 64) || 'meme')
              const base = typeof window !== 'undefined' ? window.location : { protocol:'http:', hostname:'localhost' }
              const host = base.hostname || 'localhost'
              const port = process.env.NEXT_PUBLIC_SERVER_PORT || 4000
              const api = `${base.protocol}//${host}:${port}/api/media/search?q=${encodeURIComponent(q)}`
              fetch(api).then(r=>r.json()).then(j=>{
                if(j && j.ok && j.url){
                  setMediaUrl(j.url)
                  setMediaType(j.type||'video')
                  setFullscreen(true)
                  // Auto-clear fetched media quickly
                  try{ clearTimeout(mediaDisplayTimerRef.current) }catch(e){}
                  mediaDisplayTimerRef.current = setTimeout(()=>{ 
                    try{ setMediaUrl(null); setMediaType(null); setFullscreen(false) }catch(e){}
                  }, 4000)
                }
              }).catch(()=>{})
            }
          }catch(e){}
        }, 2000)
      }
    }
    // Apply seed on next frame for reliable initial paint
    try{ requestAnimationFrame(()=>{
      setTyped(stripUndef(seed))
      typingTimersRef.current.step = setTimeout(runStep, 70)
    }) } catch(_) {
      setTyped(stripUndef(seed))
      typingTimersRef.current.step = setTimeout(runStep, 70)
    }
    // Failsafe: if first glyphs didn't render, force-seed shortly after
    typingTimersRef.current.failsafe = setTimeout(()=>{ try{ if(typedRef.current.length < seed.length && seed.length){ setTyped(stripUndef(seed)) } }catch(e){} }, 160)
  }

  // Auto-scroll typing container to keep newest text visible
  useEffect(()=>{
    try{ typedRef.current = typed }catch(e){}
    try{
      if(typing && textBoxRef.current){
        textBoxRef.current.scrollTop = textBoxRef.current.scrollHeight
      }
    }catch(e){}
  }, [typed, typing])

  function FaceMarkup(){
    if(face === '._.'){
      const eyeStyle = blinkOn ? { display:'inline-block', fontSize:'75%', transform:'translateY(0.25em)' } : { display:'inline-block' }
      return (
        <span style={{letterSpacing:'0.05em'}}>
          <span style={eyeStyle}>{blinkOn ? '-' : '.'}</span>
          <span style={{display:'inline-block', padding:'0 0.12em'}}> _ </span>
          <span style={eyeStyle}>{blinkOn ? '-' : '.'}</span>
        </span>
      )
    }
    return <span>{blinkOn ? face : face}</span>
  }

  return (
    <div className="overlay-root">
      <style jsx global>{`
        html, body, #__next { background: transparent !important; }
        /* Hide Next.js dev overlays/badges within the iframe */
        .nextjs-portal, [data-nextjs-toast], [data-nextjs-dock], [data-nextjs-dialog-overlay], [data-nextjs-router-reloader-bar] { display:none !important; }
        /* Hide Turbopack and other development indicators */
        [data-turbo-indicator], [data-nextjs-build-indicator], .nextjs-build-indicator, 
        [data-nextjs-prerender-indicator], [data-nextjs-error-overlay], [data-nextjs-build-error],
        [data-nextjs-hmr-indicator], [data-nextjs-dev-overlay], .nextjs-dev-overlay,
        [id*="nextjs"], [class*="nextjs"], [data-overlay], [data-error-overlay] { display:none !important; }
        @keyframes cursor-blink { 50% { opacity: 0; } }
        .terminal .cursor { display:inline-block; width:0.6em; background:#00ff99; animation: cursor-blink 1s steps(1, start) infinite; }
        @keyframes shake { 10%, 90% { transform: translate3d(-2px, 0, 0); } 20%, 80% { transform: translate3d(4px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-6px, 0, 0); } 40%, 60% { transform: translate3d(6px, 0, 0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
        @keyframes edge { 0% { transform: translate(0,0); } 25% { transform: translate(0, calc(100% - 20px)); } 50% { transform: translate(calc(100% - 20px), calc(100% - 20px)); } 75% { transform: translate(calc(100% - 20px), 0); } 100% { transform: translate(0,0); } }
        .anim-stage.glitch-shake { animation: shake 0.7s ease both; }
        .anim-stage.glitch-spin { animation: spin 0.9s linear both; }
        .anim-stage.glitch-bounce { animation: bounce 0.9s ease both; }
        .anim-stage.glitch-edge { animation: edge 1.1s ease-in-out both; }
      `}</style>
      <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>
        <div style={{position:'absolute', inset:0}}>
          <div className={`anim-stage ${glitch}`} style={{position:'absolute', inset:0, background:'#0a1a1a', border:'2px solid #0f2b2b', borderRadius:10, boxShadow:'inset 0 0 32px rgba(0,0,0,0.6), inset 0 0 4px rgba(8,255,200,0.15)'}}>
            {!typing && (
              <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', color:'#08ffc8', fontFamily:'monospace', fontSize:'min(8vw, 96px)', textShadow:'0 0 8px rgba(8,255,200,0.6)', transform:`translate(${jitter.x}px, ${jitter.y}px)`}}>
                <FaceMarkup />
              </div>
            )}
            {typing && (
              <div ref={textBoxRef} style={{position:'absolute', inset:'6% 4% 6% 4%', color:'#00ff99', fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize:'min(6.75vw, 86px)', lineHeight:1.1, textShadow:'0 0 8px rgba(0,255,153,0.5)', overflowY:'auto', fontFeatureSettings:'"liga" 0, "calt" 0', hyphens:'none', WebkitHyphens:'none'}} className="terminal">
                <pre style={{whiteSpace:'pre-wrap', margin:0, overflowWrap:'anywhere', wordBreak:'break-word', fontKerning:'none'}}>{typed}<span className="cursor"> </span></pre>
              </div>
            )}
          </div>

          {mediaUrl && mediaType !== 'video' && (
            <img src={mediaUrl} alt="" onError={()=>{ try{ setMediaUrl(null) }catch(e){} }} style={{position:'absolute', left: 0, top: 0, width:'100%', height:'100%', objectFit:'cover', borderRadius: 10, border:'none', background:'transparent'}}/>
          )}
          {mediaUrl && mediaType === 'video' && (
            <video ref={videoRef} src={mediaUrl} autoPlay muted loop={!awaitingMediaEnd} playsInline onError={()=>{ try{ setMediaUrl(null); setMediaType(null) }catch(e){} }} style={{position:'absolute', left: 0, top: 0, width:'100%', height:'100%', objectFit:'cover', borderRadius: 10}} />
          )}

          {caption && (
            <div className="caption" style={{position:'absolute', left:16, bottom:16}}>{caption}</div>
          )}
          <audio ref={audioRef} style={{display:'none'}} />
        </div>
      </div>
    </div>
  )
}

