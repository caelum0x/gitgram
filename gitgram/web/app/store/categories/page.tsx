'use client'

import Link from 'next/link'

export default function StoreCategoriesPage() {
  const categories = [
    { id: 'code', name: 'Code', icon: '💻', description: 'Code snippets and scripts' },
    { id: 'project', name: 'Projects', icon: '🚀', description: 'Complete projects' },
    { id: 'template', name: 'Templates', icon: '📄', description: 'Project templates' },
    { id: 'component', name: 'Components', icon: '🧩', description: 'Reusable components' },
    { id: 'library', name: 'Libraries', icon: '📚', description: 'Code libraries' },
    { id: 'other', name: 'Other', icon: '📦', description: 'Other items' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Store Categories</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/store/browse?category=${category.id}`}
              className="p-6 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div className="text-4xl mb-3">{category.icon}</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{category.name}</h3>
              <p className="text-sm text-foreground/70">{category.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

