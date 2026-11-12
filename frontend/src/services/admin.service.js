import api from './api'

// All of these require an ADMIN account; the backend enforces it (403 otherwise).

export async function getAdminStats() {
  const { data } = await api.get('/admin/stats')
  return data.data
}

export async function getAdminActivity({ page = 1, limit = 10, type } = {}) {
  const params = { page, limit }
  if (type) params.type = type
  const { data } = await api.get('/admin/activity', { params })
  return data.data
}

export async function listAdminUsers({ page = 1, limit = 20, search, role, status } = {}) {
  const params = { page, limit }
  if (search) params.search = search
  if (role) params.role = role
  if (status) params.status = status
  const { data } = await api.get('/admin/users', { params })
  return data.data
}

export async function updateAdminUser(id, changes) {
  const { data } = await api.patch(`/admin/users/${id}`, changes)
  return data.data.user
}
