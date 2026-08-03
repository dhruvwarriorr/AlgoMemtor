import { useParams } from 'react-router-dom'

function ProblemDetailPage() {
  const { problemId } = useParams()

  return (
    <main>
      <header>
        <h1>Problem Details</h1>
        <p>
          Problem ID: <code>{problemId}</code>
        </p>
      </header>

      <section>
        <h2>Coding Workspace</h2>
        <p>
          The problem statement and coding workspace will be added here later.
        </p>
      </section>
    </main>
  )
}

export default ProblemDetailPage
