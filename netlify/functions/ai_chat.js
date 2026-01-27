const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 20;

const rateState = new Map();

function getClientIp(event) {
  const headers = event.headers || {};
  return (
    headers["x-forwarded-for"]?.split(",")[0] ||
    headers["client-ip"] ||
    headers["x-real-ip"] ||
    "unknown"
  );
}

function rateLimit(ip) {
  const now = Date.now();
  const entry = rateState.get(ip) || { count: 0, ts: now };
  if (now - entry.ts > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.ts = now;
  }
  entry.count += 1;
  rateState.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const ip = getClientIp(event);
  if (!rateLimit(ip)) {
    return jsonResponse(429, { error: "Rate limit exceeded" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.slice(0, 20) : [];
  if (messages.length === 0) {
    return jsonResponse(400, { error: "No messages provided" });
  }

  for (const msg of messages) {
    if (!msg || !msg.role || !msg.content) {
      return jsonResponse(400, { error: "Invalid message format" });
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return jsonResponse(400, { error: "Invalid role" });
    }
    if (msg.role === "user" && String(msg.content).length > 2000) {
      return jsonResponse(400, { error: "Message too long" });
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing OpenAI API key" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Du hilfst beim Schreiben kurzer On-Screen Texte für VFX/Animations-Logs. Antworte kurz, präzise, deutsch.",
          },
          ...messages,
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return jsonResponse(response.status, {
        error: data?.error?.message || "OpenAI request failed",
      });
    }

    const reply = data.output_text || "";
    return jsonResponse(200, { reply });
  } catch (error) {
    return jsonResponse(500, { error: error.message || "Server error" });
  }
};
