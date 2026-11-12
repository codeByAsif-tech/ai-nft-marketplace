import { Navigate, Outlet } from 'react-router-dom'
import PageLoader from '../components/ui/PageLoader'
import { useAuth } from '../hooks/useAuth'

/**
 * Hides admin pages from non-admins. This is UX only: every admin API
 * is protected on the backend by `requireRole('ADMIN')`.
 */
export default function AdminRoute() {
  const { isAuthenticated, isAdmin, initializing } = useAuth()

  if (initializing) return <PageLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
