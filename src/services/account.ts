import { RestClient } from '../transport/restClient.js';
import { EP_ACCOUNT_INFO } from '../constants.js';
import { Account, accountsFromList } from '../models/account.js';
import { APIError } from '../exceptions.js';
import { Dict, isNoContent } from '../utils/converter.js';

/**
 * The server answers `{"code": 204}` instead of an empty array when there is nothing to list;
 * that yields an empty list. Any other non-array body is an error.
 */
function parseAccounts(data: unknown): Account[] {
  if (Array.isArray(data)) return accountsFromList(data as Dict[]);
  if (isNoContent(data)) return [];
  throw new APIError('Unexpected response format while listing accounts', undefined, undefined, data);
}

export class AccountService {
  constructor(private readonly restClient: RestClient) {}

  /** Get the list of accessible trading accounts. */
  async getAccountInfo(): Promise<Account[]> {
    const data = await this.restClient.get(EP_ACCOUNT_INFO);
    return parseAccounts(data);
  }
}
