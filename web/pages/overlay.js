
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
  const pendingMediaRef = useRef(null)
  const mediaWaitTimerRef = useRef(null)
  const videoRef = useRef(null)
  const [awaitingMediaEnd, setAwaitingMediaEnd] = useState(false)
  const [showSkin, setShowSkin] = useState(false)
  const [nowText, setNowText] = useState('')

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

  // Absolute guard: never show media while typing. If it slips in, queue & clear.
  useEffect(()=>{
    try{
      if(typing && mediaUrl){
        pendingMediaRef.current = { url: mediaUrl, type: mediaType || null, fullscreen: !!fullscreen }
        setMediaUrl(null); setMediaType(null); setFullscreen(false)
      }
    }catch(e){}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, mediaUrl])

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
            if(msg.caption !== undefined){
              const c = String(msg.caption||'')
              if(/\bmode\b/i.test(c)) setCaption('')
              else setCaption(c)
            }
            // Never change media during typing; ignore incoming media until done
            if(msg.mediaUrl !== undefined){
              if(!typing && !pendingTypeTextRef.current){
                setMediaUrl(msg.mediaUrl || null)
              } else {
                pendingMediaRef.current = { url: msg.mediaUrl || null, type: msg.mediaType || null, fullscreen: !!msg.fullscreen }
              }
            }
            if(msg.mediaType !== undefined){ if(!typing && !pendingTypeTextRef.current){ setMediaType(msg.mediaType || null) } }
            if(msg.fullscreen !== undefined){ if(!typing && !pendingTypeTextRef.current){ setFullscreen(!!msg.fullscreen) } }
            if(msg.face !== undefined) setFace(msg.face)
            if(msg.sfx){ try{ audioRef.current.src = msg.sfx; audioRef.current.play(); }catch(e){} }
            if(msg.say){ speak(msg.say) }
            if(msg.typeText){
              // Strict rule: never show media during typing; queue text if media present
              if((msg.mediaUrl || mediaUrl)){
                // Defer incoming media; show after typing completes
                pendingMediaRef.current = { url: msg.mediaUrl || null, type: msg.mediaType || null, fullscreen: !!msg.fullscreen }
                setMediaUrl(null); setMediaType(null); setFullscreen(false)
                startTyping(msg.typeText)
              } else if(!typing) {
                startTyping(msg.typeText)
              } else {
                // If currently typing, append to queue instead of interrupting
                pendingTypeTextRef.current = (pendingTypeTextRef.current||'') + '\n' + msg.typeText
              }
            }
            try{ clearTimeout(revertTimerRef.current) }catch(e){}
            // Revert only after typing completes; base on length when text to ensure full read time
            const hasMedia = !!(msg.mediaUrl)
            const expectedMs = msg.typeText ? Math.max(4200, String(msg.typeText).length * 55 + 3000) : 0
            const ms = msg.typeText ? expectedMs : (hasMedia ? 3500 : 5200)
            revertTimerRef.current = setTimeout(()=>{
              // If there's pending text, start it immediately
              if(pendingTypeTextRef.current){
                const t = pendingTypeTextRef.current
                pendingTypeTextRef.current = ''
                startTyping(t)
                return
              }
              // Otherwise, if there's pending media, show it now
              if(pendingMediaRef.current && !typing){
                const m = pendingMediaRef.current
                pendingMediaRef.current = null
                setMediaUrl(m.url)
                setMediaType(m.type || null)
                setFullscreen(!!m.fullscreen)
                // schedule cleanup after a bit
                setTimeout(()=>{ setCaption(''); setGlitch('') }, 200)
                return
              }
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
        // Occasionally show the authentic Sidekick dashboard skin as idle backdrop
        if(Math.random()<0.35){
          setShowSkin(true)
          // Auto-hide skin after 7s or on next activity
          setTimeout(()=>{ setShowSkin(false) }, 7000)
        }
      }
    }, 8000)
    return ()=>{ active=false; clearInterval(fid); clearInterval(gl); clearInterval(hb); try{ document.removeEventListener('visibilitychange', onVis) }catch(e){} }
  }, [])

  // Clock in header (Sidekick style)
  useEffect(()=>{
    const fmt = ()=>{
      try{
        const d = new Date()
        const month = new Intl.DateTimeFormat('en-US', { month:'short', timeZone:'America/Los_Angeles' }).format(d)
        const day = new Intl.DateTimeFormat('en-US', { day:'numeric', timeZone:'America/Los_Angeles' }).format(d)
        const time = new Intl.DateTimeFormat('en-US', { hour:'numeric', minute:'2-digit', hour12:true, timeZone:'America/Los_Angeles' }).format(d).toLowerCase()
        setNowText(`${month} ${day}, ${time}`)
      }catch(_){ setNowText('') }
    }
    fmt()
    const t = setInterval(fmt, 30000)
    return ()=> clearInterval(t)
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
    const total = clean
    // Clear any in-flight timers to avoid overlaps
    try{ clearTimeout(typingTimersRef.current.step) }catch(e){}
    try{ clearTimeout(typingTimersRef.current.failsafe) }catch(e){}
    // Ensure no media is visible while typing begins
    try{ setMediaUrl(null); setMediaType(null); setFullscreen(false) }catch(e){}
    setTyping(true)
    setTyped('')
    try{ typedRef.current = '' }catch(e){}
    let i = 0
    const runStep = ()=>{
      if(i < total.length){
        const next = stripUndef(total.slice(0, i+1))
        setTyped(next)
        try{ typedRef.current = next }catch(e){}
        i++
        typingTimersRef.current.step = setTimeout(runStep, 26 + Math.random()*36)
      } else {
        typingTimersRef.current.step = setTimeout(()=>{ 
          setTyping(false); 
          setTyped('');
          // After typing finishes, show any pending media quickly
          try{
            if(pendingMediaRef.current){
              const m = pendingMediaRef.current
              pendingMediaRef.current = null
              setMediaUrl(m.url)
              setMediaType(m.type || null)
              setFullscreen(!!m.fullscreen)
            }
          }catch(e){}
        }, 1200)
      }
    }
    try{ requestAnimationFrame(()=>{ typingTimersRef.current.step = setTimeout(runStep, 60) }) } catch(_) {
      typingTimersRef.current.step = setTimeout(runStep, 60)
    }
    // Enforcer: ensure rendered prefix matches current index while typing
    typingTimersRef.current.failsafe = setInterval(()=>{
      try{
        if(!typing) { clearInterval(typingTimersRef.current.failsafe); return }
        const expect = stripUndef(total.slice(0, i))
        if(typedRef.current !== expect){ setTyped(expect); typedRef.current = expect }
      }catch(e){}
    }, 50)
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
        .terminal .cursor { display:inline-block; width:0.45em; background:#123a6b; animation: cursor-blink 1s steps(1, start) infinite; }
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
          <div className={`anim-stage ${glitch}`} style={{position:'absolute', inset:0, background:'linear-gradient(180deg,#eef3fb 0%,#e6edf9 100%)', border:'2px solid #9db3d1', borderRadius:10, boxShadow:'inset 0 0 18px rgba(10,30,60,0.15), 0 2px 6px rgba(0,0,0,0.25)', zIndex:1}}>
            {/* Top-right: date (small, bold) and status icons stacked below */}
            <div style={{position:'absolute', right:8, top:6, textAlign:'right', transform:'scale(0.8)', transformOrigin:'top right'}}>
              <div style={{fontFamily:'Verdana, Tahoma, Arial, sans-serif', fontWeight:700, fontSize:9, color:'#123a6b', lineHeight:1.1}}>{nowText}</div>
              <div style={{marginTop:2, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8}}>
                {/* Reception bars (30% smaller than before) */}
                <div aria-label="reception" style={{display:'grid', gridAutoFlow:'column', alignItems:'end', gap:2}}>
                  {Array.from({length:4}).map((_,i)=> (
                    <span key={i} style={{display:'inline-block', width:1.76, height:Math.round((4+i*3)*0.7*0.88), background:'#123a6b', opacity:0.9}} />
                  ))}
                </div>
                {/* Battery */}
                <div aria-label="battery" style={{display:'inline-flex', alignItems:'center', padding:'1px 1px 1px 3px', border:'1px solid #123a6b', borderRadius:2}}>
                  <div style={{width:10.5, height:6, background:'#123a6b'}} />
                  <div style={{width:1.5, height:3.7, background:'#123a6b', marginLeft:2}} />
                </div>
              </div>
            </div>
                {showSkin && !typing && !mediaUrl && (
                  <img src={`http://${typeof window!=='undefined'?window.location.hostname:'localhost'}:${process.env.NEXT_PUBLIC_SERVER_PORT||4000}/skin/sidekick`} alt="sidekick skin" style={{position:'absolute', left:0, top:0, width:'100%', height:'100%', objectFit:'cover', borderRadius:10, opacity:0.95, filter:'saturate(1.05) contrast(1.02)'}} />
                )}
            {!typing && (
              <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', color:'#123a6b', fontFamily:'Tahoma, Verdana, Arial, sans-serif', fontSize:'min(7.5vw, 65px)', textShadow:'0 1px 0 rgba(255,255,255,0.8)', transform:`translate(${jitter.x}px, ${jitter.y}px)`}}>
                <FaceMarkup />
              </div>
            )}
            {typing && (
              <div ref={textBoxRef} style={{position:'absolute', inset:'28px 16px 16px 16px', color:'#0c2d6b', fontFamily:'Verdana, Tahoma, Arial, sans-serif', fontWeight:700, fontSize:'min(4.5vw, 38px)', lineHeight:1.22, textShadow:'0 1px 0 rgba(255,255,255,0.85)', overflowY:'auto', background:'transparent', border:'none', borderRadius:0, padding:0}} className="terminal">
                <pre style={{whiteSpace:'pre-wrap', margin:0, overflowWrap:'anywhere', wordBreak:'break-word', fontKerning:'none', fontFamily:'Verdana, Tahoma, Arial, sans-serif', fontWeight:700}}>{typed}<span className="cursor"> </span></pre>
              </div>
            )}
          </div>

          {mediaUrl && mediaType !== 'video' && (
            <img src={mediaUrl} alt="" onError={()=>{ try{ setMediaUrl(null) }catch(e){} }} style={{position:'absolute', left: 0, top: 0, width:'100%', height:'100%', objectFit:'cover', borderRadius: fullscreen ? 0 : 10, border:'none', background:'transparent', zIndex:9}}/>
          )}
          {mediaUrl && mediaType === 'video' && (
            <video ref={videoRef} src={mediaUrl} autoPlay muted loop={!awaitingMediaEnd} playsInline onError={()=>{ try{ setMediaUrl(null); setMediaType(null) }catch(e){} }} style={{position:'absolute', left: 0, top: 0, width:'100%', height:'100%', objectFit:'cover', borderRadius: fullscreen ? 0 : 10, zIndex:9}} />
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

