# Host Swap Bot Starter

TIAS livestream bot (server + web).

# Host-Swap Bot Starter (Web + Server)

A minimal starter you can drop into Cursor to begin building your **Pump.fun livestream bot**.  
This includes:

- **Next.js web app** (chat UI, overlay page for OBS, basic routes)
- **Node server** with WebSocket chat, overlay broadcast, autonomy state machine stub, moderation stub
- **Device skin (Sidekick) placeholder** for the “trapped in devices” theme

> ⚠️ This starter is entertainment-only. Do not automate token promotion, contract addresses, or trading calls.

---

## Quick Start

### 1) Prereqs
- Node 18+ (or 20+ recommended)
- FFmpeg installed (for later streaming)
- OBS (optional for early testing)

### 2) Install & Run
Open two terminals.

**Web**
```bash
cd web
npm install
npm run dev
# visit http://localhost:3000
```

**Server**
```bash
cd server
cp .env.example .env  # edit if needed
npm install
npm run dev
# server on http://localhost:4000
```

### 3) Try it
- Go to **http://localhost:3000/live**  
- Type messages. The server replies with quips and updates the overlay caption/face.
- Open **http://localhost:3000/overlay** in a separate window or add it as an **OBS Browser Source**.

### 4) (Later) Streaming to Pump.fun
- Replace the streamer stub in `server/src/streamer/ffmpeg.js` with a real FFmpeg spawn that captures your overlay (via OBS Virtual Camera or headless capture) and pushes to your Pump.fun **RTMP_URL** + **STREAM_KEY**.
- Use the REST endpoints to control it:
  - `POST http://localhost:4000/api/stream/start`
  - `POST http://localhost:4000/api/stream/stop`

---

## What’s Inside

```
host-swap-bot-starter/
  web/              # Next.js
    pages/
      index.js
      live.js       # chat UI with overlay preview (iframe)
      overlay.js    # overlay page for OBS
      clips.js
      about.js
    public/assets/sidekick.svg  # simple frame art
    styles/globals.css
  server/           # Node + WebSocket
    src/
      index.js      # REST + WS hubs (/ws and /overlay)
      bot/
        llmStub.js  # persona stub
        moderation.js
      state/autonomy.js  # tiny start/stop loop (stub)
      streamer/ffmpeg.js # ffmpeg controller (stub)
    .env.example
```

---

## Next Steps

- Swap `llmStub.js` for a real LLM with persona + safety guardrails.
- Add **TTS** (pipe audio to OBS/FFmpeg).
- Implement **Pump.fun chat** websocket (read + write) and mirror messages to the same bot loop.
- Build **device-hopping**: add more frames (CRT, Game Boy, BlackBerry) and a `?device=` switch for `/overlay`.
- Replace the streamer stub with a proper FFmpeg pipeline or OBS → RTMP workflow.
- Add an **Admin panel** (mute, ban, hard stop, mark clip).

---

## Safety & Content Rules

- Don’t post contract addresses or trading instructions.
- Block doxxing/illegal requests.
- Show an “entertainment only” disclaimer on stream.

---

## FAQs

**Why two servers?**  
To keep responsibilities clean: Next.js renders the UI/overlay; the Node server runs chat, bot logic, and controls streaming.

**How do I get the overlay into OBS?**  
Add a Browser Source pointing to `http://localhost:3000/overlay` at 1920×1080 (or adjust your page CSS to match your canvas size).

**Can this run headless without OBS?**  
Yes—render `/overlay` in a headless browser (Puppeteer) and pipe it to FFmpeg. That’s a follow-up step.

---

Happy building! ✨


## Streaming Modes

### OBS mode (recommended)
- Install OBS and the obs-websocket plugin (OBS 28+ includes it).
- In OBS, add a **Browser Source** with `http://localhost:3000/overlay`.
- Set `.env` in **server/**:
  ```env
  STREAM_MODE=obs
  OBS_WS_URL=ws://127.0.0.1:4455
  OBS_WS_PASSWORD=your_password_if_set
  RTMP_URL=rtmp://<pumpfun-ingest>
  STREAM_KEY=<your_key>
  ```
- Start server & web, then POST `/api/stream/start`.

### FFmpeg test mode
- Use a synthetic test video/audio (color bars + sine) to validate RTMP:
  ```env
  STREAM_MODE=ffmpeg
  RTMP_URL=rtmp://<pumpfun-ingest>
  STREAM_KEY=<your_key>
  ```
- Replace the test inputs in `server/src/streamer/ffmpegReal.js` with your capture pipeline later.

## Pump.fun Chat Integration (stub)
- See `server/src/integrations/pumpfunChat.js`. You can connect to a WS endpoint (if available) by setting `PUMPFUN_WS_URL`, or automate the site with Puppeteer (`PUMPFUN_HEADLESS=1`) and wire DOM events to the bot loop.

## Sidekick Phrase Pack & SFX
- Edit `server/src/bot/sidekickPack.json` to customize quips, roasts, faces, and meme mappings.
- Put real audio files in `web/public/assets/sfx/` and reference them in the pack or returned replies.
