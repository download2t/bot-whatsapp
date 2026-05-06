export function Card({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card ${className}`} style={style}>{children}</div>
}

export function CardHeader({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`card-header ${className}`} style={style}>{children}</div>
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="card-title">{children}</h2>
}

export function Badge({ children, variant = 'success' }: { children: React.ReactNode; variant?: 'success' | 'danger' | 'warning' | 'info' }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

export function Alert({ children, variant = 'info' }: { children: React.ReactNode; variant?: 'success' | 'danger' | 'warning' | 'info' }) {
  return <div className={`alert alert-${variant}`}>{children}</div>
}

export function FormGroup({ children }: { children: React.ReactNode }) {
  return <div className="form-group">{children}</div>
}

export function EmptyState({ icon = '📭', title, text, action }: { icon?: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-text">{text}</p>
      {action && <div>{action}</div>}
    </div>
  )
}
