import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import type { WhatsAppConnectionStatus } from "../types";
import "./Navigation.css";

type NavigationProps = {
  username: string;
  isAdmin: boolean;
  userTitle: string | null;
  onLogout: () => void;
};

export function Navigation({
  username,
  isAdmin,
  userTitle,
  onLogout,
}: NavigationProps) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);

  const profileMenuRef = useRef<HTMLLIElement | null>(null);

  const userInitial = username.trim().charAt(0).toUpperCase() || "U";

  const closeMenus = () => {
    setIsMenuOpen(false);
    setIsNavOpen(false);
  };

  const connectionLabel = useMemo(() => {
    if (!status) return "Indisponível";
    if (status.isConnected) return "Conectado";
    if (status.hasQr) return "Aguardando QR Code";
    return "Desconectado";
  }, [status]);

  const formatPhone = (value: string | null | undefined) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "Sem número vinculado";

    const country = digits.startsWith("55") ? "+55" : `+${digits.slice(0, 2)}`;
    const national = digits.startsWith("55")
      ? digits.slice(2)
      : digits.slice(2);
    const ddd = national.slice(0, 2);
    const local = national.slice(2);

    if (!ddd || !local) return `+${digits}`;

    const firstPart =
      local.length > 4 ? local.slice(0, local.length - 4) : local;
    const lastPart = local.length > 4 ? local.slice(-4) : "";

    return `${country} (${ddd}) ${firstPart}${lastPart ? `-${lastPart}` : ""}`
      .replace(/\s+/g, " ")
      .trim();
  };

  const loadStatus = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionStatus>(
        "/api/whatsapp/status",
      );
      setStatus(data);
    } catch {
      // Keep menu usable
    }
  };

  useEffect(() => {
    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileMenuRef.current?.contains(target)) setIsMenuOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleOpenDocs = () => {
    window.open(
      "http://localhost:5207/swagger",
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={closeMenus}>
          <div className="brand-logo">C</div>
          <span>BOTZAP</span>
        </Link>

        <button
          className={`hamburger ${isNavOpen ? "active" : ""}`}
          onClick={() => setIsNavOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <ul className={`nav-menu ${isNavOpen ? "open" : ""}`}>
          <li className="nav-item">
            <button
              className="nav-trigger"
              onClick={() => {
                navigate("/messages");
                closeMenus();
              }}
            >
              Mensagens
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-trigger"
              onClick={() => {
                navigate("/rules");
                closeMenus();
              }}
            >
              Regras de Negócio
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-trigger"
              onClick={() => {
                navigate("/turmas");
                closeMenus();
              }}
            >
              Turmas
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-trigger"
              onClick={() => {
                navigate("/contatos");
                closeMenus();
              }}
            >
              Contatos
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-trigger"
              onClick={() => {
                navigate("/documentacao");
                closeMenus();
              }}
            >
              Documentar Conversa
            </button>
          </li>
          {isAdmin && (
            <li className="nav-item">
              <button
                className="nav-trigger"
                onClick={() => {
                  navigate("/users");
                  closeMenus();
                }}
              >
                Usuários
              </button>
            </li>
          )}

          <li className="nav-item has-dropdown" ref={profileMenuRef}>
            <button
              className={`nav-trigger profile-trigger ${isMenuOpen ? "active" : ""}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className="avatar">{userInitial}</div>
              <span className="user-name">{username}</span>
              <span className="caret">▾</span>
            </button>

            {isMenuOpen && (
              <div className="dropdown-menu profile-menu-wide">
                <div className="profile-header">
                  <div className="avatar large">{userInitial}</div>
                  <div className="profile-info">
                    <p className="profile-name">{username}</p>
                    <p className="profile-role">{userTitle || "Usuário"}</p>
                  </div>
                </div>

                <div className="dropdown-divider"></div>

                <div className="dropdown-group">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      navigate("/profile");
                      closeMenus();
                    }}
                  >
                    Meu Perfil
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      navigate("/change-password");
                      closeMenus();
                    }}
                  >
                    Segurança e Senha
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      handleOpenDocs();
                      closeMenus();
                    }}
                  >
                    Documentação da API
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      navigate("/whatsapp-connections");
                      closeMenus();
                    }}
                  >
                    Meu WhatsApp
                  </button>
                </div>

                <div className="dropdown-divider"></div>

                <div className="status-section">
                  <span className="section-title">Status do WhatsApp</span>
                  <div className="connection-list">
                    <div className="connection-item">
                      <div className="connection-info">
                        <span
                          className={`status-dot ${status?.isConnected ? "success" : "error"}`}
                        ></span>
                        <span className="phone-number">
                          {status?.phoneNumber
                            ? formatPhone(status.phoneNumber)
                            : "Nenhum aparelho"}
                        </span>
                      </div>
                      <span
                        className={`badge ${status?.isConnected ? "badge-success" : "badge-error"}`}
                      >
                        {connectionLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="dropdown-divider"></div>

                <button
                  className="dropdown-item danger"
                  onClick={() => {
                    onLogout();
                    closeMenus();
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Encerrar Sessão
                </button>
              </div>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
}
