import { BadRequestException } from '@nestjs/common';
 
interface OAuthState {
  redirectPath: string;
  referralCode?: string;
}

export const createOAuthState = (redirectPath: string, referralCode?: string): string => {
  const stateObject: OAuthState = {
    redirectPath,
  };
  if (referralCode) {
    stateObject.referralCode = referralCode;
  }
  const jsonString = JSON.stringify(stateObject);
  return Buffer.from(jsonString).toString('base64');
};

export const parseOAuthState = (state: string): OAuthState => {
  try {
    const decodedString = Buffer.from(state, 'base64').toString('utf8');
    const stateObject: OAuthState = JSON.parse(decodedString);

    if (typeof stateObject.redirectPath !== 'string') {
      throw new BadRequestException('Invalid OAuth state');
    }

    return stateObject;
  } catch (error) {
    console.error('Error parsing OAuth state:', error);
    throw new BadRequestException('Invalid OAuth state');
  }
};