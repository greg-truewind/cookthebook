"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form"
import { Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const formSchema = z.object({
  workpaper: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Please select a file")
    .refine(
      (file) => ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"].includes(file.type),
      "File must be an Excel document (.xlsx or .xls)",
    ),
})

export default function Upload() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [outputData, setOutputData] = useState<any>(null)
  const [stateMessages, setStateMessages] = useState<any[]>([])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true)
    setOutputData(null)
    setStateMessages([])

    const formData = new FormData()
    formData.append("workpaper", values.workpaper)

    const response = await fetch("/api/upload-workpaper", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      console.error("Network response was not ok")
      setIsLoading(false)
      return
    }

    // Listen for Server-Sent Events
    const eventSource = new EventSource("/api/upload-workpaper")

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log("Received event:", data)

      setStateMessages((prev) => [...prev, data])

      if (data.state === "success" || data.state === "failure" || data.state === "error") {
        eventSource.close()
        setIsLoading(false)
      }
    }

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err)
      eventSource.close()
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid w-full max-w-sm items-center gap-1.5">
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
              "Upload"
            )}
          </Button>
        </form>
      </Form>

      {stateMessages.length > 0 && (
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Processing Status</CardTitle>
            </CardHeader>
            <CardContent>
              {stateMessages.map((msg, index) => (
                <div key={index} className="mb-2">
                  <strong>{msg.state.toUpperCase()}:</strong> {msg.message}
                  {msg.error && <p className="text-red-500">Error: {msg.error}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
