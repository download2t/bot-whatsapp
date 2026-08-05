import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, getApiBase } from "../lib/api";
import type { MessageLog } from "../types";
import { isOutgoingMessage as isOutgoingMessageShared, mediaFallbackText } from "../lib/whatsappExport";
import "./Messages.css";

type FilterMode = "pending" | "all";

type ConversationRow = {
  phone: string;
  name: string;
  lastMessage: MessageLog | undefined;
  isPending: boolean;
};

const safeGetTime = (dateStr: string | undefined | null) => {
  if (!dateStr) return 0;
  const time = new Date(dateStr).getTime();
  return isNaN(time) ? 0 : time;
};

const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

const safeFormatDateTime = (dateStr: string | undefined | null) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (isToday(d)) return time;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`;
};

const safeRenderContent = (content: any) => {
  if (!content) return "";
  if (typeof content === "object") return "[Mídia/Objeto Não Suportado]";
  return String(content);
};

const previewText = (msg: MessageLog | undefined) => {
  if (!msg) return "";
  if (msg.content) return safeRenderContent(msg.content);
  return mediaFallbackText(msg);
};

// This screen is a monitoring/follow-up radar, not a chat client: it exists to answer "quem me
// mandou mensagem e eu ainda não vi", not to reply in place — replying happens on WhatsApp
// itself. See openPreview()/pendingReviewPhones for the "não lida" bookkeeping this depends on.
export function Messages() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [pendingReviewPhones, setPendingReviewPhones] = useState<Set<string>>(new Set());
  const [pendingConversations, setPendingConversations] = useState<Record<string, MessageLog | undefined>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [filterDate, setFilterDate] = useState("");
  const [loading, setLoading] = useState(true);

  const [previewPhone, setPreviewPhone] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [previewMessages, setPreviewMessages] = useState<MessageLog[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const usesDateFilteredBulkView = filterMode === "all" || Boolean(filterDate);

  const loadBulkMessages = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ pageSize: "2000", sortOrder: "desc" });
      if (filterDate) {
        params.set("startDate", filterDate);
        params.set("endDate", filterDate);
      }
      const data = await apiFetch<any>(`/api/messages/search?${params.toString()}`);
      setMessages(data.items || []);
    } catch (err) {
      console.error("Falha ao carregar mensagens", err);
    } finally {
      setLoading(false);
    }
  };

  // Pending conversations must never silently expire out of view just because a lot of other
  // traffic pushed them out of a bounded recent-messages window — so instead of deriving them
  // from the bulk fetch above, each pending phone gets its own tiny lookup (there's normally
  // only a handful of these at once, so N small requests is cheap and always correct).
  const loadPendingReview = async () => {
    try {
      const phones = await apiFetch<string[]>(`/api/messages/pending-review`);
      setPendingReviewPhones(new Set(phones || []));

      const entries = await Promise.all(
        (phones || []).map(async (phone) => {
          try {
            const data = await apiFetch<any>(
              `/api/messages/search?phoneNumber=${encodeURIComponent(phone)}&pageSize=1&sortOrder=desc`,
            );
            return [phone, data.items?.[0]] as const;
          } catch {
            return [phone, undefined] as const;
          }
        }),
      );
      setPendingConversations(Object.fromEntries(entries));
    } catch (err) {
      console.error("Falha ao carregar conversas pendentes", err);
    }
  };

  useEffect(() => {
    loadPendingReview();
    if (usesDateFilteredBulkView) loadBulkMessages();
    const interval = setInterval(() => {
      loadPendingReview();
      if (usesDateFilteredBulkView) loadBulkMessages();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, filterDate]);

  const conversationsFromBulk = useMemo(() => {
    const groups: Record<string, MessageLog[]> = {};
    messages.forEach((msg) => {
      if (!msg.phoneNumber) return;
      if (!groups[msg.phoneNumber]) groups[msg.phoneNumber] = [];
      groups[msg.phoneNumber].push(msg);
    });
    return groups;
  }, [messages]);

  const resolveDisplayName = (phone: string, lastMessage: MessageLog | undefined, msgs?: MessageLog[]) => {
    if (msgs) {
      const clientMsg = msgs.find((m) => m.contactName && m.direction?.toLowerCase() !== "outgoing");
      if (clientMsg?.contactName) return clientMsg.contactName;
    }
    return lastMessage?.contactName || phone;
  };

  const conversationList = useMemo<ConversationRow[]>(() => {
    const base: ConversationRow[] = usesDateFilteredBulkView
      ? Object.entries(conversationsFromBulk).map(([phone, msgs]) => {
          const lastMessage = [...msgs].sort((a, b) => safeGetTime(b.timestampUtc) - safeGetTime(a.timestampUtc))[0];
          return {
            phone,
            lastMessage,
            name: resolveDisplayName(phone, lastMessage, msgs),
            isPending: pendingReviewPhones.has(phone),
          };
        })
      : Array.from(pendingReviewPhones).map((phone) => {
          const lastMessage = pendingConversations[phone];
          return { phone, lastMessage, name: resolveDisplayName(phone, lastMessage), isPending: true };
        });

    return base
      .filter((c) => filterMode !== "pending" || c.isPending)
      .filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
        return safeGetTime(b.lastMessage?.timestampUtc) - safeGetTime(a.lastMessage?.timestampUtc);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsFromBulk, pendingConversations, pendingReviewPhones, filterMode, usesDateFilteredBulkView, searchTerm]);

  const markPendingLocally = (phone: string) => {
    if (!pendingReviewPhones.has(phone)) return;
    setPendingReviewPhones((prev) => {
      const next = new Set(prev);
      next.delete(phone);
      return next;
    });
    apiFetch(`/api/messages/mark-read`, {
      method: "POST",
      body: JSON.stringify({ phoneNumber: phone }),
    }).catch((err) => console.error("Falha ao marcar conversa como lida", err));
  };

  const openPreview = async (row: ConversationRow) => {
    setPreviewPhone(row.phone);
    setPreviewName(row.name);
    setPreviewLoading(true);
    markPendingLocally(row.phone);

    try {
      const data = await apiFetch<any>(
        `/api/messages/search?phoneNumber=${encodeURIComponent(row.phone)}&pageSize=50&sortOrder=desc`,
      );
      setPreviewMessages([...(data.items || [])].reverse());
    } catch (err) {
      console.error("Falha ao carregar prévia da conversa", err);
      setPreviewMessages([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewPhone(null);
    setPreviewMessages([]);
  };

  const isOutgoingMessage = isOutgoingMessageShared;
  const getBubbleClass = (msg: MessageLog) => (isOutgoingMessage(msg) ? "bubble outgoing" : "bubble incoming");

  const resolveMediaUrl = (mediaUrl: string) => (mediaUrl.startsWith("http") ? mediaUrl : `${getApiBase()}${mediaUrl}`);
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
      return <video src={url} controls className="bubble-media bubble-media-video" />;
    }

    return (
      <a href={url} target="_blank" rel="noreferrer" className="bubble-media bubble-media-file">
        📄 {msg.mediaFileName ?? "Arquivo"}
      </a>
    );
  };

  return (
    <div className="msg-page container">
      <div className="msg-page-header">
        <h1>💬 Mensagens</h1>
        <button className="btn btn-primary" onClick={() => navigate("/messages/bulk")}>
          ➕ Enviar Mensagens em Lote
        </button>
      </div>

      <div className="msg-toolbar">
        <div className="msg-filter-toggle">
          <button
            type="button"
            className={filterMode === "pending" ? "active" : ""}
            onClick={() => setFilterMode("pending")}
          >
            🔴 Pendentes
          </button>
          <button type="button" className={filterMode === "all" ? "active" : ""} onClick={() => setFilterMode("all")}>
            Todas
          </button>
        </div>

        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          title="Ver o que rolou num dia específico"
        />
        {filterDate && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilterDate("")}>
            Limpar data
          </button>
        )}

        <input
          type="text"
          className="msg-search-input"
          placeholder="Buscar por nome ou telefone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && usesDateFilteredBulkView ? (
        <div className="loading">Carregando...</div>
      ) : conversationList.length === 0 ? (
        <div className="empty-conversations">
          <p>
            {filterMode === "pending"
              ? "Nenhuma conversa pendente de revisão 🎉"
              : "Nenhuma conversa encontrada"}
          </p>
        </div>
      ) : (
        <div className="msg-card-grid">
          {conversationList.map((row) => (
            <div key={row.phone} className={`msg-card ${row.isPending ? "pending-review" : ""}`} onClick={() => openPreview(row)}>
              <div className="avatar">{row.name[0]?.toUpperCase() || "U"}</div>
              <div className="msg-card-info">
                <div className="msg-card-top">
                  <strong>{row.name}</strong>
                  <span className="msg-card-time">{safeFormatDateTime(row.lastMessage?.timestampUtc)}</span>
                </div>
                <p className="msg-card-preview">{previewText(row.lastMessage)}</p>
              </div>
              {row.isPending && (
                <span className="unread-dot" title="Automação agiu nessa conversa — ainda não revisada" />
              )}
            </div>
          ))}
        </div>
      )}

      {previewPhone && (
        <div className="msg-modal-overlay" onClick={closePreview}>
          <div className="msg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msg-modal-header">
              <div className="header-contact-info">
                <div className="avatar-small">{previewName[0]?.toUpperCase() || "U"}</div>
                <div>
                  <strong>{previewName}</strong>
                  <small>{previewPhone}</small>
                </div>
              </div>
              <button type="button" className="btn-icon" onClick={closePreview}>
                ✕
              </button>
            </div>

            <div className="msg-modal-body">
              {previewLoading ? (
                <div className="loading">Carregando...</div>
              ) : previewMessages.length === 0 ? (
                <p className="messages-hint">Nenhuma mensagem encontrada.</p>
              ) : (
                previewMessages.map((msg, index) => (
                  <div key={msg.id || `msg-${index}`} className={getBubbleClass(msg)}>
                    {renderMedia(msg)}
                    {msg.content && <div className="bubble-text">{safeRenderContent(msg.content)}</div>}
                    <span className="time">{safeFormatDateTime(msg.timestampUtc)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="msg-modal-footer">
              <small>Só leitura — para responder, use o WhatsApp.</small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
