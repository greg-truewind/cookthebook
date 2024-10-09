import { NextResponse, type NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("workpaper")
  console.log(file)
  return NextResponse.json({ status: "success" })
}
