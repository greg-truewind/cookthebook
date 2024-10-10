import { NextResponse, type NextRequest } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'
import * as XLSX from 'xlsx'
import { createMachine, createActor, assign, fromPromise, raise } from 'xstate'
import { PassThrough } from 'node:stream'
import fs from 'node:fs'
import { systemPrompt } from './system-prompt'

// Remove unused imports
// import { AnyActorRef, AnyEventObject } from 'xstate';

interface WorkPaperContext {
  workSheetJson: XLSX.Sheet2JSONOpts
  planPieces?: string[]
  journalEntries?: Array<{ piece: string; entry: string }>
}

interface StateMessage {
  status: string
  message: string
  error?: string
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
            model: openai('gpt-4o'),
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
            input.planPieces?.map((piece: string) =>
              generateText({
                model: openai('gpt-4o'),
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

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  console.log('GET request received in /api/stream')
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')

  if (!fileId) {
    console.error('No fileId provided')
    return NextResponse.json({ error: 'No fileId provided' }, { status: 400 })
  }

  const filePath = `/tmp/uploads/${fileId}`

  try {
    const fileBuffer = await fs.promises.readFile(filePath)
    const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)

    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const workSheetJson = XLSX.utils.sheet_to_json(worksheet)

    const stream = new PassThrough()

    const actor = createActor(workPaperMachine, {
      input: {
        workSheetJson: workSheetJson as XLSX.Sheet2JSONOpts,
      },
    })

    actor.subscribe((snapshot) => {
      console.log('Received snapshot:', snapshot)
      const { context, value } = snapshot
      
      const messageToSend: StateMessage = {
        status: typeof value === 'string' ? value : Object.keys(value)[0],
        message: `Current state: ${JSON.stringify(value)}`,
        planPieces: context.planPieces,
        journalEntries: context.journalEntries,
      }
      
      console.log('Sending message:', messageToSend)
      stream.write(`data: ${JSON.stringify(messageToSend)}\n\n`)
    })

    actor.start()

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error reading file:', error)
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 })
  }
}
