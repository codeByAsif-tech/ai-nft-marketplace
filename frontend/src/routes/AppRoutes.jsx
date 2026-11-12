import { Route, Routes } from 'react-router-dom'
import MainLayout from '../layouts/MainLayout'
import ActivityPage from '../pages/ActivityPage'
import DashboardPage from '../pages/DashboardPage'
import ExplorePage from '../pages/ExplorePage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import VerifyEmailPage from '../pages/VerifyEmailPage'
import NftDetailsPage from '../pages/NftDetailsPage'
import LandingPage from '../pages/LandingPage'
import LoginPage from '../pages/LoginPage'
import MyArtworkPage from '../pages/MyArtworkPage'
import MyNftsPage from '../pages/MyNftsPage'
import StudioPage from '../pages/StudioPage'
import NotFoundPage from '../pages/NotFoundPage'
import ProfilePage from '../pages/ProfilePage'
import RegisterPage from '../pages/RegisterPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminRoute from './AdminRoute'
import GuestRoute from './GuestRoute'
import ProtectedRoute from './ProtectedRoute'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<LandingPage />} />

        {/* Public marketplace pages */}
        <Route path="explore" element={<ExplorePage />} />
        <Route path="nft/:id" element={<NftDetailsPage />} />

        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        {/* Opened from email links: work whether or not someone is logged in. */}
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="studio/:id" element={<StudioPage />} />
          <Route path="artwork" element={<MyArtworkPage />} />
          <Route path="nfts" element={<MyNftsPage />} />
          <Route path="activity" element={<ActivityPage />} />
        </Route>

        {/* Admin area: hidden from non-admins here, and enforced by the backend (403). */}
        <Route element={<AdminRoute />}>
          <Route path="admin" element={<AdminDashboardPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
