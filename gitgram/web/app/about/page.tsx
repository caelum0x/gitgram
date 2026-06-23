export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <h1 className="text-5xl font-bold mb-6">About Gitgram</h1>
      <p className="text-xl text-muted mb-8">A social platform for developers to share projects, connect, and collaborate.</p>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
          <p className="text-muted">To create a vibrant community where developers can showcase their work, discover amazing projects, and build meaningful connections.</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">Features</h2>
          <ul className="space-y-2 text-muted">
            <li>• Share posts, stories, and reels</li>
            <li>• Real-time messaging</li>
            <li>• Follow developers and projects</li>
            <li>• Discover trending content</li>
            <li>• Build your developer portfolio</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4">Contact</h2>
          <p className="text-muted">Email: hello@gitgram.app</p>
        </section>
      </div>
    </div>
  )
}
