
function DashboardPage() {
  return (
    <main>
      <header>
        <h1>Dashboard</h1>
        <p>Welcome back! Here is a quick overview of your progress.</p>
      </header>

      <section>
        <h2 id="progress-heading">Your Progress</h2>
        <p>Problems solved: 0</p>
        <p>Current streak: 0 days</p>
      </section>

      <section>
        <h2 id="activity-heading">Recent Activity</h2>
        <p>No recent activity yet.</p>
      </section>
    </main>
  )
}

export default DashboardPage
