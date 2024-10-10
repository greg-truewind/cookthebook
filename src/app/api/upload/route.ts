import { NextResponse, type NextRequest } from 'next/server'
import fs from 'node:fs'

export async function POST(req: NextRequest) {
  console.log('POST request received')
  const formData = await req.formData()
  const file = formData.get('workpaper') as File | null

  if (!file) {
    console.error('No file uploaded')
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  console.log('File received:', file.name)
  const arrayBuffer = await file.arrayBuffer()

  const buffer = Buffer.from(arrayBuffer)
  const filePath = `/tmp/uploads/${file.name}`

  await fs.promises.mkdir('/tmp/uploads', { recursive: true })
  await fs.promises.writeFile(filePath, buffer)

  console.log('File saved to:', filePath)

  const fileId = file.name
  return NextResponse.json({ fileId }, { status: 200 })
}
