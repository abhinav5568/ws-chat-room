import { useState, useEffect, useRef } from "react";
import Cookies from "universal-cookie";

const cookies = new Cookies();
const MAX_CHARS = 300;
const WS_URL = "ws://localhost:8080";

function StatusDot({ connected }) {
  return (
    <span className="relative flex items-center justify-center w-2 h-2 mr-2">
      {connected && (
        <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      )}
      <span
        className={`relative inline-flex w-2 h-2 rounded-full ${
          connected ? "bg-emerald-400" : "bg-zinc-600"
        }`}
      />
    </span>
  );
}

function Tag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
      {label}
      <button
        onClick={onRemove}
        className="text-zinc-500 hover:text-zinc-200 transition-colors leading-none ml-0.5 cursor-pointer"
      >
        ×
      </button>
    </span>
  );
}

export default function App() {
  const [textMsg, setTextMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const [matched, setMatched] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [statusText, setStatusText] = useState("Connecting...");
  const [connected, setConnected] = useState(false);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [commonInterests, setCommonInterests] = useState([]);
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState([]);

  const socketRef = useRef(null);
  const sessionKeyRef = useRef("");
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => setConnected(true));

    socket.addEventListener("close", () => {
      setConnected(false);
      setMatched(false);
      setWaiting(false);
      setStatusText("Disconnected.");
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
            setStatusText("Ready.");
            break;

          case "MATCHED":
            setWaiting(false);
            sessionKeyRef.current = data.payload.session_key;
            setCommonInterests(data.payload.common_interests || []);
            setMatched(true);
            setMessages([]);
            setStatusText("Connected to a stranger.");
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

          case "LEFT_SESSION":
            setMatched(false);
            setMessages([]);
            sessionKeyRef.current = "";
            setCommonInterests([]);
            setStrangerTyping(false);
            setStatusText("You left. Find someone new?");
            break;

          case "USER_DISCONNECTED":
            setMatched(false);
            setStrangerTyping(false);
            sessionKeyRef.current = "";
            setCommonInterests([]); // BUG FIX: was missing, left stale interests
            setMessages((prev) => [
              ...prev,
              { sender: "system", text: "Stranger disconnected." },
            ]);
            setStatusText("Stranger left.");
            break;

          case "ERROR":
            setStatusText(data.payload.message);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, strangerTyping]);

  function sendTypingEvent(isTyping) {
    if (
      isTypingRef.current === isTyping ||
      socketRef.current?.readyState !== WebSocket.OPEN ||
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
    sendTypingEvent(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTypingEvent(false), 1500);
  }

  function addInterest() {
    const val = interestInput.trim().toLowerCase();
    if (!val || interests.includes(val) || interests.length >= 5) return;
    setInterests((prev) => [...prev, val]);
    setInterestInput("");
  }

  function removeInterest(tag) {
    setInterests((prev) => prev.filter((i) => i !== tag));
  }

  function joinQueue() {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    setWaiting(true);
    socketRef.current.send(
      JSON.stringify({ type: "join", payload: { interests } }),
    );
  }

  function leaveQueue() {
    setWaiting(false);
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "leave_wait_queue" }));
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
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    sessionKeyRef.current = ""; // no session is there
    socketRef.current.send(
      JSON.stringify({
        type: "leave_session",
        payload: { session_key: sessionKeyRef.current },
      }),
    );
  }

  const charsLeft = MAX_CHARS - textMsg.length;
  const charsColor =
    charsLeft < 30
      ? "text-red-400"
      : charsLeft < 60
        ? "text-amber-400"
        : "text-zinc-600";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-medium tracking-wide">anon chat</span>
          <div className="flex items-center">
            <StatusDot connected={connected} />
            <span className="text-xs font-mono text-zinc-500">
              {statusText}
            </span>
          </div>
        </div>

        {/* Lobby */}
        {!matched && (
          <div className="p-5 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-500">
                interests{" "}
                <span className="text-zinc-700">— optional, max 5</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addInterest()}
                  placeholder="gaming, music, travel..."
                  maxLength={20}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors"
                />
                <button
                  onClick={addInterest}
                  disabled={interests.length >= 5}
                  className="px-3 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>
              {interests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
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

            {!waiting ? (
              <button
                onClick={joinQueue}
                disabled={!connected}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {connected ? "Find a stranger" : "Connecting..."}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-zinc-500">
                  <span className="animate-pulse">●</span>
                  Searching...
                </div>
                <button
                  onClick={leaveQueue}
                  className="w-full py-2 rounded-lg text-sm text-zinc-500 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {matched && (
          <>
            {commonInterests.length > 0 && (
              <div className="px-5 py-2 border-b border-zinc-800 text-xs text-zinc-500 text-center">
                both into:
                {commonInterests.map((i) => (
                  <span key={i} className="ml-1 text-zinc-300 font-medium">
                    {i}
                  </span>
                ))}
              </div>
            )}

            <div className="h-80 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {messages.map((msg, i) => {
                if (msg.sender === "system") {
                  return (
                    <div
                      key={i}
                      className="text-center text-xs text-zinc-600 my-1"
                    >
                      {msg.text}
                    </div>
                  );
                }
                const isMe = msg.sender === "me";
                return (
                  <div
                    key={i}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <span
                      className={`px-3.5 py-2 text-sm leading-relaxed max-w-[72%] wrap-break-words ${
                        isMe
                          ? "bg-zinc-100 text-zinc-900 rounded-2xl rounded-br-sm"
                          : "bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm"
                      }`}
                    >
                      {msg.text}
                    </span>
                  </div>
                );
              })}

              {strangerTyping && (
                <div className="flex justify-start">
                  <span className="px-3.5 py-2 bg-zinc-800 rounded-2xl rounded-bl-sm text-zinc-500 text-lg tracking-widest">
                    ···
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <div className="px-4 pb-4 pt-3 border-t border-zinc-800 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={textMsg}
                  onChange={handleInputChange}
                  onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                  maxLength={MAX_CHARS}
                  placeholder="Message..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-700 outline-none focus:border-zinc-600 transition-colors"
                />
                <button
                  onClick={sendMsg}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-900 hover:bg-white transition-colors cursor-pointer"
                >
                  Send
                </button>
                <button
                  onClick={handleLeave}
                  className="px-3 py-2 rounded-lg text-sm text-zinc-600 border border-zinc-800 hover:border-zinc-700 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Leave
                </button>
              </div>
              <div className={`text-right text-xs font-mono ${charsColor}`}>
                {charsLeft}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
