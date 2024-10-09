import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import { fstat } from 'fs';

export async function GET(request: NextRequest) {
  const oauthClient = new OAuthClient({
    clientId: process.env.CLIENT_ID!,
    clientSecret: process.env.CLIENT_SECRET!,
    environment: 'sandbox', // or 'production'
    redirectUri: process.env.REDIRECT_URI!,
  });

  const url = new URL(request.url);
  const query = url.searchParams.toString();

  try {
    const parseRedirect = await oauthClient.createToken(query);

    // Handle token as needed (e.g., store in database, session, etc.)
    console.log('Access Token:', parseRedirect.getJson());

    return NextResponse.redirect('/');
  } catch (error) {
    console.error('Error obtaining access token:', error);

    return NextResponse.json({ error: 'Failed to obtain access token.' }, { status: 500 });
  }
}
