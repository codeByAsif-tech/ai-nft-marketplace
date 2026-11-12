import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { WalletProvider } from './context/WalletContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <WalletProvider>
            <AppRoutes />
          </WalletProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
