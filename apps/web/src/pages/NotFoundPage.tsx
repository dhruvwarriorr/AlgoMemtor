import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <main>
      <header>
        <h1>Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
      </header>

      <Link to="/">Return to the landing page</Link>
    </main>
  )
}

export default NotFoundPage
