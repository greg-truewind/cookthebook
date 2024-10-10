import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { createMachine, createActor, assign, fromPromise, waitFor } from "xstate"
import fs from "node:fs"

// Define a type for your context
interface WorkPaperContext {
  csvText: string
  planPieces?: string[]
}

// Update your machine with the new context type
const workPaperMachine = createMachine({
  initial: "buildPlan",
  types: {
    input: {} as { csvText: string },
    context: {} as WorkPaperContext,
  },
  context: ({ input }) => ({
    csvText: input.csvText,
  }),
  states: {
    buildPlan: {
      entry: () => {
        console.log("entry of building plan")
      },
      invoke: {
        src: fromPromise((context) => {
          console.log("Building plan")
          console.log(context)

          return generateText({
            model: openai("o1-mini"),
            prompt: "You are senior certified public accountant. Create a plan for the following workpaper",
            temperature: 0.1,
          })
        }),
        onDone: {
          actions: [
            assign({
              planPieces: (context, event) => {
                console.log(context, event)
                return ["hello"]
              },
            }),
            () => {
              console.log("executing actions")
            },
          ],
          target: "buildJournalEntries",
        },
        onError: {
          target: "error",
        },
      },
    },
    error: {
      type: "final",
    },
    buildJournalEntries: {
      entry: () => {
        console.log("entry of building journal entries")
      },
      invoke: {
        // For each piece, create an actor
        src: fromPromise(({ input }) => {
          console.log("Building journal entries")
          return generateText({
            model: openai("o1-mini"),
            prompt: "You are a financial analyst. Create a plan for the following workpaper",
          })
        }),
        onDone: {
          actions: assign({
            planPieces: (context, event) => {
              return ["hello"]
            },
          }),
          target: "closed",
        },
        onError: {
          target: "error",
        },
      },
      on: {
        WORKPAPER_CREATED: {
          target: "closed",
        },
      },
    },
    closed: {
      entry: () => {
        console.log("closed")
      },
      type: "final",
    },
  },
})

// Define a child machine for processing each piece
const childMachine = createMachine<{ piece: string }>({
  initial: "processing",
  states: {
    processing: {
      invoke: {
        src: (context) =>
          generateText({
            model: openai("gpt-4o"),
            prompt: `Process the following plan piece: ${context.piece}`,
          }),
        onDone: {
          actions: (context, event) => {
            console.log(`Processed piece:`, event.data.text)
          },
          target: "done",
        },
        onError: {
          target: "error",
        },
      },
    },
    done: {
      type: "final",
    },
    error: {
      type: "final",
    },
  },
})

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("workpaper") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
  }

  try {
    // Read the file as an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Parse the Excel file
    const workbook = XLSX.read(arrayBuffer, { type: "array" })

    // Assume we're working with the first sheet
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]

    // Convert the worksheet to CSV
    const csvText = XLSX.utils.sheet_to_csv(worksheet)

    // Create and start the actor with the CSV text
    const actor = createActor(workPaperMachine, {
      input: {
        csvText,
      },
    })

    actor.start()

    await waitFor(actor, (state) => state.matches("closed"))

    // You might want to wait for some processing to complete here
    // For now, we'll just return a success response
    return NextResponse.json({ status: "success", message: "File processed and actor started" })
  } catch (error) {
    console.error("Error processing file:", error)
    return NextResponse.json({ error: "Error processing file" }, { status: 500 })
  }
}
