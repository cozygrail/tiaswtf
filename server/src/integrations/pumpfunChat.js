import puppeteer from 'puppeteer'

export class PumpfunChat {
  constructor({ tokenUrl, onMessage, headless = 'new' }){
    this.tokenUrl = tokenUrl
    this.onMessage = onMessage
    this.headless = headless
    this.browser = null
    this.page = null
    this.running = false
  }

  async connect(){
    if(this.running) return
    this.running = true
    this.browser = await puppeteer.launch({ headless: this.headless, args: ['--no-sandbox','--disable-setuid-sandbox'] })
    this.page = await this.browser.newPage()
    await this.page.setViewport({ width: 1280, height: 900 })
    await this.page.goto(this.tokenUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    // surface page console for debugging selectors
    try{ this.page.on('console', msg => console.log('[pumpfun:console]', msg.type(), msg.text())) }catch(e){}
    try{ await this.page.setBypassCSP(true) }catch(e){}

    // Observe chat container for new messages
    await this.page.exposeFunction('pumpfunEmit', (payload) => {
      try{ this.onMessage && this.onMessage(payload) }catch(e){}
    })

    const attachInFrame = async (frame) => {
      try{
        await frame.evaluate(() => {
          const sleep = (ms)=> new Promise(r=> setTimeout(r, ms))
          const tryFind = async (selectors)=>{
            for(let i=0;i<20;i++){
              for(const sel of selectors){
                const el = document.querySelector(sel)
                if(el) return el
              }
              await sleep(500)
            }
            return null
          }
          const deepQueryAll = (root, selector)=>{
            const out = []
            const visit = (node)=>{
              try{ node.querySelectorAll && out.push(...node.querySelectorAll(selector)) }catch(_){ }
              try{ if(node.shadowRoot) visit(node.shadowRoot) }catch(_){ }
              try{ for(const c of node.children||[]) visit(c) }catch(_){ }
            }
            visit(root)
            return Array.from(new Set(out))
          }
          ;(async ()=>{
            let chatRoot = null
            const input = await tryFind(['input[placeholder*="Type a message"]','textarea[placeholder*="Type a message"]','[placeholder*="Type a message"]'])
            if(input){
              let n = input
              for(let k=0;k<6 && n; k++){
                const style = n instanceof HTMLElement ? getComputedStyle(n) : null
                if(style && (style.overflowY === 'auto' || style.overflowY === 'scroll')){ chatRoot = n; break }
                n = n.parentElement
              }
            }
            if(!chatRoot){
              try{
                const all = Array.from(document.querySelectorAll('*'))
                const hit = all.find(el=> (el.textContent||'').toLowerCase().includes('live chat'))
                if(hit) chatRoot = hit.parentElement || document.body
              }catch(_){ chatRoot = document.body }
            }
            if(!chatRoot) chatRoot = document.body
            console.log('pumpfun observer attached at', chatRoot.tagName)
            const seen = new Set()
            const emitNode = (node)=>{
              try{
                if(!(node instanceof HTMLElement)) return
                const text = (node.innerText||'').trim()
                if(!text || text.length>400 || text.length < 3) return
                
                // NUCLEAR STRICT: Only process messages that are clearly human chat
                const usernamePattern = /^([a-zA-Z0-9_]{2,20})\s*:\s*(.+)$/
                const match = text.match(usernamePattern)
                
                if(!match) {
                  return
                }
                
                const username = match[1]
                const message = match[2].trim()
                
                if(message.length < 4) return
                
                // EXPANDED forbidden patterns - block ALL UI/system content
                const forbiddenPatterns = [
                  /^(LIVE|request|click anywhere|Reply|ago|24hr|ATH|Vol|Price|Market Cap|Trade|Display|Hide|USD|SOL|Volume|Pump|Open|High|Low|Close|BARS|EDGE)$/i,
                  /^\d+[hHdDmM](\s|$)/, /^[\d:]+\s*(UTC|AM|PM)?$/i, /UTC|log|auto/i,
                  /^[\d.,\-+%() \$KMBOHLC]+$/, /^(O|H|L|C)\s*[\d.]+[MK]?$/,
                  /^\$[\d.,]+[MK]?/, /^[\-+]?[\d.,]+%/, /^[\d.,]+[MK]\s/,
                  /(beginning of chat|Read-only mode|Log in to|Type a message|Liquidity pool)/i,
                  /^(GJPfaV|AUSBAGWORK)$/i, /^[A-Z]$/, /^\d+$/
                ]
                
                if(forbiddenPatterns.some(pattern => pattern.test(message))) {
                  return
                }
                
                if(!/[a-zA-Z]{2,}/.test(message)) {
                  return
                }
                
                const id = text.slice(0,200)
                if(seen.has(id)) return
                seen.add(id)
                
                let user = 'chat'
                
                // Only emit actual live chat messages
                console.log('emit')
                window.pumpfunEmit({ user: username, text: message })
                
                if(seen.size > 8000){ const it = seen.values(); for(let i=0;i<3000;i++) it.next() }
              }catch(_){ }
            }
            const scan = ()=>{
              try{
                const candidates = deepQueryAll(chatRoot, 'li, [role="listitem"], [class*="message"], [class*="chat"], div')
                for(const el of candidates) emitNode(el)
              }catch(_){ }
            }
            scan()
            setInterval(scan, 1500)
          })()
        })
      }catch(e){ console.log('[pumpfun] attachInFrame error', e?.message||e) }
    }

    // Attach to all frames (accounts for chat inside iframes/shadow hosts)
    try{ for(const f of this.page.frames()) await attachInFrame(f) }catch(e){}
    try{ this.page.on('frameattached', (f)=> attachInFrame(f)) }catch(e){}

    // Also attach in main frame to be safe
    await this.page.evaluate(() => {
      const sleep = (ms)=> new Promise(r=> setTimeout(r, ms))
      const tryFind = async (selectors)=>{
        for(let i=0;i<30;i++){
          for(const sel of selectors){
            const el = document.querySelector(sel)
            if(el) return el
          }
          await sleep(1000)
        }
        return null
      }
      ;(async ()=>{
            // Specifically target the live chat area on Pump.fun
            let chatRoot = null
            
            // Look for the live chat container specifically
            const liveChatSelectors = [
              '[class*="chat"]',
              '[data-testid*="chat"]',
              'div:has(> div:contains("live chat"))',
              'div[class*="messages"]',
              'div[class*="message-list"]'
            ]
            
            for(const selector of liveChatSelectors) {
              try {
                const el = document.querySelector(selector)
                if(el && el.textContent && el.textContent.toLowerCase().includes('live chat')) {
                  chatRoot = el
                  break
                }
              } catch(e) {}
            }
            
            // If we found a live chat header, look for the message container nearby
            if(!chatRoot) {
              const headers = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.toLowerCase().trim() === 'live chat'
              )
              
              for(const header of headers) {
                // Look for a scrollable container near the header
                let parent = header.parentElement
                for(let i = 0; i < 5 && parent; i++) {
                  const style = getComputedStyle(parent)
                  if(style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                     parent.scrollHeight > parent.clientHeight) {
                    chatRoot = parent
                    break
                  }
                  parent = parent.parentElement
                }
                if(chatRoot) break
              }
            }
            
            // Fallback: look for message input and find its container
            if(!chatRoot) {
              const input = await tryFind(['input[placeholder*="Type a message"]','textarea[placeholder*="Type a message"]'])
              if(input) {
                let n = input.parentElement
                for(let k=0;k<8 && n; k++){
                  const style = getComputedStyle(n)
                  if(style.overflowY === 'auto' || style.overflowY === 'scroll'){ 
                    chatRoot = n
                    break 
                  }
                  n = n.parentElement
                }
              }
            }
            
            if(!chatRoot) chatRoot = document.body
        const seen = new Set()
        const readOne = (node)=>{
          try{
            if(!(node instanceof HTMLElement)) return
            const text = (node.innerText||'').trim()
            if(!text || text.length > 400 || text.length < 3) return
            
            // NUCLEAR STRICT: Only process messages that are clearly human chat
            // Must be exactly "username: actual_message" format
            const usernamePattern = /^([a-zA-Z0-9_]{2,20})\s*:\s*(.+)$/
            const match = text.match(usernamePattern)
            
            if(!match) {
              // Skip EVERYTHING that doesn't match "username: message" format
              return
            }
            
            const username = match[1]
            const message = match[2].trim()
            
            // Skip if message is too short or looks like system data
            if(message.length < 4) return
            
            // EXPANDED forbidden patterns - block ALL UI/system content
            const forbiddenPatterns = [
              // UI Elements
              /^(LIVE|request|click anywhere|Reply|ago|24hr|ATH|Vol|Price|Market Cap|Trade|Display|Hide|USD|SOL|Volume|Pump|Open|High|Low|Close|BARS|EDGE)$/i,
              // Time formats
              /^\d+[hHdDmM](\s|$)/, // "37m", "16h", "6h"
              /^[\d:]+\s*(UTC|AM|PM)?$/i, // timestamps
              /UTC|log|auto/i,
              // Chart/price data
              /^[\d.,\-+%() \$KMBOHLC]+$/, // Pure numbers/chart data
              /^(O|H|L|C)\s*[\d.]+[MK]?$/, // OHLC data like "O 2.6M"
              /^\$[\d.,]+[MK]?/, // Price data like "$2.1M"
              /^[\-+]?[\d.,]+%/, // Percentage data like "-6.68%"
              /^[\d.,]+[MK]\s/, // Volume data like "109.18 K"
              // System messages
              /(beginning of chat|Read-only mode|Log in to|Type a message|Liquidity pool)/i,
              // Block anything that looks like UI labels or data
              /^(GJPfaV|AUSBAGWORK)$/i,
              // Block single letters/numbers that are likely UI fragments
              /^[A-Z]$/, // Single capital letters
              /^\d+$/ // Pure numbers
            ]
            
            if(forbiddenPatterns.some(pattern => pattern.test(message))) {
              return
            }
            
            // Additional check: message must contain actual words (not just symbols/numbers)
            if(!/[a-zA-Z]{2,}/.test(message)) {
              return // Skip if no real words of 2+ characters
            }
            
            const id = text.slice(0,200)
            if(seen.has(id)) return
            seen.add(id)
            
            let user = 'chat'
            
            // Only emit actual live chat messages
            console.log('emit')
            window.pumpfunEmit({ user: username, text: message })
            
            if(seen.size > 5000){ const it = seen.values(); for(let i=0;i<2000;i++) it.next(); }
          }catch(e){}
        }
        const scan = ()=>{
          try{ chatRoot.querySelectorAll('li, [role="listitem"], [class*="message"], div').forEach(readOne) }catch(e){}
        }
        scan()
        const mo = new MutationObserver((muts)=>{
          for(const m of muts){
            m.addedNodes && m.addedNodes.forEach(n=>{ if(n.nodeType===1) readOne(n) })
          }
        })
        mo.observe(chatRoot, { childList:true, subtree:true })
        console.log('pumpfun observer attached at', chatRoot.tagName)
      })()
    })
  }

  async close(){
    try{ await this.page?.close() }catch(e){}
    try{ await this.browser?.close() }catch(e){}
    this.running = false
  }
}

