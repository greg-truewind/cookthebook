"use client"

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

console.log('page.tsx loaded');

const formSchema = z.object({
  workpaper: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'Please select a file')
    .refine(
      (file) => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type),
      'File must be an Excel document (.xlsx or .xls)',
    ),
})

type FormData = z.infer<typeof formSchema>

interface JournalEntry {
  piece: string | { operation: string; payload: unknown };
  entry: string;
  synced?: boolean;
}

interface StateMessage {
  status: string
  message: string
  error?: string
  planPieces?: string[]
  journalEntries?: JournalEntry[]
  operation?: string
  payload?: unknown
}

export default function Upload() {
  console.log('Upload component rendered');
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [stateMessages, setStateMessages] = React.useState<StateMessage[]>([])
  const [planPieces, setPlanPieces] = React.useState<string[]>([])
  const [journalEntries, setJournalEntries] = React.useState<JournalEntry[]>([])
  const [latestMessage, setLatestMessage] = React.useState<string>('')

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const obtainAPIResponse = async (fileId: string) => {
    const response = await fetch(`/api/stream?fileId=${encodeURIComponent(fileId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })

    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        const decodedValue = decoder.decode(value)
        const messages = decodedValue.split('\n\n')
        for (const msg of messages) {
          if (msg.trim() !== '') {
            const message = msg.replace('data: ', '').trim()
            try {
              const parsedMessage = JSON.parse(message) as StateMessage
              console.log('Parsed message:', parsedMessage)
              setStateMessages((prev) => [...prev, parsedMessage])
              if (parsedMessage.planPieces) {
                setPlanPieces(parsedMessage.planPieces)
              }
              if (parsedMessage.journalEntries) {
                setJournalEntries(parsedMessage.journalEntries)
              }
              setLatestMessage(parsedMessage.message || '')
            } catch (error) {
              console.error('Error parsing message:', error)
              console.error('Raw message:', message)
            }
          }
        }
      }
    }
  }

  const syncToQuickBooks = async (entry: JournalEntry, index: number) => {
    // Here you would implement the actual sync logic
    console.log('Syncing to QuickBooks:', entry);
    
    // Simulating an API call
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsLoading(false);

    // Update the entry's synced status
    setJournalEntries(entries =>
      entries.map((e, i) => i === index ? { ...e, synced: true } : e)
    );
  };

  const onSubmit = async (values: FormData) => {
    console.log('Form submitted with values:', values)
    setIsLoading(true)
    setStateMessages([])
    setPlanPieces([])
    setJournalEntries([])

    const formData = new FormData()
    formData.append('workpaper', values.workpaper)

    try {
      console.log('Sending POST request to /api/upload')
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const { fileId } = await response.json()
      if (!fileId) {
        throw new Error('No fileId returned from server')
      }

      await obtainAPIResponse(fileId)
    } catch (error) {
      console.error('Error:', error)
      setStateMessages([{ status: 'error', message: error instanceof Error ? error.message : 'An unknown error occurred' }])
    } finally {
      setIsLoading(false)
    }
  }

  const renderMessageContent = (msg: StateMessage) => {
    if (msg.operation && msg.payload) {
      return (
        <>
          <strong>{msg.operation}:</strong> {JSON.stringify(msg.payload)}
        </>
      )
    }
    return (
      <>
        <strong>{msg.status}:</strong> {msg.message}
        {msg.error && <p className="text-red-500">Error: {msg.error}</p>}
      </>
    )
  }

  console.log('Rendering Upload component')
  return (
    <div className="container mx-auto p-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid w-full max-w-sm items-center gap-1.5 mb-8">
          <FormField
            control={form.control}
            name="workpaper"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work Paper or Transactions</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        console.log('File selected:', file.name)
                        field.onChange(file)
                      }
                    }}
                  />
                </FormControl>
                {form.formState.errors.workpaper && <p className="text-red-500">{form.formState.errors.workpaper.message}</p>}
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isLoading} className="mt-2">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </form>
      </Form>

      {latestMessage && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Latest Update</CardTitle>
          </CardHeader>
          <CardContent>
            <pre>{typeof latestMessage === 'string' ? latestMessage : JSON.stringify(latestMessage, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      {stateMessages.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Processing Status</CardTitle>
          </CardHeader>
          <CardContent>
            {stateMessages.map((msg, index) => (
              <div key={`${msg.status || msg.operation || ''}-${index}`} className="mb-2">
                {renderMessageContent(msg)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {planPieces.length > 0 && journalEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Plan Pieces and Journal Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Plan Piece</TableHead>
                  <TableHead className="w-1/3">Journal Entry</TableHead>
                  <TableHead className="w-1/3">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journalEntries.map((entry, index) => (
                  <TableRow key={`entry-${index}`}>
                    <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden">
                      {typeof entry.piece === 'string' ? entry.piece : entry.piece.operation}
                    </TableCell>
                    <TableCell className="max-w-xs truncate whitespace-nowrap overflow-hidden">
                      {typeof entry.entry === 'string' ? entry.entry : JSON.stringify(entry.entry)}
                    </TableCell>
                    <TableCell>
                      <Button 
                        onClick={() => syncToQuickBooks(entry, index)} 
                      >
                        {entry.synced ? 'Synced' : 'Sync to QuickBooks'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && stateMessages.length === 0 && !latestMessage && <p>No messages received yet.</p>}
    </div>
  )
}
