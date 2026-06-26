import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import type {
  WhatsAppConnectionItem,
  WhatsAppConnectionStatus,
} from "../types";
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
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null);
  const [connections, setConnections] = useState<WhatsAppConnectionItem[]>([]);

  const profileMenuRef = useRef<HTMLLIElement | null>(null);
  const adminMenuRef = useRef<HTMLLIElement | null>(null);

  const userInitial = username.trim().charAt(0).toUpperCase() || "U";
  const connectedConnections = useMemo(
    () => connections.filter((item) => item.isConnected),
    [connections],
  );

  const closeMenus = () => {
    setIsMenuOpen(false);
    setIsAdminMenuOpen(false);
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

  const loadConnections = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionItem[]>(
        "/api/whatsapp/connections",
      );
      setConnections(data);
    } catch {
      // Keep menu usable
    }
  };

  useEffect(() => {
    void loadStatus();
    void loadConnections();
    const interval = window.setInterval(() => {
      void loadStatus();
      void loadConnections();
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileMenuRef.current?.contains(target)) setIsMenuOpen(false);
      if (!adminMenuRef.current?.contains(target)) setIsAdminMenuOpen(false);
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
          {(isAdmin || userTitle === "Gestor") && (
            <li className="nav-item has-dropdown" ref={adminMenuRef}>
              <button
                className={`nav-trigger ${isAdminMenuOpen ? "active" : ""}`}
                onClick={() => setIsAdminMenuOpen(!isAdminMenuOpen)}
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
                  <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                  <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
                  <path d="M12 2v2" />
                  <path d="M12 20v2" />
                  <path d="m4.93 4.93 1.41 1.41" />
                  <path d="m17.66 17.66 1.41 1.41" />
                  <path d="M2 12h2" />
                  <path d="M20 12h2" />
                  <path d="m6.34 17.66-1.41 1.41" />
                  <path d="m19.07 4.93-1.41 1.41" />
                </svg>
                Administração
                <span className="caret">▾</span>
              </button>

              {isAdminMenuOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-group">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/rules");
                        closeMenus();
                      }}
                    >
                      Regras de Negócio
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/whitelist");
                        closeMenus();
                      }}
                    >
                      White List
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/users");
                        closeMenus();
                      }}
                    >
                      Gestão de Usuários
                    </button>
                  </div>
                  <div className="dropdown-divider"></div>
                  <div className="dropdown-group">
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/turmas");
                        closeMenus();
                      }}
                    >
                      Turmas
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/contatos");
                        closeMenus();
                      }}
                    >
                      Contatos
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        navigate("/messages");
                        closeMenus();
                      }}
                    >
                      Mensagens
                    </button>
                  </div>
                </div>
              )}
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
                    Gerenciar Dispositivos
                  </button>
                </div>

                <div className="dropdown-divider"></div>

                <div className="status-section">
                  <span className="section-title">Status do WhatsApp</span>
                  <div className="connection-list">
                    {connectedConnections.length > 0 ? (
                      connectedConnections.map((connection) => (
                        <div key={connection.id} className="connection-item">
                          <div className="connection-info">
                            <span className="status-dot success"></span>
                            <span className="phone-number">
                              {formatPhone(connection.phoneNumber)}
                            </span>
                          </div>
                          <span className="badge badge-success">Online</span>
                        </div>
                      ))
                    ) : (
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
                    )}
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
