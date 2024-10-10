import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { NextResponse, type NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { createMachine, createActor, assign, fromPromise, raise } from 'xstate'
import { systemPrompt } from './system-prompt'

console.log('route.ts loaded')

interface WorkPaperContext {
  workSheetJson: XLSX.Sheet2JSONOpts
  planPieces?: string[]
  journalEntries?: Array<{ piece: string; entry: string }>
}

const workPaperMachine = createMachine({
  id: 'workPaper',
  initial: 'buildPlan',
  types: {
    input: {} as { workSheetJson: XLSX.Sheet2JSONOpts },
    context: {} as WorkPaperContext,
    events: {} as { type: 'UPDATE'; status: string; message: string; error?: string } | { type: 'DONE' },
  },
  context: ({ input }) => {
    console.log('Initializing machine context with input:', input)
    return {
      workSheetJson: input.workSheetJson,
      planPieces: [],
      journalEntries: [],
    }
  },
  states: {
    buildPlan: {
      entry: [
        () => console.log('Entered buildPlan state'),
        raise({ type: 'UPDATE', status: 'Building plan', message: 'Analyzing workpaper...' }),
      ],
      invoke: {
        input: ({ context }) => {
          console.log('Invoking buildPlan with context:', context)
          return { workSheetJson: context.workSheetJson }
        },
        src: fromPromise(({ input }) => {
          console.log('Generating text for buildPlan')
          return generateText({
            model: openai('o1-preview'),
            prompt: `${systemPrompt}\n\n${JSON.stringify(input.workSheetJson)}`,
            temperature: 0.1,
          })
        }),
        onDone: {
          actions: [
            assign({
              planPieces: ({ event }) => {
                console.log('Received AI response:', event.output)
                let operations = []
                try {
                  const jsonString = event.output.text.trim()
                  operations = JSON.parse(jsonString)
                  console.log('Parsed operations:', operations)
                } catch (e) {
                  console.error('Error parsing plan:', e)
                  console.error('Raw response:', event.output.text)
                  throw new Error('Failed to parse the plan from AI response')
                }
                return operations
              },
            }),
            raise(({ context }) => {
              console.log('Raising UPDATE event after building plan')
              return {
                type: 'UPDATE' as const,
                status: 'Plan built',
                message: `Created ${context.planPieces?.length || 0} plan pieces`,
              }
            }),
          ],
          target: 'buildJournalEntries',
        },
        onError: {
          actions: raise(({ event }) => {
            console.error('Error in buildPlan:', event.error)
            return {
              type: 'UPDATE' as const,
              status: 'Error',
              message: 'Failed to build plan',
              error: event.error instanceof Error ? event.error.message : String(event.error),
            }
          }),
          target: 'error',
        },
      },
    },
    buildJournalEntries: {
      entry: [
        () => console.log('Entered buildJournalEntries state'),
        raise({ type: 'UPDATE', status: 'Building journal entries', message: 'Processing plan pieces...' }),
      ],
      invoke: {
        input: ({ context }) => {
          console.log('Invoking buildJournalEntries with context:', context)
          return { planPieces: context.planPieces }
        },
        src: fromPromise(({ input }) => {
          console.log('Generating journal entries')
          return Promise.all(
            input.planPieces?.map((piece) =>
              generateText({
                model: openai('o1-mini'),
                prompt: `Create Quickbooks API call for: ${JSON.stringify(piece)}`,
              }).then((result) => ({ piece, entry: result.text })),
            ) || [],
          )
        }),
        onDone: {
          actions: [
            assign({
              journalEntries: ({ event }) => {
                console.log('Journal entries created:', event.output)
                return event.output
              },
            }),
            raise(({ context, event }) => {
              console.log('Raising UPDATE event after building journal entries')
              return {
                type: 'UPDATE' as const,
                status: 'Journal entries created',
                message: `Created ${event.output.length} journal entries`,
                planPieces: context.planPieces,
                journalEntries: event.output,
              }
            }),
            raise({ type: 'DONE' }),
          ],
          target: 'closed',
        },
        onError: {
          actions: raise(({ event }) => {
            console.error('Error in buildJournalEntries:', event.error)
            return {
              type: 'UPDATE' as const,
              status: 'Error',
              message: 'Failed to build journal entries',
              error: event.error instanceof Error ? event.error.message : String(event.error),
            }
          }),
          target: 'error',
        },
      },
    },
    error: {
      entry: () => console.log('Entered error state'),
      type: 'final',
    },
    closed: {
      entry: () => console.log('Entered closed state'),
      type: 'final',
    },
  },
})

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
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  const workSheetJson = XLSX.utils.sheet_to_json(worksheet)
  console.log('Parsed worksheet:', workSheetJson)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      console.log('Starting ReadableStream')
      const actor = createActor(workPaperMachine, {
        input: {
          workSheetJson: workSheetJson as XLSX.Sheet2JSONOpts,
        },
      })
      actor.on('UPDATE', (event) => {
        console.log('Received UPDATE event:', event)
        const data = JSON.stringify(event)
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      })

      console.log('Starting actor')
      actor.start()
    },
  })

  console.log('Returning stream response')
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
