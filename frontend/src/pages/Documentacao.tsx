import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import type { MessageLog } from "../types";
import { dateKey, dateKeyLabel, formatExportLine, resolveSenderName } from "../lib/whatsappExport";
import "./Documentacao.css";

export function Documentacao() {
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<any>(`/api/messages/search?pageSize=2000`);
        setMessages(data.items || []);
      } catch (err) {
        console.error("Falha ao carregar histórico", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const conversations = useMemo(() => {
    const groups: Record<string, MessageLog[]> = {};
    messages.forEach((msg) => {
      if (!msg.phoneNumber) return;
      if (!groups[msg.phoneNumber]) groups[msg.phoneNumber] = [];
      groups[msg.phoneNumber].push(msg);
    });
    return groups;
  }, [messages]);

  const getDisplayName = (phone: string) => {
    const msgs = conversations[phone] || [];
    const clientMsg = msgs.find((m) => m.contactName && m.direction?.toLowerCase() !== "outgoing");
    return clientMsg?.contactName || phone;
  };

  const contactList = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    return Object.keys(conversations)
      .map((phone) => ({ phone, name: getDisplayName(phone) }))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || c.phone.includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, contactSearch]);

  const phoneMessages = useMemo(() => {
    if (!selectedPhone) return [];
    return [...(conversations[selectedPhone] || [])].sort(
      (a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime(),
    );
  }, [conversations, selectedPhone]);

  const availableDates = useMemo(() => {
    const counts = new Map<string, number>();
    phoneMessages.forEach((msg) => {
      const key = dateKey(msg.timestampUtc);
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [phoneMessages]);

  useEffect(() => {
    setSelectedDates(new Set());
    setGeneratedText(null);
    setCopied(false);
  }, [selectedPhone]);

  const toggleDate = (key: string) => {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setGeneratedText(null);
  };

  const selectAllDates = () => {
    setSelectedDates(new Set(availableDates.map((d) => d.key)));
    setGeneratedText(null);
  };

  const clearDates = () => {
    setSelectedDates(new Set());
    setGeneratedText(null);
  };

  const handleDocument = () => {
    const myDisplayName = localStorage.getItem("bot_user") || "Você";
    const lines: string[] = [];

    phoneMessages.forEach((msg) => {
      const key = dateKey(msg.timestampUtc);
      if (!key || !selectedDates.has(key)) return;

      const sender = resolveSenderName(msg, selectedPhone ?? "", myDisplayName);
      const line = formatExportLine(msg, sender);
      if (line) lines.push(line);
    });

    setGeneratedText(lines.join("\n"));
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!generatedText) return;
    await navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedName = selectedPhone ? getDisplayName(selectedPhone) : null;

  return (
    <div className="doc-page">
      <div className="doc-sidebar">
        <h2>Documentar Conversa</h2>
        <input
          type="text"
          placeholder="Buscar pessoa ou telefone..."
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
        />
        <div className="doc-contact-list">
          {loading && <p className="doc-hint">Carregando...</p>}
          {!loading && contactList.length === 0 && (
            <p className="doc-hint">Nenhuma conversa encontrada</p>
          )}
          {contactList.map((c) => (
            <button
              key={c.phone}
              type="button"
              className={`doc-contact-item ${selectedPhone === c.phone ? "active" : ""}`}
              onClick={() => setSelectedPhone(c.phone)}
            >
              <strong>{c.name}</strong>
              <span>{c.phone}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="doc-main">
        {!selectedPhone ? (
          <div className="doc-empty">
            Selecione uma pessoa ao lado para ver o histórico e escolher as datas que quer documentar.
          </div>
        ) : (
          <>
            <div className="doc-main-header">
              <h3>{selectedName}</h3>
              <span>
                {phoneMessages.length} mensagens · {availableDates.length} dia(s) com conversa
              </span>
            </div>

            <div className="doc-dates-toolbar">
              <button type="button" onClick={selectAllDates}>
                Selecionar todos
              </button>
              <button type="button" onClick={clearDates}>
                Limpar seleção
              </button>
              <span className="doc-dates-count">{selectedDates.size} selecionado(s)</span>
            </div>

            <div className="doc-dates-grid">
              {availableDates.map(({ key, count }) => (
                <label
                  key={key}
                  className={`doc-date-checkbox ${selectedDates.has(key) ? "checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedDates.has(key)}
                    onChange={() => toggleDate(key)}
                  />
                  <span>{dateKeyLabel(key)}</span>
                  <small>{count} msg</small>
                </label>
              ))}
            </div>

            <button
              type="button"
              className="doc-generate-btn"
              onClick={handleDocument}
              disabled={selectedDates.size === 0}
            >
              📄 Documentar
            </button>

            {generatedText !== null && (
              <div className="doc-result">
                <div className="doc-result-header">
                  <strong>Documentação gerada</strong>
                  <button type="button" onClick={handleCopy}>
                    {copied ? "Copiado!" : "📋 Copiar"}
                  </button>
                </div>
                <textarea readOnly value={generatedText} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
