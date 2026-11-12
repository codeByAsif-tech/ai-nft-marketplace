import { Navigate, Outlet, useLocation } from 'react-router-dom'
import PageLoader from '../components/ui/PageLoader'
import { useAuth } from '../hooks/useAuth'

/**
 * Guest-only pages. Signed-in users are sent back to the page they originally
 * requested (set by ProtectedRoute), or to the dashboard.
 */
export default function GuestRoute() {
  const { isAuthenticated, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <PageLoader />
  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/dashboard'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}
