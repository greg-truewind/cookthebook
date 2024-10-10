import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { createMachine, interpret, assign } from "xstate"
import { fromPromise } from "xstate/lib/fromPromise"
import { waitFor } from "xstate/lib/waitFor"
import { systemPrompt } from "./system-prompt"

// Define a type for your context
interface WorkPaperContext {
  workSheetJson: unknown
  planPieces?: unknown[]
  childActors?: unknown[]
}

// Custom JSON parsing function
function safeParse(text: string): unknown[] {
  console.log("Attempting to parse:", text)
  try {
    // First, try to parse the entire text as JSON
    return JSON.parse(text)
  } catch (error) {
    console.log("Failed to parse entire text, attempting to extract array")
    // If that fails, try to extract an array from the text
    const match = text.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch (nestedError) {
        console.log("Failed to parse extracted array")
      }
    }
    
    // If all else fails, try to extract individual JSON objects
    const objects = text.match(/\{[\s\S]*?\}/g)
    if (objects) {
      return objects.map(obj => {
        try {
          return JSON.parse(obj)
        } catch (objError) {
          return null
        }
      }).filter(Boolean)
    }
    
    throw new Error("Unable to parse JSON from the provided text")
  }
}

// Update your machine with the new context type
const workPaperMachine = createMachine({
  id: 'workPaper',
  initial: "buildPlan",
  context: ({ input }: { input: WorkPaperContext }) => ({
    workSheetJson: input.workSheetJson,
  }),
  states: {
    buildPlan: {
      entry: () => {
        console.log("entry of building plan")
      },
      invoke: {
        src: fromPromise(async (context: WorkPaperContext) => {
          console.log("Building plan")
          const result = await generateText({
            model: openai("o1"),
            system: systemPrompt,
            prompt: `
You are a senior certified public accountant tasked with creating a plan based on the provided workpaper.

**Instructions:**

- Analyze the following workpaper data.
- Generate a list of operations needed to upload the workpaper into QuickBooks.
- Use the QuickBooks OpenAPI schema for the API payloads.
- **Output only** the JSON array of operations without any additional text or explanation.

**Workpaper Data:**
${JSON.stringify(context.workSheetJson)}
`,
            temperature: 0.1,
          })
          return result
        }),
        onDone: {
          actions: assign({
            planPieces: (_, event) => {
              const planText = event.data.text
              console.log("Plan Text:", planText)
              return safeParse(planText)
            },
          }),
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
      entry: assign({
        childActors: (context) => {
          return (context.planPieces || []).map((piece) => {
            const child = interpret(childMachine.withContext({ piece }))
            child.start()
            return child
          })
        },
      }),
      invoke: {
        src: (context) => (callback) => {
          // Monitor child actors
          Promise.all(
            (context.childActors || []).map((child) => {
              return new Promise((resolve) => {
                child.onDone(() => resolve(child.getSnapshot().context))
              })
            })
          ).then((results) => {
            callback({ type: "ALL_CHILDREN_DONE", data: results })
          })
        },
      },
      on: {
        ALL_CHILDREN_DONE: {
          actions: (_, event) => {
            console.log("All operations processed:", event.data)
          },
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

const childMachine = createMachine({
  id: 'child',
  initial: "processing",
  context: ({ input }: { input: { piece: unknown } }) => ({ piece: input.piece }),
  states: {
    processing: {
      invoke: {
        src: fromPromise(async (context) => {
          const operation = context.piece
          // Make QuickBooks API call
          const response = await fetch("https://quickbooks.api.endpoint", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Include authentication headers if needed
            },
            body: JSON.stringify(operation),
          })
          const data = await response.json()
          return data
        }),
        onDone: {
          actions: assign({
            result: (_, event) => event.data,
          }),
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
    console.log("worksheet", worksheet)

    // Convert the worksheet to JSON
    const workSheetJson = XLSX.utils.sheet_to_json(worksheet)
    console.log("json", workSheetJson)

    // Create a TransformStream
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Set SSE headers
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    })

    // Start the actor
    const actor = interpret(workPaperMachine.withContext({
      workSheetJson,
    }))
    actor.start()

    // Subscribe to actor state changes
    actor.subscribe((state) => {
      const data = JSON.stringify(state.context)
      writer.write(encoder.encode(`data: ${data}\n\n`))
    })

    // Wait for the actor to reach 'closed' state
    await waitFor(actor, (state) => state.matches("closed"))
    writer.close()

    return new NextResponse(readable, { headers })
  } catch (error) {
    console.error("Error processing file:", error)
    return NextResponse.json({ error: "Error processing file" }, { status: 500 })
  }
}
