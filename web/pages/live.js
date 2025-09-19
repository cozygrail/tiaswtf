
import React, { useEffect, useRef, useState } from 'react'

export default function Live(){
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const wsRef = useRef(null)
  const outboundQueueRef = useRef([])
  const [connected, setConnected] = useState(false)

  useEffect(()=>{
    let closed = false
    let attempts = 0
    const connect = () => {
      const loc = typeof window !== 'undefined' ? window.location : { protocol:'http:', hostname:'localhost' }
      const port = process.env.NEXT_PUBLIC_SERVER_PORT || 4000
      let wsUrl = null
      try{
        const base = process.env.NEXT_PUBLIC_SERVER_URL
        if(base){
          const u = new URL(base)
          const proto = u.protocol === 'https:' ? 'wss:' : (u.protocol === 'http:' ? 'ws:' : u.protocol)
          wsUrl = `${proto}//${u.host}/ws`
        }
      }catch(_){ wsUrl = null }
      if(!wsUrl){
        const host = loc.hostname || 'localhost'
        const scheme = loc.protocol === 'https:' ? 'wss' : 'ws'
        wsUrl = `${scheme}://${host}:${port}/ws`
      }
      let ws
      try {
        ws = new WebSocket(wsUrl)
      } catch(e) {
        try { ws = new WebSocket(`${loc.protocol==='https:'?'wss':'ws'}://localhost:${port}/ws`) } catch(_) {}
      }
      wsRef.current = ws
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if(msg.type === 'bot_message' || msg.type === 'user_message'){
            setMessages(prev => [...prev, msg])
          }
        } catch(e){}
      }
      ws.onopen = () => {
        attempts = 0
        setConnected(true)
        try {
          // flush any queued messages
          const queued = outboundQueueRef.current
          outboundQueueRef.current = []
          for(const q of queued){
            ws.send(JSON.stringify(q))
          }
        } catch(e) { console.warn('[live] failed to flush queue', e) }
      }
      ws.onerror = (err) => {
        console.error('[live] websocket error', err)
      }
      ws.onclose = () => {
        if(closed) return
        setConnected(false)
        attempts = Math.min(attempts + 1, 6)
        const delay = Math.min(1000 * Math.pow(2, attempts), 10000)
        setTimeout(connect, delay)
      }
    }
    connect()
    return () => { closed = true; wsRef.current?.close() }
  }, [])

  const sendMessage = () => {
    if(!input.trim()) return
    const payload = { type: 'user_message', text: input }
    try{
      if(wsRef.current && wsRef.current.readyState === 1){
        wsRef.current.send(JSON.stringify(payload))
      } else {
        // queue until connection opens
        outboundQueueRef.current.push(payload)
        console.warn('[live] connection not open, queued message')
      }
      setMessages(prev => [...prev, { type:'user_message', text: input, self:true }])
    }catch(e){ console.error('[live] send failed', e) }
    setInput('')
  }

  const onKeyDown = (e) => {
    if(e.key === 'Enter'){
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="live-minimal">
      <div style={{
        position: 'relative', 
        width: 'min(800px, 90vw)',
        maxHeight: '70vh',
        margin: '0 auto'
      }}>
        <img 
          src="/assets/sidekick.png" 
          alt="sidekick frame" 
          style={{
            display: 'block', 
            width: '100%', 
            height: 'auto', 
            margin: '0 auto'
          }} 
        />
        {/** Screen cutout positioned for the Sidekick device screen */}
        <iframe 
          title="overlay" 
          src="/overlay" 
          style={{
            position: 'absolute', 
            left: '36%', 
            top: '19%', 
            width: '28%', 
            height: '28%', 
            border: 'none', 
            borderRadius: '8px', 
            background: 'transparent', 
            overflow: 'hidden'
          }} 
        />
      </div>
      <div className="live-chatbar">
        <div className="live-chatbar-inner">
          <input 
            className="input" 
            value={input} 
            onChange={e=>setInput(e.target.value)} 
            onKeyDown={onKeyDown} 
            placeholder="Say something…" 
          />
          <button className="btn" onClick={sendMessage} disabled={!connected} title={connected? '' : 'Connecting...'}>Send</button>
        </div>
      </div>
    </div>
  )
}
