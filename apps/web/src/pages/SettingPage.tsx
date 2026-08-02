function SettingPage() {
  return (
    <main>
      <header>
        <h1>Settings</h1>
        <p>Manage your profile and preferences.</p>
      </header>

      <section>
        <h2>Profile</h2>

        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" />
      </section>

      <section>
        <h2>Preferences</h2>
        <label>
          <input name="emailNotifications" type="checkbox" />
          Receive email notifications
        </label>
      </section>

      <button type="button">Save changes</button>
    </main>
  )
}

export default SettingPage
