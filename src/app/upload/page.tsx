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

interface StateMessage {
  status: string
  message: string
  error?: string
  planPieces?: string[]
  journalEntries?: Array<{ piece: string; entry: string }>
}

export default function Upload() {
  console.log('Upload component rendered');
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [stateMessages, setStateMessages] = React.useState<StateMessage[]>([])
  const [planPieces, setPlanPieces] = React.useState<string[]>([])
  const [journalEntries, setJournalEntries] = React.useState<Array<{ piece: string; entry: string }>>([])

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (values: FormData) => {
    console.log('Form submitted with values:', values);
    setIsLoading(true)
    setStateMessages([])
    setPlanPieces([])
    setJournalEntries([])

    const formData = new FormData()
    formData.append('workpaper', values.workpaper)

    try {
      console.log('Sending POST request to /api/upload');
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      console.log('Response received, status:', response.status);
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Unable to read response')
      }

      const decoder = new TextDecoder()
      let doneReading = false

      while (!doneReading) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('Finished reading response');
          doneReading = true
          break
        }

        const chunk = decoder.decode(value)
        console.log('Received chunk:', chunk)

        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StateMessage
              console.log('Parsed data:', data)
              setStateMessages((prev) => {
                console.log('Updating state messages:', [...prev, data]);
                return [...prev, data];
              })
              if (data.planPieces) {
                console.log('Updating plan pieces:', data.planPieces);
                setPlanPieces(data.planPieces)
              }
              if (data.journalEntries) {
                console.log('Updating journal entries:', data.journalEntries);
                setJournalEntries(data.journalEntries)
              }
            } catch (error) {
              console.error('Error parsing JSON:', error)
              setStateMessages((prev) => [
                ...prev,
                { status: 'error', message: 'Error parsing server response', error: error instanceof Error ? error.message : String(error) },
              ])
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
      setStateMessages([{ status: 'error', message: error instanceof Error ? error.message : 'An unknown error occurred' }])
    } finally {
      setIsLoading(false)
      console.log('Final state:', { stateMessages, planPieces, journalEntries });
    }
  }

  console.log('Rendering Upload component');
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
                        console.log('File selected:', file.name);
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

      {stateMessages.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Processing Status</CardTitle>
          </CardHeader>
          <CardContent>
            {stateMessages.map((msg, index) => (
              <div key={`${msg.status}-${index}`} className="mb-2">
                <strong>{msg.status}:</strong> {msg.message}
                {msg.error && <p className="text-red-500">Error: {msg.error}</p>}
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
                  <TableHead>Plan Piece</TableHead>
                  <TableHead>Journal Entry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journalEntries.map((entry) => (
                  <TableRow key={`entry-${entry.piece}`}>
                    <TableCell>{entry.piece}</TableCell>
                    <TableCell>{entry.entry}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isLoading && stateMessages.length === 0 && (
        <p>No messages received yet.</p>
      )}
    </div>
  )
}
