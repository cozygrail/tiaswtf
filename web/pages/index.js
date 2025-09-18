
export default function Home(){
  return (
    <div className="container">
      <h1>Host-Swap AI (Starter)</h1>
      <p>A functional starter for a bot that can read chat, reply, speak (TTS placeholder), and render an overlay. Device-themed later.</p>
      <div className="row" style={{marginTop:16}}>
        <a className="btn" href="/live">Go to Live</a>
        <a className="btn secondary" href="/clips">Clips</a>
        <a className="btn secondary" href="/about">About</a>
      </div>
      <div style={{marginTop:24}} className="card">
        <h3>Status</h3>
        <p>Server expected at <code>http://localhost:4000</code>. Start it to enable chat & overlay events.</p>
      </div>
    </div>
  )
}
