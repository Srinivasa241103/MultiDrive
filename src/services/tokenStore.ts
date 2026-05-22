import { db } from "../db/client";
import { encrypt, decrypt, getKey } from "./cipher";
import { refreshTokens } from "./oauthService";
import { CONSTANTS } from "../config/constants";
import { logger } from "../utils/logger";
import { TokenExpiredError } from "../utils/errors";


export async function saveTokens(
    accountId: string,
    tokens: {accessToken: string; refreshToken: string; expiryDate: number},
): Promise<void> {
    const key = await getKey();
    const encryptedRefreshToken = encrypt(Buffer.from(tokens.refreshToken, 'utf8'), key);
    await db.account.update({
        where: {id: accountId},
        data: {
            encryptedRefreshToken: encryptedRefreshToken.toString('base64'),
            accessToken: tokens.accessToken,
            tokenExpiresAt: new Date(tokens.expiryDate),
        },
    });
}

export async function getValidAccessToken(accountId: string): Promise<string> {
    const account = await db.account.findUniqueOrThrow({
        where: {id: accountId},
    });

    const expiresAt = account.tokenExpiresAt?.getTime() ?? 0;
    const needsRefresh = !account.accessToken || Date.now() + CONSTANTS.TOKEN_REFRESH_BUFFER_MS >= expiresAt;

    if(!needsRefresh){
        return account.accessToken!;
    }

    if(!account.encryptedRefreshToken){
        throw new TokenExpiredError(
            `No refresh token stored for account ${accountId}`,
        );
    }

    const key = await getKey();
    const refreshToken = decrypt(
        Buffer.from(account.encryptedRefreshToken, 'base64'),
        key,
    ).toString('utf8');

    let fresh: {accessToken: string; expiryDate: number};

    try{
        fresh = await refreshTokens(refreshToken);
    }catch(err: any){
        const isInvalidGrant = err?.response?.data?.error === 'invalid_grant' ||
            String(err?.message).includes('invalid_grant');
        if (isInvalidGrant) {
            await db.account.update({
                where: { id: accountId },
                data: { health: false },
            });
            throw new TokenExpiredError(
                `Refresh token expired for account ${accountId} — re-link required`,
            );
        }

        throw err;
    }

    await db.account.update({
        where: {id: accountId},
        data:{
            accessToken: fresh.accessToken,
            tokenExpiresAt: new Date(fresh.expiryDate),
        }
    });
    logger.info({accountId}, 'access token refreshed');

    return fresh.accessToken;
}

export async function revokeTokens(accountId: string): Promise<void> {
  await db.account.update({
    where: { id: accountId },
    data: {
      accessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      health: false,
    },
  });
}