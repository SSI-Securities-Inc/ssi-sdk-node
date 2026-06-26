import { RestClient } from '../transport/restClient.js';
import { EP_ACCOUNT_INFO } from '../constants.js';
import { Account } from '../models/account.js';
import { AccountType } from '../enums/account.js';
import { toInt } from '../utils/converter.js';

export class AccountService {
  constructor(private readonly restClient: RestClient) {}

  async getAccountInfo(): Promise<Account[]> {
    const data = await this.restClient.get<{ data: unknown[] }>(EP_ACCOUNT_INFO);
    const items = (data as { data: unknown[] }).data ?? [];
    return items.map((raw: unknown) => {
      const r = raw as Record<string, unknown>;
      return {
        accountNo: String(r['accountNo'] ?? ''),
        accountType: (r['accountType'] as AccountType) ?? AccountType.EQUITY,
      };
    });
  }
}
