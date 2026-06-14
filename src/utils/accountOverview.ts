import type { AccountSummary } from "../types/app";

export type AccountOverview = {
  total: number;
  active: number;
  exhausted: number;
  attention: number;
  currentLabel: string;
  proxyReady: number;
  healthy: number;
};

export function maskAccountLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.includes("@")) {
    const [name, domain] = trimmed.split("@");
    const first = name?.[0] ?? "*";
    return `${first}***@${domain}`;
  }
  if (trimmed.length > 12) {
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
  }
  return trimmed;
}

export function buildAccountOverview(accounts: AccountSummary[], emptyLabel: string): AccountOverview {
  const active = accounts.filter((account) => account.enabled).length;
  const exhausted = accounts.filter((account) => {
    const fiveHour = account.usage?.fiveHour?.usedPercent ?? 0;
    const oneWeek = account.usage?.oneWeek?.usedPercent ?? 0;
    return fiveHour >= 100 || oneWeek >= 100;
  }).length;
  const attention = accounts.filter((account) =>
    Boolean(
      account.usageError ||
        account.authRefreshBlocked ||
        account.authRefreshError ||
        account.profileIntegrityError ||
        account.profileLastValidationError ||
        !account.profileAuthReady ||
        !account.profileConfigReady,
    ),
  ).length;
  const current = accounts.find((account) => account.isCurrent) ?? null;

  return {
    total: accounts.length,
    active,
    exhausted,
    attention,
    currentLabel: maskAccountLabel(
      current?.label ?? current?.email ?? current?.accountKey,
      emptyLabel,
    ),
    proxyReady: accounts.filter((account) => account.enabled && !account.authRefreshBlocked).length,
    healthy: Math.max(0, active - attention),
  };
}
