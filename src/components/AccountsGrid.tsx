import { useMemo, useState, type CSSProperties } from "react";
import type { AccountSummary, UsageWindow } from "../types/app";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageCatalog } from "../i18n/catalog";
import { compareAccountsByRemaining } from "../utils/accountRanking";
import {
  formatPlan,
  formatWindowLabel,
  percent,
  planTone,
  remainingPercent,
} from "../utils/usage";
import { maskAccountLabel } from "../utils/accountOverview";

type AccountsGridProps = {
  accounts: AccountSummary[];
  loading: boolean;
  exportingAccounts: boolean;
  switchingId: string | null;
  togglingAccountKey: string | null;
  renamingAccountId: string | null;
  pendingDeleteId: string | null;
  onExport: (account: AccountSummary) => void;
  onReauthorize: (account: AccountSummary) => void;
  onRename: (account: AccountSummary, label: string) => Promise<boolean>;
  onSetEnabled: (account: AccountSummary, enabled: boolean) => void;
  onSwitch: (account: AccountSummary) => void;
  onDelete: (account: AccountSummary) => void;
};

type MeterTone = "ok" | "warn" | "danger" | "muted";
type MeterStyle = CSSProperties & { "--value": string };

const SOURCE_LABELS: Record<AccountSummary["sourceKind"], string> = {
  chatgpt: "ChatGPT",
  relay: "API",
};

function sortAccounts(left: AccountSummary, right: AccountSummary): number {
  if (left.isCurrent !== right.isCurrent) {
    return left.isCurrent ? -1 : 1;
  }
  if (left.enabled !== right.enabled) {
    return left.enabled ? -1 : 1;
  }
  return compareAccountsByRemaining(left, right);
}

function pickDefaultAccount(accounts: AccountSummary[]): AccountSummary | null {
  return accounts.find((account) => account.isCurrent) ?? accounts[0] ?? null;
}

