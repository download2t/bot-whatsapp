import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import type { MessageLog } from "../types";
import "./Messages.css";

export function Messages() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [whatsAppOptions, setWhatsAppOptions] = useState<string[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [whatsAppFilter, setWhatsAppFilter] = useState("all");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const data = await apiFetch<any>(`/api/messages/search?pageSize=2000`);
      setMessages(data.items || []);
      const options = await apiFetch<{ numbers: string[] }>(
        `/api/messages/whatsapp-options`,
      );
      setWhatsAppOptions(options.numbers || []);
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

      const matchesWhatsApp =
        whatsAppFilter === "all" || msg.whatsAppNumber === whatsAppFilter;

      const displayName = msg.contactName || msg.phoneNumber;
      const searchSource = `${displayName} ${msg.phoneNumber}`.toLowerCase();

      if (matchesWhatsApp && searchSource.includes(searchTerm.toLowerCase())) {
        if (!groups[msg.phoneNumber]) groups[msg.phoneNumber] = [];
        groups[msg.phoneNumber].push(msg);
      }
    });
    return groups;
  }, [messages, searchTerm, whatsAppFilter]);

  const getDisplayName = (phone: string) => {
    const msgs = conversations[phone] || [];
    const clientMsg = msgs.find(
      (m) => m.contactName && m.direction?.toLowerCase() !== "outgoing",
    );
    return clientMsg?.contactName || phone;
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activePhone || isSending) return;

    const messageToSend = newMessage;
    setNewMessage("");
    setIsSending(true);

    try {
      await apiFetch(`/api/messages/bulk/send`, {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: activePhone,
          message: messageToSend,
          sourceWhatsAppNumber:
            whatsAppFilter !== "all" ? whatsAppFilter : null,
        }),
      });
      await loadData();
    } catch (err) {
      alert("Erro ao enviar mensagem");
      setNewMessage(messageToSend);
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

  const getBubbleClass = (msg: MessageLog) => {
    const isOutgoing =
      msg.direction?.toLowerCase() === "outgoing" ||
      msg.status?.toLowerCase() === "sent";
    return isOutgoing ? "bubble outgoing" : "bubble incoming";
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

        <div className="wa-filter-container">
          <select
            value={whatsAppFilter}
            onChange={(e) => {
              setWhatsAppFilter(e.target.value);
              setActivePhone(null);
            }}
          >
            <option value="all">Todos os WhatsApps</option>
            {whatsAppOptions.map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
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
                    <p>{safeRenderContent(lastMsg?.content)}</p>
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

            <div className="wa-chat-area">
              {[...(conversations[activePhone] || [])]
                .sort(
                  (a, b) =>
                    safeGetTime(a.timestampUtc) - safeGetTime(b.timestampUtc),
                )
                .map((msg, index) => (
                  <div
                    key={msg.id || `msg-${index}`}
                    className={getBubbleClass(msg)}
                  >
                    {safeRenderContent(msg.content)}
                    <span className="time">
                      {safeFormatTime(msg.timestampUtc)}
                    </span>
                  </div>
                ))}
              <div ref={chatEndRef} />
            </div>

            <div className="wa-chat-input">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder="Digite uma mensagem"
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={isSending || !newMessage.trim()}
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
