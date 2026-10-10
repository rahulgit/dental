import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import AppointmentsPage from './pages/AppointmentsPage'
import AppointmentDetailsPage from './pages/AppointmentDetailsPage'
import { DemoStoreProvider } from './store/DemoStore'
import { GoodDocProvider } from './gooddoc/GoodDoc'

export default function App() {
  return (
    <DemoStoreProvider>
      <BrowserRouter>
        <GoodDocProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/appointments" replace />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="appointments/:sessionId" element={<AppointmentDetailsPage />} />
              <Route path="*" element={<Navigate to="/appointments" replace />} />
            </Route>
          </Routes>
        </GoodDocProvider>
      </BrowserRouter>
    </DemoStoreProvider>
  )
}
