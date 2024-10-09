"use server"

import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import * as XLSX from "xlsx"

export async function uploadWorkpaper(formData: FormData) {
  const file = formData.get("workpaper") as File
  if (!file) {
    throw new Error("No file uploaded")
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "buffer" })

  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const csvText = XLSX.utils.sheet_to_txt(worksheet)
  console.log("tokens amount", csvText.split(" ").length)

  const { responseMessages, response } = await generateText({
    model: openai("o1-preview"),
    prompt: `Parse this workpaper ledger into a collection of quickbooks api calls. Next is work paper from xslx library in json format. ${csvText}`,
    experimental_providerMetadata: {
      openai: { maxCompletionTokens: 5000 },
    },
  })
  console.log(response)
  for (const message of responseMessages) {
    console.log(message)
    console.log(message.content)
  }

  // Return some response or redirect as needed
  return { message: "File uploaded and processed successfully" }
}
