import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import * as XLSX from "xlsx"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("workpaper") as File

  if (!file) {
    return new NextResponse("No file uploaded", { status: 400 })
  }

  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const csvText = XLSX.utils.sheet_to_txt(worksheet)

    // Initiate the AI text generation
    const result = await generateText({
      model: openai("o1-preview"),
      prompt: `Parse this workpaper ledger into a collection of QuickBooks API calls. Next is work paper from xslx library in json format. ${csvText}`,
      experimental_providerMetadata: {
        openai: { maxCompletionTokens: 5000 },
      },
    })

    return new NextResponse(JSON.stringify({ result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    const err = error as Error
    return new NextResponse(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    })
  }
}
