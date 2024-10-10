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

type FormData = z.infer<typeof formSchema>

interface StateMessage {
  status: string
  message: string
  error?: string
}

export default function Upload() {
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [stateMessages, setStateMessages] = useState<StateMessage[]>([])

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (values: FormData) => {
    setIsLoading(true)
    setStateMessages([])

    const formData = new FormData()
    formData.append("workpaper", values.workpaper)

    try {
      const response = await fetch("/api/upload-workpaper", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Network response was not ok")
      }

      const result = await response.json()
      setStateMessages([result])
    } catch (error) {
      console.error("Error:", error)
      setStateMessages([{ status: "error", message: "An error occurred while processing the file." }])
    } finally {
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
                <div key={msg.status + index} className="mb-2">
                  <strong>{msg.status.toUpperCase()}:</strong> {msg.message}
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
