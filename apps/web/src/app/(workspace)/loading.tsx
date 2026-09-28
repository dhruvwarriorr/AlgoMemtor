'use client'

import { PageSkeleton } from '@/components/states/PageSkeleton'

export default function Loading() {
  return (
    <div className="w-full px-5 py-6 sm:px-8 lg:px-10">
      <PageSkeleton label="Loading page" rows={4} withHeader />
    </div>
  )
}
