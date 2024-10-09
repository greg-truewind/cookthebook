import { type NextRequest, NextResponse } from "next/server"
import OAuthClient from "intuit-oauth"
import { redirect } from "next/navigation"

export async function GET(request: NextRequest) {
  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID!,
    clientSecret: process.env.INTUIT_SECRET_KEY!,
    environment: "sandbox", // or 'production'
    redirectUri: process.env.REDIRECT_URI!,
  })

  const url = new URL(request.url)
  const query = url.searchParams.toString()

  const token = await oauthClient.createToken(query)

  console.log("Access Token:", token)
  redirect("/upload")
}
