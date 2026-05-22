import {OAuth2Client} from 'google-auth-library';
import {config} from '../config/env';

const REDIRECT_URI = config.GOOGLE_REDIRECT_URI;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export function createOAuthClient(): OAuth2Client{
    return new OAuth2Client(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        REDIRECT_URI,
    );
}

export function getAuthUrl(state: string) : string{
    const client = createOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state,
    });
}

export async function exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
}>{
    const client = createOAuthClient();
    const {tokens} = await client.getToken(code);

    if(!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date){
        throw new Error('Incomplete tokens received from Google');
    }

    return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
    };
}

export async function refreshTokens(refreshToken: string) : Promise<{
    accessToken: string,
    expiryDate: number;
}>{
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken});

    const { credentials } = await client.refreshAccessToken();

    if(!credentials.access_token || !credentials.expiry_date){
        throw new Error('Failed to obtain new access token from Google');
    }

    return {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date,
    }
}