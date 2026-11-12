import api from './api'

export async function getDashboard() {
  const { data } = await api.get('/users/me/dashboard')
  return data.data // { stats, progress, recentArtwork, recentActivity }
}

export async function updateProfile(updates) {
  const { data } = await api.patch('/users/me', updates)
  return data.data.user
}
