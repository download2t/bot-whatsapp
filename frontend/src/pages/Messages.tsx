import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getApiBase } from "../lib/api";
import type { MessageLog } from "../types";
import { EmojiPicker } from "../components/EmojiPicker";
import { MediaAttachment, type SelectedMedia } from "../components/MediaAttachment";
import { formatExportLine, isOutgoingMessage as isOutgoingMessageShared, mediaFallbackText, resolveSenderName } from "../lib/whatsappExport";
import "./Messages.css";

export function Messages() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [mediaResetKey, setMediaResetKey] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  const insertEmoji = (emoji: string) => {
    const input = messageInputRef.current;
    if (!input) {
      setNewMessage((current) => current + emoji);
      return;
    }

    const start = input.selectionStart ?? newMessage.length;
    const end = input.selectionEnd ?? newMessage.length;
    const next = newMessage.slice(0, start) + emoji + newMessage.slice(end);
    setNewMessage(next);

    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + emoji.length;
      input.setSelectionRange(cursor, cursor);
    });
  };

  const loadData = async () => {
    try {
      const data = await apiFetch<any>(`/api/messages/search?pageSize=2000`);
      setMessages(data.items || []);
    } catch (err) {
      console.error("Falha ao recarregar mensagens", err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activePhone, messages]);

  // Fechar sidebar ao selecionar uma conversa no mobile
  useEffect(() => {
    if (activePhone && window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  }, [activePhone]);

  const conversations = useMemo(() => {
    const groups: Record<string, MessageLog[]> = {};
    messages.forEach((msg) => {
      if (!msg.phoneNumber) return;

      const displayName = msg.contactName || msg.phoneNumber;
      const searchSource = `${displayName} ${msg.phoneNumber}`.toLowerCase();

      if (searchSource.includes(searchTerm.toLowerCase())) {
        if (!groups[msg.phoneNumber]) groups[msg.phoneNumber] = [];
        groups[msg.phoneNumber].push(msg);
      }
    });
    return groups;
  }, [messages, searchTerm]);

  const getDisplayName = (phone: string) => {
    const msgs = conversations[phone] || [];
    const clientMsg = msgs.find(
      (m) => m.contactName && m.direction?.toLowerCase() !== "outgoing",
    );
    return clientMsg?.contactName || phone;
  };

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !media) || !activePhone || isSending) return;

    const messageToSend = newMessage;
    const mediaToSend = media;
    setNewMessage("");
    setMedia(null);
    setMediaResetKey((key) => key + 1);
    setIsSending(true);

    try {
      await apiFetch(`/api/messages/bulk/send`, {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: activePhone,
          message: messageToSend,
          mediaBase64: mediaToSend?.base64 ?? null,
          mediaMimeType: mediaToSend?.mimeType ?? null,
          mediaFileName: mediaToSend?.fileName ?? null,
        }),
      });
      await loadData();
    } catch (err) {
      alert("Erro ao enviar mensagem");
      setNewMessage(messageToSend);
      setMedia(mediaToSend);
    } finally {
      setIsSending(false);
    }
  };

  const safeGetTime = (dateStr: string | undefined | null) => {
    if (!dateStr) return 0;
    const time = new Date(dateStr).getTime();
    return isNaN(time) ? 0 : time;
  };

  const safeFormatTime = (dateStr: string | undefined | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const safeRenderContent = (content: any) => {
    if (!content) return "";
    if (typeof content === "object") return "[Mídia/Objeto Não Suportado]";
    return String(content);
  };

  const isOutgoingMessage = isOutgoingMessageShared;

  const getBubbleClass = (msg: MessageLog) =>
    isOutgoingMessage(msg) ? "bubble outgoing" : "bubble incoming";

  const resolveMediaUrl = (mediaUrl: string) =>
    mediaUrl.startsWith("http") ? mediaUrl : `${getApiBase()}${mediaUrl}`;

  const isImageMedia = (mimeType?: string | null) => Boolean(mimeType?.startsWith("image/"));
  const isVideoMedia = (mimeType?: string | null) => Boolean(mimeType?.startsWith("video/"));

  const renderMedia = (msg: MessageLog) => {
    if (!msg.mediaUrl) return null;
    const url = resolveMediaUrl(msg.mediaUrl);

    if (isImageMedia(msg.mediaMimeType)) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="bubble-media">
          <img src={url} alt={msg.mediaFileName ?? "imagem"} />
        </a>
      );
    }

    if (isVideoMedia(msg.mediaMimeType)) {
      return (
        <video src={url} controls className="bubble-media bubble-media-video" />
      );
    }

    return (
      <a href={url} target="_blank" rel="noreferrer" className="bubble-media bubble-media-file">
        📄 {msg.mediaFileName ?? "Arquivo"}
      </a>
    );
  };

  const previewText = (msg: MessageLog | undefined) => {
    if (!msg) return "";
    if (msg.content) return safeRenderContent(msg.content);
    return mediaFallbackText(msg);
  };

  // Checkmarks like real WhatsApp: single grey = sent, double grey = delivered,
  // double blue = read/played. Only shown for our own outgoing messages.
  const renderAckTicks = (msg: MessageLog) => {
    if (!isOutgoingMessage(msg)) return null;

    const ack = msg.ackStatus?.toLowerCase();
    if (ack === "read" || ack === "played") {
      return <span className="ack-ticks ack-read">✓✓</span>;
    }
    if (ack === "delivered") {
      return <span className="ack-ticks">✓✓</span>;
    }
    if (ack === "sent" || ack === "pending" || !ack) {
      return <span className="ack-ticks">✓</span>;
    }
    return null;
  };

  const activeMessages = useMemo(
    () =>
      [...(conversations[activePhone ?? ""] || [])].sort(
        (a, b) => safeGetTime(a.timestampUtc) - safeGetTime(b.timestampUtc),
      ),
    [conversations, activePhone],
  );

  // Mirrors what WhatsApp Web itself produces when you select part of a conversation and copy
  // it: "[HH:mm, DD/MM/YYYY] Nome: mensagem" per line, plain text, so pasting it anywhere else
  // (another portal, a document) keeps the same shape people already recognize.
  const handleCopyConversation = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !chatAreaRef.current) return;

    const myDisplayName = localStorage.getItem("bot_user") || "Você";
    const bubbleEls = Array.from(
      chatAreaRef.current.querySelectorAll<HTMLElement>("[data-copy-index]"),
    );

    const lines: string[] = [];
    bubbleEls.forEach((el) => {
      if (!selection.containsNode(el, true)) return;
      const msg = activeMessages[Number(el.dataset.copyIndex)];
      if (!msg) return;

      const sender = resolveSenderName(msg, activePhone ?? "", myDisplayName);
      const line = formatExportLine(msg, sender);
      if (line) lines.push(line);
    });

    if (lines.length === 0) return;

    event.preventDefault();
    event.clipboardData.setData("text/plain", lines.join("\n"));
  };

  // Alternar sidebar no mobile
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Voltar para lista de conversas no mobile
  const backToConversations = () => {
    setIsSidebarOpen(true);
  };

  return (
    <div className="wa-app">
      {/* Overlay para fechar sidebar no mobile */}
      {isSidebarOpen && window.innerWidth <= 768 && (
        <div
          className="wa-overlay"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`wa-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top-actions">
          <button
            className="btn-icon"
            onClick={() => navigate("/messages/bulk")}
          >
            ➕ Enviar Mensagens em Lote
          </button>
        </div>

        <div className="wa-search-container">
          <input
            type="text"
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="wa-chat-list">
          {Object.keys(conversations).length === 0 ? (
            <div className="empty-conversations">
              <p>Nenhuma conversa encontrada</p>
            </div>
          ) : (
            Object.keys(conversations).map((phone) => {
              const lastMsg = conversations[phone].slice(-1)[0];
              return (
                <div
                  key={phone}
                  className={`wa-chat-item ${activePhone === phone ? "active" : ""}`}
                  onClick={() => setActivePhone(phone)}
                >
                  <div className="avatar">
                    {getDisplayName(phone)[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="chat-info">
                    <strong>{getDisplayName(phone)}</strong>
                    <p>{previewText(lastMsg)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Área Principal de Chat */}
      <div className={`wa-main ${activePhone ? "active" : ""}`}>
        {activePhone ? (
          <>
            <div className="wa-main-header">
              {/* Botão hambúrguer no mobile */}
              <button className="btn-hamburger" onClick={toggleSidebar}>
                ☰
              </button>

              {/* Botão voltar no mobile */}
              <button className="btn-back" onClick={backToConversations}>
                ←
              </button>

              <div className="header-contact-info">
                <div className="avatar-small">
                  {getDisplayName(activePhone)[0]?.toUpperCase() || "U"}
                </div>
                <strong>{getDisplayName(activePhone)}</strong>
              </div>
            </div>

            <div className="wa-chat-area" ref={chatAreaRef} onCopy={handleCopyConversation}>
              {activeMessages.map((msg, index) => (
                <div
                  key={msg.id || `msg-${index}`}
                  className={getBubbleClass(msg)}
                  data-copy-index={index}
                >
                  {renderMedia(msg)}
                  {msg.content && <div className="bubble-text">{safeRenderContent(msg.content)}</div>}
                  <span className="time">
                    {safeFormatTime(msg.timestampUtc)}
                    {renderAckTicks(msg)}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {media && (
              <div className="wa-chat-attachment-preview">
                {media.previewUrl ? (
                  <img src={media.previewUrl} alt={media.fileName} />
                ) : (
                  <span className="wa-chat-attachment-icon">📄</span>
                )}
                <span>{media.fileName}</span>
                <button type="button" onClick={() => { setMedia(null); setMediaResetKey((key) => key + 1); }}>✕</button>
              </div>
            )}

            <div className="wa-chat-input">
              <EmojiPicker onSelect={insertEmoji} disabled={isSending} />
              <MediaAttachment key={mediaResetKey} onChange={setMedia} disabled={isSending} />
              <input
                ref={messageInputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Digite uma mensagem"
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={isSending || (!newMessage.trim() && !media)}
              >
                {isSending ? "⏳" : "Enviar"}
              </button>
            </div>
          </>
        ) : (
          <div className="wa-empty">
            <div className="empty-content">
              <div className="empty-icon">💬</div>
              <h2>WhatsApp Web</h2>
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
