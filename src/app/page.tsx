import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getIntuitAuthUri } from "./actions"

export default async function Home() {
  const authUri = await getIntuitAuthUri()

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center justify-center">
        <div className="text-2xl">Create journal entries from any workpaper</div>
        <Button>
          <Link href={authUri}>Connect with Intuit</Link>
        </Button>
      </main>
    </div>
  )
}
