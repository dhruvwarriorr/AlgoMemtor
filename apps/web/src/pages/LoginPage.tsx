function LoginPage() {
  return (
    <main>
      <header>
        <h1>Login</h1>
        <p>Sign in to continue learning with AlgoMemtor.</p>
      </header>

      <form onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" required type="email" />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" required type="password" />

        <button type="submit">Login</button>
      </form>

      <p>New to AlgoMemtor? Create an account to get started.</p>
    </main>
  )
}

export default LoginPage
