"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form"
import { Loader2 } from "lucide-react"

const formSchema = z.object({
  workpaper: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'Please select a file')
    .refine(
      (file) => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type),
      'File must be an Excel document (.xlsx or .xls)'
    ),
})

export default function Upload() {
  const [output, setOutput] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setOutput("")
    setIsLoading(true)

    const formData = new FormData()
    formData.append('workpaper', values.workpaper)

    const response = await fetch('/api/upload-workpaper', {
      method: 'POST',
      body: formData,
    })

    if (!response.body) {
      console.error('No response body')
      setIsLoading(false)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let done = false

    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      const chunkValue = decoder.decode(value)
      setOutput((prev) => prev + chunkValue)
    }

    setIsLoading(false)
  }

  return (
    <div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full max-w-sm items-center gap-1.5"
        >
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
                      const file = e.target.files?.[0];
                      if (file) {
                        field.onChange(file);
                      }
                    }}
                  />
                </FormControl>
                {form.formState.errors.workpaper && (
                  <p className="text-red-500">
                    {form.formState.errors.workpaper.message}
                  </p>
                )}
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
      <div className="mt-4">
        <pre>{output}</pre>
      </div>
    </div>
  )
}
