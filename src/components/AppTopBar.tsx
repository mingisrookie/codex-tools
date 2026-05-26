import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

type AppTopBarProps = {
  onRefresh: () => void;
  refreshing: boolean;
  onGoHome: () => void;
  showRefresh: boolean;
  usageRefreshIntervalMinutes: number;
  savingSettings: boolean;
  onUsageRefreshIntervalChange: (minutes: number) => void;
};

const MIN_USAGE_REFRESH_INTERVAL_MINUTES = 1;
const MAX_USAGE_REFRESH_INTERVAL_MINUTES = 1_440;

function normalizeUsageRefreshIntervalDraft(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return MIN_USAGE_REFRESH_INTERVAL_MINUTES;
  }
  return Math.max(
    MIN_USAGE_REFRESH_INTERVAL_MINUTES,
    Math.min(MAX_USAGE_REFRESH_INTERVAL_MINUTES, parsed),
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`iconGlyph ${spinning ? "isSpinning" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function AppTopBar({
  onRefresh,
  refreshing,
  onGoHome,
  showRefresh,
  usageRefreshIntervalMinutes,
  savingSettings,
  onUsageRefreshIntervalChange,
}: AppTopBarProps) {
  const { copy } = useI18n();
  const [refreshIntervalDraft, setRefreshIntervalDraft] = useState(
    String(usageRefreshIntervalMinutes),
  );

  useEffect(() => {
    setRefreshIntervalDraft(String(usageRefreshIntervalMinutes));
  }, [usageRefreshIntervalMinutes]);

  const commitRefreshInterval = () => {
    const next = normalizeUsageRefreshIntervalDraft(refreshIntervalDraft);
    setRefreshIntervalDraft(String(next));
    if (next !== usageRefreshIntervalMinutes) {
      onUsageRefreshIntervalChange(next);
    }
  };

  return (
    <header className="topbar">
      <button type="button" className="brandLine homeLink" onClick={onGoHome}>
        <img className="appLogo" src="/codex-tools.png" alt={copy.topBar.logoAlt} />
        <h1>{copy.topBar.appTitle}</h1>
      </button>
      <div className="topDragRegion" data-tauri-drag-region aria-hidden="true" />
      <div className="topActions">
        {showRefresh ? (
          <>
            <label
              className="usageRefreshControl"
              title={copy.topBar.usageRefreshIntervalHint}
            >
              <span className="usageRefreshLabel">
                {copy.topBar.usageRefreshIntervalLabel}
              </span>
              <input
                className="usageRefreshInput"
                inputMode="numeric"
                value={refreshIntervalDraft}
                disabled={savingSettings}
                aria-label={copy.topBar.usageRefreshIntervalLabel}
                onChange={(event) =>
                  setRefreshIntervalDraft(event.target.value.replace(/\D/g, ""))
                }
                onBlur={commitRefreshInterval}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setRefreshIntervalDraft(String(usageRefreshIntervalMinutes));
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="usageRefreshUnit">
                {copy.topBar.usageRefreshIntervalUnit}
              </span>
            </label>
            <button
              className="iconButton primary"
              onClick={onRefresh}
              disabled={refreshing}
              title={refreshing ? copy.topBar.refreshing : copy.topBar.manualRefresh}
              aria-label={refreshing ? copy.topBar.refreshing : copy.topBar.manualRefresh}
            >
              <RefreshIcon spinning={refreshing} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
