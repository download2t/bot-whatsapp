import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { UserProfile } from "../types";
import "./ProfilePage.css";

export function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info",
  );

  const [form, setForm] = useState({
    username: "",
    email: "",
    phone: "",
    cpf: "",
    fullName: "",
    title: "Operador",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<UserProfile>("/api/auth/me");
        setForm({
          username: me.username,
          email: me.email || "",
          phone: me.phone || "",
          cpf: me.cpf || "",
          fullName: me.fullName || "",
          title: me.title === "Gestor" ? "Gestor" : "Operador",
        });
      } catch (error) {
        setMessageType("error");
        setMessage(
          error instanceof Error ? error.message : "Falha ao carregar perfil",
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setMessageType("info");

    try {
      // Enviar o título atual para evitar erro de comparação com null no backend
      const payload = {
        username: form.username.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        cpf: form.cpf.trim() || null,
        fullName: form.fullName.trim() || null,
        title: form.title, // Envia o título atual para o backend não reclamar
      };

      console.log("Enviando payload:", payload);

      const updated = await apiFetch<UserProfile>("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setForm({
        username: updated.username,
        email: updated.email || "",
        phone: updated.phone || "",
        cpf: updated.cpf || "",
        fullName: updated.fullName || "",
        title: updated.title === "Gestor" ? "Gestor" : "Operador",
      });

      localStorage.setItem("bot_user", updated.username);
      setMessageType("success");
      setMessage("Perfil atualizado com sucesso.");
    } catch (error) {
      console.error("Erro ao salvar:", error);

      let errorMessage = "Falha ao atualizar perfil";

      if (error instanceof Error) {
        errorMessage = error.message;

        // Tratar erro específico do título
        if (
          errorMessage.toLowerCase().includes("title") ||
          errorMessage.toLowerCase().includes("cargo")
        ) {
          errorMessage = "Não é permitido alterar o cargo do próprio usuário.";
        }

        // Tratar erro de username duplicado
        if (errorMessage.toLowerCase().includes("username already exists")) {
          errorMessage = "Este nome de usuário já está em uso.";
        }
      }

      setMessageType("error");
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container profile-page">
        <div className="loading">Carregando perfil...</div>
      </div>
    );
  }

  return (
    <div className="container profile-page">
      <div className="profile-header">
        <div className="profile-avatar">
          {form.fullName ? form.fullName.charAt(0).toUpperCase() : "U"}
        </div>
        <div className="profile-title">
          <h1>{form.fullName || form.username}</h1>
          <div className="profile-subtitle">
            <span>@{form.username}</span>
            <span className="badge">{form.title}</span>
            {form.email && <span>{form.email}</span>}
          </div>
        </div>
      </div>

      <p className="profile-description">
        Atualize suas informações de acesso e perfil
      </p>

      <form className="profile-card" onSubmit={handleSave}>
        <div className="profile-form-grid">
          <div className="form-group form-group-full">
            <label>
              Nome de Usuário <span className="optional">(obrigatório)</span>
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              placeholder="Digite seu nome de usuário"
            />
          </div>

          <div className="form-group form-group-full">
            <label>
              Email <span className="optional">(opcional)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="seu@email.com"
            />
          </div>

          <div className="form-group form-group-full">
            <label>
              Nome Completo <span className="optional">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Digite seu nome completo"
            />
          </div>

          <div className="form-group">
            <label>
              Telefone <span className="optional">(opcional)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(11) 99999-9999"
            />
          </div>

          <div className="form-group">
            <label>
              CPF <span className="optional">(opcional)</span>
            </label>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: e.target.value })}
              placeholder="123.456.789-00"
            />
          </div>

          <div className="form-group">
            <label>Cargo</label>
            <input
              type="text"
              value={form.title}
              disabled
              readOnly
              className="readonly-field"
            />
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Cancelar
            </button>
          </div>

          {message && (
            <div className={`profile-message ${messageType}`}>
              {messageType === "success" && "✓ "}
              {messageType === "error" && "✗ "}
              {messageType === "info" && "ℹ "}
              {message}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
