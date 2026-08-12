# InboxValid.ai — MCP Server for Real-Time Email Validation & Deliverability

> **Task 2 (Option A)** submission for **Tvaram / InboxValid.ai** Internship Assignment.  
> Built with **Node.js (ES Modules)** and the official `@modelcontextprotocol/sdk`.

---

## 📌 Executive Summary

This repository contains a production-grade **Model Context Protocol (MCP) Server** exposing **InboxValid.ai**'s email verification engine directly to AI Agents (such as Claude Desktop, Cursor, ChatGPT, and custom LLM workflows).

Instead of relying purely on static mock responses, this server features a **real 5-layer validation pipeline** powered by Node.js built-in asynchronous DNS MX record resolution, RFC 5321/5322 syntax validation, role account detection, and disposable provider filtering — with **zero external API dependencies**.

---

## ⚡ Features & Tools Exposed

The MCP server registers **2 core tools**, **1 resource**, and **1 prompt template**:

### 🛠️ 1. `verify_email` (Single Verification)
Validates a single email address and returns structured deliverability analysis + confidence score.

* **Tool Schema:** `verify_email({ address: "user@domain.com" })`
* **Sample Response:**
```json
{
  "status": "valid",
  "score": 0.95,
  "reason": "Email passes all syntax, domain, and MX deliverability checks.",
  "details": {
    "syntax_valid": true,
    "disposable": false,
    "role_account": false,
    "free_provider": false,
    "mx_found": true,
    "mx_records": [
      "smtp.google.com",
      "alt1.aspmx.l.google.com"
    ]
  },
  "timestamp": "2026-08-12T06:41:06.111Z"
}
```

### 🛠️ 2. `verify_email_batch` (Concurrent Batch Verification)
Validates up to 100 email addresses concurrently using `Promise.all` and aggregates summary deliverability metrics.

* **Tool Schema:** `verify_email_batch({ addresses: ["a@google.com", "b@mailinator.com"] })`
* **Sample Response:**
```json
{
  "summary": {
    "total": 2,
    "valid": 1,
    "invalid": 0,
    "risky": 1
  },
  "results": [
    {
      "email": "a@google.com",
      "status": "valid",
      "score": 0.95,
      "reason": "Email passes all syntax, domain, and MX deliverability checks."
    },
    {
      "email": "b@mailinator.com",
      "status": "risky",
      "score": 0.15,
      "reason": "Disposable or temporary email address detected."
    }
  ]
}
```

### 📄 3. MCP Resource: `inboxvalid://policy/deliverability-guidelines`
Exposes InboxValid's deliverability policy and risk score thresholds directly to the LLM context.

### 💬 4. MCP Prompt: `audit_lead_list_emails`
Provides a ready-to-use prompt template for AI agents auditing candidate lead lists.

---

## 🏗️ Architecture & 5-Layer Verification Engine

```
                          ┌────────────────────────┐
                          │   AI Agent (Claude)    │
                          └───────────┬────────────┘
                                      │  JSON-RPC 2.0 (stdio)
                                      ▼
                          ┌────────────────────────┐
                          │  MCP Server (server.js)│
                          └───────────┬────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │   verifier.js Engine   │
                          └───────────┬────────────┘
                                      │
 ┌─────────────────┬──────────────────┼──────────────────┬─────────────────┐
 │                 │                  │                  │                 │
 ▼                 ▼                  ▼                  ▼                 ▼
Layer 1           Layer 2            Layer 3            Layer 4           Layer 5
Syntax & RFC      Disposable Check   Role Account Check Free Provider Tag DNS MX Lookup
(Length & Regex)  (Set O(1) lookup)  (admin/support)    (Gmail/Yahoo)     (Exponential Backoff)
```