function formatResetValue(epochSec: number | null | undefined, locale?: string) {
  if (!epochSec) {
    return "--";
  }

  return new Date(epochSec * 1000).toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelayEndpoint(baseUrl: string | null | undefined) {
  if (!baseUrl) {
    return "--";
  }

  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

function statusTone(account: AccountSummary): "ok" | "warn" | "danger" | "muted" {
  if (!account.enabled) {
    return "muted";
  }
  if (account.authRefreshBlocked || account.profileIntegrityError || account.profileLastValidationError) {
    return "danger";
  }
  if (account.authRefreshError || account.usageError || !account.profileAuthReady || !account.profileConfigReady) {
    return "warn";
  }
  return "ok";
}

function statusLabel(account: AccountSummary, copy: MessageCatalog) {
  if (!account.enabled) {
    return copy.accountsGrid.disabledStatus;
  }
  if (account.authRefreshBlocked) {
    return copy.accountsGrid.authBlockedStatus;
  }
  if (account.profileIntegrityError || account.profileLastValidationError) {
    return copy.accountsGrid.profileIssueStatus;
  }
  if (account.authRefreshError || account.usageError || !account.profileAuthReady || !account.profileConfigReady) {
    return copy.accountsGrid.needsActionStatus;
  }
  if (account.isCurrent) {
    return copy.accountsGrid.currentStatus;
  }
  return copy.accountsGrid.enabledStatus;
}

function meterTone(window: UsageWindow | null | undefined): MeterTone {
  if (!window) {
    return "muted";
  }
  if (window.usedPercent >= 100) {
    return "danger";
  }
  if (window.usedPercent >= 80) {
    return "warn";
  }
  return "ok";
}

function UsageMeter({
  label,
  resetLabel,
  resetValue,
  window,
}: {
  label: string;
  resetLabel?: string;
  resetValue?: string;
  window: UsageWindow | null | undefined;
}) {
  const remaining = remainingPercent(window ?? null);
  const style: MeterStyle = { "--value": `${remaining ?? 0}%` };

  return (
    <div className={`accountUsageMeter tone-${meterTone(window)}`}>
      <div className="accountUsageMeterHeader">
        <span>{label}</span>
        <strong>{percent(remaining)}</strong>
      </div>
      <div className="accountUsageTrack" aria-hidden="true">
        <span style={style} />
      </div>
      {resetLabel && resetValue ? (
        <p>
          {resetLabel}: {resetValue}
        </p>
      ) : null}
    </div>
  );
}

function AccountPlanBadge({ account }: { account: AccountSummary }) {
  const { copy } = useI18n();
  const plan = account.sourceKind === "relay" ? "api" : account.planType || account.usage?.planType;
  const tone = planTone(plan);
  return (
    <span className={`accountPlanBadge tone-${tone}`}>
      {formatPlan(plan, copy.accountCard.planLabels)}
    </span>
  );
}

function collectAccountErrors(account: AccountSummary): string[] {
  return [
    account.profileIntegrityError,
    account.profileLastValidationError,
    account.authRefreshError,
    account.usageError,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}

export function AccountsGrid({
  accounts,
  loading,
  exportingAccounts,
  switchingId,
  togglingAccountKey,
  renamingAccountId,
  pendingDeleteId,
  onExport,
  onReauthorize,
  onRename,
  onSetEnabled,
  onSwitch,
  onDelete,
}: AccountsGridProps) {
  const { copy, locale } = useI18n();
  const sortedAccounts = useMemo(() => [...accounts].sort(sortAccounts), [accounts]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    () => pickDefaultAccount(sortedAccounts)?.id ?? null,
  );
  const selectedAccount =
    sortedAccounts.find((account) => account.id === selectedAccountId) ??
    pickDefaultAccount(sortedAccounts);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const isEditingAlias = selectedAccount ? editingAccountId === selectedAccount.id : false;

  if (sortedAccounts.length === 0 && !loading) {
    return (
      <section className="accountsWorkspace" aria-busy={loading}>
        <div className="emptyState">
          <h3>{copy.accountsGrid.emptyTitle}</h3>
          <p>{copy.accountsGrid.emptyDescription}</p>
        </div>
      </section>
    );
  }

  const isSwitching = selectedAccount ? switchingId === selectedAccount.id : false;
  const isToggling = selectedAccount ? togglingAccountKey === selectedAccount.accountKey : false;
  const isRenaming = selectedAccount ? renamingAccountId === selectedAccount.accountKey : false;
  const isDeletePending = selectedAccount ? pendingDeleteId === selectedAccount.id : false;
  const selectedErrors = selectedAccount ? collectAccountErrors(selectedAccount) : [];
  const fiveHour = selectedAccount?.usage?.fiveHour ?? null;
  const oneWeek = selectedAccount?.usage?.oneWeek ?? null;
  const displayLabel = selectedAccount
    ? maskAccountLabel(
        selectedAccount.label ?? selectedAccount.email ?? selectedAccount.accountKey,
        copy.accountsPage.none,
      )
    : copy.accountsPage.none;
  const accountIdLabel = selectedAccount
    ? maskAccountLabel(selectedAccount.accountId || selectedAccount.accountKey, copy.accountsPage.none)
    : copy.accountsPage.none;

  const commitAliasEdit = async () => {
    if (!selectedAccount) {
      return;
    }
    const normalizedDraftLabel = draftLabel.trim();
    if (!normalizedDraftLabel) {
      setEditingAccountId(null);
      setDraftLabel("");
      return;
    }
    if (normalizedDraftLabel === selectedAccount.label.trim()) {
      setEditingAccountId(null);
      return;
    }
    const updated = await onRename(selectedAccount, normalizedDraftLabel);
    if (updated) {
      setEditingAccountId(null);
    }
  };

  return (
    <section className="accountsWorkspace" aria-busy={loading}>
      <div className="accountsTablePanel">
        <div className="accountsTableHeader">
          <div>
            <p className="sectionKicker">{copy.accountsGrid.tableKicker}</p>
            <h3>{copy.accountsGrid.tableTitle}</h3>
            <span>{copy.accountsGrid.tableDescription}</span>
          </div>
          <strong>{sortedAccounts.length}</strong>
        </div>

        <div className="accountsTableScroll">
          <table className="accountsTable">
            <thead>
              <tr>
                <th>{copy.accountsGrid.columnAccount}</th>
                <th>{copy.accountsGrid.columnStatus}</th>
                <th>{copy.accountsGrid.columnUsage}</th>
                <th>{copy.accountsGrid.columnProxy}</th>
                <th>{copy.accountsGrid.columnActions}</th>
              </tr>
            </thead>
            <tbody>
              {sortedAccounts.map((account) => {
                const rowSelected = selectedAccount?.id === account.id;
                const rowSwitching = switchingId === account.id;
                const rowLabel = maskAccountLabel(
                  account.label ?? account.email ?? account.accountKey,
                  copy.accountsPage.none,
                );
                const rowFiveHour = account.usage?.fiveHour ?? null;
                const rowOneWeek = account.usage?.oneWeek ?? null;

                return (
                  <tr
                    key={account.id}
                    tabIndex={0}
                    aria-selected={rowSelected}
                    className={`accountsTableRow ${rowSelected ? "isSelected" : ""} ${
                      account.enabled ? "" : "isDisabled"
                    }`}
                    onClick={() => setSelectedAccountId(account.id)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }
                      event.preventDefault();
                      setSelectedAccountId(account.id);
                    }}
                  >
                    <td>
                      <div className="accountIdentityCell">
                        <strong>{rowLabel}</strong>
                        <span>{SOURCE_LABELS[account.sourceKind]}</span>
                        <div className="accountIdentityBadges">
                          <AccountPlanBadge account={account} />
                          {account.isCurrent ? (
                            <span className="accountStateBadge isCurrent">
                              {copy.accountCard.currentStamp}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`accountStatusChip tone-${statusTone(account)}`}>
                        {statusLabel(account, copy)}
                      </span>
                    </td>
                    <td>
                      <div className="accountUsageInline">
                        <UsageMeter
                          label={formatWindowLabel(rowFiveHour, {
                            fallback: copy.accountCard.fiveHourFallback,
                            oneWeek: copy.accountCard.oneWeekLabel,
                            hourSuffix: copy.accountCard.hourSuffix,
                            minuteSuffix: copy.accountCard.minuteSuffix,
                          })}
                          window={rowFiveHour}
                        />
                        <UsageMeter
                          label={formatWindowLabel(rowOneWeek, {
                            fallback: copy.accountCard.oneWeekFallback,
                            oneWeek: copy.accountCard.oneWeekLabel,
                            hourSuffix: copy.accountCard.hourSuffix,
                            minuteSuffix: copy.accountCard.minuteSuffix,
                          })}
                          window={rowOneWeek}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="accountProxyCell">
                        <strong>
                          {account.enabled && !account.authRefreshBlocked
                            ? copy.accountsGrid.proxyReady
                            : copy.accountsGrid.proxyUnavailable}
                        </strong>
                        <span>{account.sourceKind === "relay" ? formatRelayEndpoint(account.apiBaseUrl) : "Codex"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="accountRowActions">
                        <button
                          type="button"
                          className="ghost accountRowButton"
                          disabled={rowSwitching || !account.enabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSwitch(account);
                          }}
                        >
                          {rowSwitching ? copy.accountCard.launching : copy.accountsGrid.actionSwitch}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="accountInspectorPanel">
        {selectedAccount ? (
          <>
            <div className="accountInspectorHero">
              <div>
                <p className="sectionKicker">{copy.accountsPage.inspectorTitle}</p>
                {isEditingAlias ? (
                  <label className="accountInspectorAliasEditor">
                    <span className="visuallyHidden">{copy.accountCard.aliasInputLabel}</span>
                    <input
                      value={draftLabel}
                      maxLength={60}
                      autoFocus
                      disabled={isRenaming}
                      onChange={(event) => setDraftLabel(event.target.value)}
                      onBlur={() => {
                        void commitAliasEdit();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingAccountId(null);
                          setDraftLabel("");
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                ) : (
                  <h3>{displayLabel}</h3>
                )}
              </div>
              <div className="accountInspectorBadges">
                <AccountPlanBadge account={selectedAccount} />
                <span className={`accountStatusChip tone-${statusTone(selectedAccount)}`}>
                  {statusLabel(selectedAccount, copy)}
                </span>
              </div>
            </div>

            <div className="accountInspectorActions">
              <button
                type="button"
                className="primary"
                disabled={isSwitching || !selectedAccount.enabled}
                onClick={() => onSwitch(selectedAccount)}
              >
                {isSwitching ? copy.accountCard.launching : copy.accountCard.launch}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={isToggling}
                onClick={() => onSetEnabled(selectedAccount, !selectedAccount.enabled)}
              >
                {selectedAccount.enabled ? copy.accountCard.disableAccount : copy.accountCard.enableAccount}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={exportingAccounts}
                onClick={() => onExport(selectedAccount)}
              >
                {copy.addAccount.exportButton}
              </button>
              {selectedAccount.sourceKind === "chatgpt" ? (
                <button type="button" className="ghost" onClick={() => onReauthorize(selectedAccount)}>
                  {copy.accountCard.reauthorize}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                disabled={isEditingAlias || isRenaming}
                onClick={() => {
                  setDraftLabel(selectedAccount.label);
                  setEditingAccountId(selectedAccount.id);
                }}
              >
                {copy.accountCard.editAlias}
              </button>
              <button
                type="button"
                className={`dangerButton ${isDeletePending ? "isPending" : ""}`}
                onClick={() => onDelete(selectedAccount)}
              >
                {isDeletePending ? copy.accountCard.deleteConfirm : copy.accountCard.delete}
              </button>
            </div>

            <section className="accountInspectorSection">
              <h4>{copy.accountsGrid.inspectorUsageTitle}</h4>
              <div className="accountInspectorUsage">
                <UsageMeter
                  label={formatWindowLabel(fiveHour, {
                    fallback: copy.accountCard.fiveHourFallback,
                    oneWeek: copy.accountCard.oneWeekLabel,
                    hourSuffix: copy.accountCard.hourSuffix,
                    minuteSuffix: copy.accountCard.minuteSuffix,
                  })}
                  resetLabel={copy.accountCard.resetAt}
                  resetValue={formatResetValue(fiveHour?.resetAt, locale)}
                  window={fiveHour}
                />
                <UsageMeter
                  label={formatWindowLabel(oneWeek, {
                    fallback: copy.accountCard.oneWeekFallback,
                    oneWeek: copy.accountCard.oneWeekLabel,
                    hourSuffix: copy.accountCard.hourSuffix,
                    minuteSuffix: copy.accountCard.minuteSuffix,
                  })}
                  resetLabel={copy.accountCard.resetAt}
                  resetValue={formatResetValue(oneWeek?.resetAt, locale)}
                  window={oneWeek}
                />
              </div>
            </section>

            <section className="accountInspectorSection">
              <h4>{copy.accountsGrid.inspectorDetailsTitle}</h4>
              <dl className="accountInspectorDetails">
                <div>
                  <dt>{copy.accountsGrid.sourceLabel}</dt>
                  <dd>{SOURCE_LABELS[selectedAccount.sourceKind]}</dd>
                </div>
                <div>
                  <dt>{copy.accountsGrid.accountIdLabel}</dt>
                  <dd>{accountIdLabel}</dd>
                </div>
                <div>
                  <dt>{copy.accountCard.endpointLabel}</dt>
                  <dd>
                    {selectedAccount.sourceKind === "relay"
                      ? formatRelayEndpoint(selectedAccount.apiBaseUrl)
                      : "Codex OAuth"}
                  </dd>
                </div>
                <div>
                  <dt>{copy.accountCard.modelLabel}</dt>
                  <dd>{selectedAccount.modelName ?? "--"}</dd>
                </div>
                {selectedAccount.balanceText ? (
                  <div>
                    <dt>{copy.accountCard.balanceLabel}</dt>
                    <dd>{selectedAccount.balanceText}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{copy.accountsGrid.profileReadyLabel}</dt>
                  <dd>
                    {selectedAccount.profileAuthReady && selectedAccount.profileConfigReady
                      ? copy.accountsGrid.yes
                      : copy.accountsGrid.no}
                  </dd>
                </div>
              </dl>
            </section>

            {selectedErrors.length > 0 ? (
              <section className="accountInspectorSection">
                <h4>{copy.accountsGrid.errorTitle}</h4>
                <div className="accountInspectorErrors">
                  {selectedErrors.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="accountInspectorEmpty">
            <h3>{copy.accountsGrid.inspectorEmptyTitle}</h3>
            <p>{copy.accountsGrid.inspectorEmptyDescription}</p>
          </div>
        )}
      </aside>
    </section>
  );
}
