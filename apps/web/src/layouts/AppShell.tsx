import { Outlet } from 'react-router-dom'
import Topbar from '@/components/navigation/Topbar'

function AppShell() {
  return (
    <>
      <Topbar />
      <Outlet />
    </>
  )
}

export default AppShell
