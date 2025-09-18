
// Block doxxing, contract addresses, illegal asks, and trading instructions.
const banned = [
  /\b0x[a-fA-F0-9]{40,}\b/, // Only block full contract addresses (40+ chars)
  /\b(send\s+(sol|eth|btc)|buy\s+now\s+at|dump\s+it\s+now)\b/i, // More specific trading instructions
  /doxx|swat|home\s*address\s*(pls|please)/i // Only block doxxing attempts
]

export function shouldBlock(text){
  return banned.some(r=> r.test(text))
}
