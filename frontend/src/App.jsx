import { useState, useEffect, useRef } from "react";
import Cookies from "universal-cookie";

const cookies = new Cookies();
const MAX_CHARS = 300;
const WS_URL = "ws://localhost:8080";

// ── tiny design tokens ──────────────────────────────────────────────
const colors = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  border: "#2a2a2a",
  accent: "#7c3aed",
  accentHover: "#6d28d9",
  meBubble: "#7c3aed",
  themBubble: "#262626",
  text: "#e5e5e5",
  muted: "#737373",
  error: "#ef4444",
  success: "#22c55e",
};

// ── reusable micro-components ───────────────────────────────────────
function StatusDot({ connected }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: connected ? colors.success : colors.error,
        marginRight: 8,
        boxShadow: connected ? `0 0 6px ${colors.success}` : "none",
      }}
    />
  );
}

function Tag({ label, onRemove }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        backgroundColor: "#2e1065",
        color: "#c4b5fd",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 13,
      }}
    >
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          color: "#c4b5fd",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          fontSize: 14,
        }}
      >
        ×
      </button>
    </span>
  );
}

// ── main app ────────────────────────────────────────────────────────
export default function App() {
  const [textMsg, setTextMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const [matched, setMatched] = useState(false);
  const [statusText, setStatusText] = useState("Connecting...");
  const [connected, setConnected] = useState(false);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [commonInterests, setCommonInterests] = useState([]);
  const [waiting, setWaiting] = useState(false);

  // interest input state
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState([]);

  const socketRef = useRef(null);
  const sessionKeyRef = useRef("");
  const bottomRef = useRef(null); // auto-scroll anchor
  const typingTimer = useRef(null); // debounce typing events
  const isTypingRef = useRef(false); // track last sent typing state

  // ── websocket setup ──────────────────────────────────────────────
  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnected(true));
    socket.addEventListener("close", () => {
      setConnected(false);
      setMatched(false);
      setStatusText("Disconnected from the server.")
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "STATUS_CHANGE":
            setStatusText(data.payload.message);
            break;

          case "INIT_SESSION":
            cookies.set("user_id", data.payload.user_id, {
              path: "/",
              maxAge: 86400,
            });
            setStatusText("Ready. Add interests or jump straight in.");
            break;

          case "MATCHED":
            setWaiting(false);
            sessionKeyRef.current = data.payload.session_key;
            setCommonInterests(data.payload.common_interests || []);
            setMatched(true);
            setMessages([]);
            setStatusText("Matched! Say hello.");
            break;

          case "MESSAGE":
            setMessages((prev) => [
              ...prev,
              { sender: "them", text: data.payload.text },
            ]);
            setStrangerTyping(false);
            break;

          case "TYPING":
            setStrangerTyping(data.payload.is_typing);
            break;

          case "USER_DISCONNECTED":
            setStatusText(data.payload.message);
            setMatched(false);
            setStrangerTyping(false);
            sessionKeyRef.current = "";
            setMessages((prev) => [
              ...prev,
              { sender: "system", text: "Stranger has left the chat." },
            ]);
            break;

          case "ERROR":
            setStatusText(`⚠ ${data.payload.message}`);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error("WS parse error:", err);
      }
    });

    return () => socket.close();
  }, []);

  // ── auto-scroll to bottom on new messages ────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, strangerTyping]);

  // ── typing indicator logic ───────────────────────────────────────
  function sendTypingEvent(isTyping) {
    if (
      isTypingRef.current === isTyping ||
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN ||
      !sessionKeyRef.current
    )
      return;

    isTypingRef.current = isTyping;
    socketRef.current.send(
      JSON.stringify({
        type: "typing",
        payload: { session_key: sessionKeyRef.current, is_typing: isTyping },
      }),
    );
  }

  function handleInputChange(e) {
    setTextMsg(e.target.value);

    // Send "is typing" immediately
    sendTypingEvent(true);

    // Debounce "stopped typing" — fires 1.5s after last keystroke
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTypingEvent(false), 1500);
  }

  // ── interest tag management ──────────────────────────────────────
  function addInterest() {
    const val = interestInput.trim().toLowerCase();
    if (!val || interests.includes(val) || interests.length >= 5) return;
    setInterests((prev) => [...prev, val]);
    setInterestInput("");
  }

  function removeInterest(tag) {
    setInterests((prev) => prev.filter((i) => i !== tag));
  }

  // ── join / send / leave ──────────────────────────────────────────
  function joinQueue() {
    setWaiting(true);
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(
      JSON.stringify({
        type: "join",
        payload: { interests },
      }),
    );
  }

  function sendMsg() {
    const text = textMsg.trim();
    if (!text || socketRef.current?.readyState !== WebSocket.OPEN) return;

    socketRef.current.send(
      JSON.stringify({
        type: "message",
        payload: { session_key: sessionKeyRef.current, text },
      }),
    );

    setMessages((prev) => [...prev, { sender: "me", text }]);
    setTextMsg("");
    clearTimeout(typingTimer.current);
    sendTypingEvent(false);
  }

  function handleLeave() {
    // socketRef.current?.close();
    setMessages([]);
    setMatched(false);
    sessionKeyRef.current = "";
    setCommonInterests([]);
    setStatusText("Disconnected, find new chat partner...");
  }

  function leaveQueue() {
    setWaiting(false);
    socketRef.current.send(
      JSON.stringify({
        type: "leave_wait_queue",
      }),
    );
  }

  const charsLeft = MAX_CHARS - textMsg.length;
  const charsColor =
    charsLeft < 30 ? colors.error : charsLeft < 60 ? "#f59e0b" : colors.muted;

  // ── render ───────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: colors.bg,
        color: colors.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── header ── */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <span style={{ fontWeight: 600, fontSize: 16 }}>
              Anonymous Chat
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 13,
              color: colors.muted,
            }}
          >
            <StatusDot connected={connected} />
            {statusText}
          </div>
        </div>

        {/* ── lobby (pre-match) ── */}
        {!matched && (
          <div
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* common interests shown after being matched previously */}
            <div>
              <label
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Add interests (optional, max 5)
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addInterest()}
                  placeholder="e.g. gaming, music, travel"
                  maxLength={20}
                  style={{
                    flex: 1,
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: colors.text,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  onClick={addInterest}
                  disabled={interests.length >= 5}
                  style={{
                    backgroundColor: colors.border,
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 14px",
                    color: colors.text,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Add
                </button>
              </div>
              {interests.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {interests.map((tag) => (
                    <Tag
                      key={tag}
                      label={tag}
                      onRemove={() => removeInterest(tag)}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={joinQueue}
              disabled={!connected}
              style={{
                backgroundColor: colors.accent,
                border: "none",
                borderRadius: 10,
                padding: "12px 0",
                color: "white",
                fontSize: 15,
                fontWeight: 600,
                cursor: connected ? "pointer" : "not-allowed",
                opacity: connected ? 1 : 0.5,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.target.style.backgroundColor = colors.accentHover)
              }
              onMouseLeave={(e) =>
                (e.target.style.backgroundColor = colors.accent)
              }
            >
              {connected ? "Find a Stranger →" : "Connecting..."}
            </button>

            {/* -- button to leave waiting queue */}
            {waiting && (
              <button
                onClick={leaveQueue}
                style={{
                  backgroundColor: colors.accent,
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 0",
                  color: "white",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: connected ? "pointer" : "not-allowed",
                  opacity: connected ? 1 : 0.5,
                  transition: "background 0.15s",
                }}
              >
                Stop Waiting
              </button>
            )}
          </div>
        )}

        {/* ── chat view (post-match) ── */}
        {matched && (
          <>
            {/* common interests banner */}
            {commonInterests.length > 0 && (
              <div
                style={{
                  padding: "8px 20px",
                  backgroundColor: "#1e1b4b",
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: 13,
                  color: "#a5b4fc",
                  textAlign: "center",
                }}
              >
                You both like:{" "}
                {commonInterests.map((i) => (
                  <strong key={i} style={{ marginLeft: 4 }}>
                    {i}
                  </strong>
                ))}
              </div>
            )}

            {/* messages */}
            <div
              style={{
                height: 360,
                overflowY: "auto",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {messages.map((msg, i) => {
                if (msg.sender === "system") {
                  return (
                    <div
                      key={i}
                      style={{
                        textAlign: "center",
                        color: colors.muted,
                        fontSize: 12,
                        margin: "4px 0",
                      }}
                    >
                      {msg.text}
                    </div>
                  );
                }
                const isMe = msg.sender === "me";
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isMe ? "flex-end" : "flex-start",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: isMe
                          ? colors.meBubble
                          : colors.themBubble,
                        color: colors.text,
                        padding: "9px 14px",
                        borderRadius: isMe
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                        maxWidth: "72%",
                        fontSize: 14,
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                    </span>
                  </div>
                );
              })}

              {/* typing indicator */}
              {strangerTyping && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <span
                    style={{
                      backgroundColor: colors.themBubble,
                      padding: "9px 14px",
                      borderRadius: "16px 16px 16px 4px",
                      fontSize: 20,
                      letterSpacing: 2,
                      color: colors.muted,
                    }}
                  >
                    ···
                  </span>
                </div>
              )}

              {/* invisible anchor for auto-scroll */}
              <div ref={bottomRef} />
            </div>

            {/* input bar */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: `1px solid ${colors.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={textMsg}
                  onChange={handleInputChange}
                  onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                  maxLength={MAX_CHARS}
                  placeholder="Type a message..."
                  style={{
                    flex: 1,
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: colors.text,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  onClick={sendMsg}
                  style={{
                    backgroundColor: colors.accent,
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 18px",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  Send
                </button>
                <button
                  onClick={handleLeave}
                  style={{
                    backgroundColor: "transparent",
                    border: `1px solid #3f3f3f`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  Leave
                </button>
              </div>
              <div
                style={{ textAlign: "right", fontSize: 12, color: charsColor }}
              >
                {charsLeft} / {MAX_CHARS}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
