import { Navigate, Outlet, useLocation } from 'react-router-dom'
import PageLoader from '../components/ui/PageLoader'
import { useAuth } from '../hooks/useAuth'

/** Only for signed-in users. Remembers where they were going. */
export default function ProtectedRoute() {
  const { isAuthenticated, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <PageLoader label="Restoring your session…" />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
