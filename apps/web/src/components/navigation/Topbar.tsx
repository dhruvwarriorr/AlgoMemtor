import { NavLink } from 'react-router-dom'

const navigationItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Problems', to: '/problems' },
  { label: 'Progress', to: '/progress' },
  { label: 'Settings', to: '/settings' },
]

function Topbar() {
  return (
    <header className="flex w-full items-center justify-between border-b bg-background px-6 py-4">
      <NavLink className="text-xl font-semibold text-foreground" to="/">
        AlgoMemtor
      </NavLink>

      <div className="flex items-center gap-6">
        <nav aria-label="Main navigation">
          <ul className="flex items-center gap-4">
            {navigationItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  className={({ isActive }) =>
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                  to={item.to}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <NavLink
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          to="/login"
        >
          Login / Sign Up
        </NavLink>
      </div>
    </header>
  )
}

export default Topbar