### 5 Validation Layers Detailed:
1. **Layer 1: RFC Syntax Guard:** Validates RFC 5321 length rules (total $\le 254$ chars, local part $\le 64$ chars) and RFC 5322 compliant regex.
2. **Layer 2: Disposable Domain Filter:** High-performance $O(1)$ lookup against a curated set of known temporary email providers (e.g., Mailinator, 10MinuteMail, TempMail).
3. **Layer 3: Role Account Detection:** Identifies generic functional prefixes (e.g. `admin@`, `support@`, `info@`, `billing@`).
4. **Layer 4: Free Email Provider Tagging:** Flags public domains (e.g., Gmail, Yahoo, Outlook, ProtonMail).
5. **Layer 5: Asynchronous DNS MX Lookup:** Resolves live Mail Exchange (MX) records via Node.js built-in `dns.promises.resolveMx()` wrapped in an exponential backoff strategy.

---

## 🔄 Error Handling & Retry/Backoff Strategy

### 1. Exponential Backoff with Jitter
DNS resolution across distributed networks can experience transient timeouts or packet loss. To handle this without overloading DNS resolvers:
- **Base Delay:** $300\text{ ms}$
- **Backoff Factor:** $2.0$ (Attempt 1: $300\text{ ms}$, Attempt 2: $600\text{ ms}$, Attempt 3: $1200\text{ ms}$)
- **Jitter:** Multiplied by a random factor between $0.85$ and $1.15$ to prevent thundering herd problems.
- **Max Retries:** 3 attempts before declaring DNS lookup failure.

```javascript
// Located in src/utils/retry.js
const jitter = Math.random() * 0.3 + 0.85;
const currentDelay = Math.round(delay * jitter);
await new Promise((resolve) => setTimeout(resolve, currentDelay));
delay *= backoffFactor;
```

### 2. Graceful Degraded Mode ("Fail-Open")
- **Syntax / Missing MX:** Returns `invalid` (score $0.0$).
- **Disposable Provider:** Returns `risky` (score $0.15$).
- **Role Account:** Returns `risky` (score $0.70$).
- **DNS Timeout / Network Outage:** Rather than crashing or throwing uncaught exceptions, the engine **fails open gracefully** by returning `status: "risky"` with a score of $0.40$ and an explicit reason.

---

## ⚖️ Architectural Choices & Trade-offs

| Choice Made | What We Gained | What We Gave Up |
| :--- | :--- | :--- |
| **Real DNS Lookups over Pure Mock** | High fidelity, realistic output, verifiable deliverability checks | Slight latency ($\sim 50\text{–}150\text{ ms}$) for network I/O vs instantaneous mock |
| **`stdio` Transport Protocol** | Native compatibility with Claude Desktop and Cursor out of the box | Requires child process spawning rather than HTTP remote connection |
| **Zero External NPM Dependencies for Core Logic** | Lightweight footprint, zero supply-chain vulnerability, instant boot | Manually maintained domain set vs third-party cloud API wrapper |
| **Single-Pass Async Engine** | High throughput ($100+$ emails processed concurrently) | No persistent database logging (stateless by design) |

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js v18.0.0 or higher
- npm v9.0.0 or higher

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/your-username/assignment-tvaram.git
cd assignment-tvaram

# 2. Install dependencies
npm install

# 3. Run the unit & integration test suite
npm test
```

### Testing JSON-RPC Protocol (Local Inspector)
```bash
node tests/testMcpProtocol.js
```

### Integrating with Claude Desktop
Add the following configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inboxvalid": {
      "command": "node",
      "args": [
        "/absolute/path/to/assignment-tvaram/src/server.js"
      ]
    }
  }
}
```

---

## 📈 What We'd Build Next (Production Roadmap)

1. **SMTP Deep Handshake (`RCPT TO` checking):** Connect directly to port 25 to verify mailbox existence without sending actual email.
2. **LRU In-Memory Cache:** Cache MX records for $24\text{ hours}$ to reduce redundant DNS network requests for popular domains.
3. **HTTP/SSE Transport Adapter:** Add Server-Sent Events (`SSE`) transport option to allow remote AI agent connections over HTTP/HTTPS.
4. **Rate Limiting & Token Bucket:** Protect downstream DNS resolvers using a leaky-bucket algorithm when bulk calls exceed $1,000\text{ req/min}$.

---

## 📜 License & Evaluation Context
Created as part of the technical evaluation for **Tvaram Private Limited / InboxValid.ai**.
