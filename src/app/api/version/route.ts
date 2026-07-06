import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

// Returns the current build ID so the client can detect when a new deploy happened.
// Response is never cached (no-store) so the client always gets the latest.
export async function GET() {
  let buildId = 'unknown'
  try {
    const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID')
    buildId = readFileSync(buildIdPath, 'utf-8').trim()
  } catch (err) {
    console.error('Could not read BUILD_ID:', err)
  }

  return NextResponse.json(
    {
      buildId,
      deployedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
  )
}
