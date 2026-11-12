import { createContext } from 'react'

// Kept in its own file so AuthContext.jsx only exports a component (fast refresh).
export const AuthContext = createContext(null)
