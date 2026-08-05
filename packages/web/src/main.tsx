import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { AdminShell } from './shells/Admin.tsx'
import { PlayerShell, Fatal } from './shells/Player.tsx'
import { TableShell } from './shells/Table.tsx'
import { HomeShell } from './shells/Home.tsx'

/**
 * One bundle, three shells, resolved from the path.
 *
 * `/p/:token` carries the token in the PATH so a player can open their view by scanning
 * a QR code at the table; `/admin` and `/table` take it as a query parameter, because
 * those two are opened by the operator on a laptop and a television.
 */
function route(): JSX.Element {
  const path = window.location.pathname
  const query = new URLSearchParams(window.location.search).get('token')

  if (path.startsWith('/p/')) {
    const token = decodeURIComponent(path.slice(3))
    return token.length === 0
      ? <Fatal message="That player link is missing its token." />
      : <PlayerShell token={token} />
  }
  if (path.startsWith('/admin')) {
    return query === null
      ? <Fatal message="The facilitator link needs its ?token=." />
      : <AdminShell token={query} />
  }
  if (path.startsWith('/table')) {
    return query === null
      ? <Fatal message="The table link needs its ?token=." />
      : <TableShell token={query} />
  }
  return <HomeShell />
}

const host = document.getElementById('root')
if (host !== null) {
  createRoot(host).render(<StrictMode>{route()}</StrictMode>)
}
