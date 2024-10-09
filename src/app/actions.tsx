import OAuthClient from 'intuit-oauth';

export async function getIntuitAuthUri() {
  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID,
    clientSecret: process.env.INTUIT_CLIENT_ID,
    environment: 'sandbox',
    redirectUri: process.env.REDIRECT_URI,
  });

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'your-state', // Replace with your state parameter
  });

  console.log('Generated authUri:', authUri);

  return authUri;
}
